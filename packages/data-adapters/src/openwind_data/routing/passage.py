"""Passage time + complexity estimation along a polyline of waypoints.

V1 design choices:

- **Single-pass approximation** (challenge #7): we do not iterate until convergence
  on segment timings. We first lay out per-segment mid-times using a constant
  heuristic speed (6 kn), fetch wind at each mid-time/mid-position, then compute
  the actual speed and accumulate true durations. The bias is bounded for typical
  Mediterranean passages because the wind window we hit is shifted by at most a
  few hours, which is well within the temporal correlation length of the forecast.
- **Efficiency factor 0.75** (challenge #8): polars are ORC theoretical maxima.
  Real-world cruising (sail trim, comfort margins, sea state, helmsman, currents)
  costs ~25%. See `docs/boat-archetypes.md`. Override via the `efficiency` arg.
- **Wind only** (no wave-driven slow-down in V1). Sea state feeds `warnings`,
  not `boat_speed`.
- **No tack handling**: TWA in [0, 180] only; polars are symmetric.
"""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from itertools import pairwise

from openwind_data.adapters.base import (
    ForecastBundle,
    ForecastHorizonError,
    MarineDataAdapter,
    SeaPoint,
    WindPoint,
)
from openwind_data.adapters.openmeteo import (
    AUTO_FALLBACK_CHAIN,
    AUTO_MODEL,
    DEFAULT_MODEL,
    OpenMeteoAdapter,
)
from openwind_data.currents.narrow_pass import confidence_for_point
from openwind_data.routing.archetypes import (
    BoatPolar,
    effective_min_upwind_twa,
    get_polar,
    grid_min_sailable_twa,
    lookup_polar,
)
from openwind_data.routing.geometry import (
    Point,
    haversine_distance,
    midpoint,
    normalize_twa,
    segment_route,
)

HEURISTIC_SPEED_KN = 6.0
WIND_FETCH_WINDOW = timedelta(hours=3)
MIN_BOAT_SPEED_KN = 0.5  # floor to avoid division blow-up in extreme stalls

# Strong-wind and sea-state warnings are emitted by `score_complexity` (which
# also reports affected route distance). Only the light-wind warning lives here
# because complexity doesn't model boat-speed stalls.
LIGHT_WIND_THRESHOLD_KN = 3.0  # under this min boat speed, surface "vent faible"

PREWARM_MIN_SPEED_KN = 2.0  # conservative floor to upper-bound passage duration for cache prewarm
MAX_SWEEP_WINDOWS = 336  # 14 days x 24h hard cap

# Sample-cap heuristic: long passages would otherwise issue 20+ Open-Meteo
# fetches per window. Auto-stretch segment_length_nm so we sample at most
# MAX_SAMPLED_SEGMENTS points per route, but keep a [MIN, MAX] band so we
# never go below ~10 nm precision (Med thermal/local winds matter at that
# scale) nor above ~30 nm (would skip whole regimes like the mistral cutoff
# at Cap Sicié).
MAX_SAMPLED_SEGMENTS = 10
MIN_SEG_LENGTH_NM = 10.0
MAX_SEG_LENGTH_NM = 30.0

# Wave derate — see README "References" section for sources.
WAVE_DERATE_K = 0.05
WAVE_DERATE_P = 1.75
WAVE_DERATE_FLOOR = 0.5


def _resolve_segment_length(
    waypoints: list[Point], requested_nm: float
) -> tuple[float, float | None]:
    """Return (effective_segment_length_nm, route_total_nm_if_capped).

    If the requested length would yield more than MAX_SAMPLED_SEGMENTS sample
    points, stretch it (clamped to [MIN_SEG_LENGTH_NM, MAX_SEG_LENGTH_NM]) and
    return the route distance so the caller can build a warning. Returns
    ``(requested_nm, None)`` when no cap applies. Pure function of inputs, so
    safe to call repeatedly along a code path without changing the result.
    """
    total = sum(haversine_distance(a, b) for a, b in pairwise(waypoints))
    target = total / MAX_SAMPLED_SEGMENTS
    if target <= requested_nm:
        return requested_nm, None
    effective = min(MAX_SEG_LENGTH_NM, max(MIN_SEG_LENGTH_NM, target))
    if effective <= requested_nm:
        return requested_nm, None
    return effective, total


def wave_derate(hs_m: float, twa_deg: float) -> float:
    """Multiplicative speed factor in waves; returns 1.0 in flat water.

    Form: ``max(floor, 1 - k * Hs^p * f(TWA))`` with ``f(TWA) = cos²(TWA/2)``
    peaking head-seas (TWA=0) and zero down-seas (TWA=180). Defaults
    ``k=0.05``, ``p=1.75``, ``floor=0.5`` see README for sourcing.
    """
    if hs_m < 0:
        raise ValueError("hs_m must be >= 0")
    angular_factor = math.cos(math.radians(twa_deg / 2)) ** 2
    return max(WAVE_DERATE_FLOOR, 1.0 - WAVE_DERATE_K * hs_m**WAVE_DERATE_P * angular_factor)


def best_vmg_upwind(polar: BoatPolar, tws_kn: float) -> tuple[float, float]:
    """Return (optimal_twa_deg, polar_speed_kn) that maximises VMG upwind.

    Sweeps TWA from the boat's minimum upwind angle to 90 deg to find the angle
    maximising polar(twa) * cos(twa). Sweeping below that floor is wrong twice
    over: `lookup_polar` clamps flat under the first grid angle while cos(twa)
    keeps rising (which used to pin the optimum at the old 30-deg sweep floor
    for every archetype), and grids carrying a 0-deg row of zeros would let
    interpolated half-zero speeds win on geometry alone.
    Returns the optimal TWA and the polar speed at that angle (not the VMG value
    itself), so the caller can compute the tacking-geometry correction:
      effective_speed = polar_speed * cos(optimal_twa - segment_twa)
    """
    # The sweep floor is the boat's min upwind angle, but never below the
    # grid's real data: a user pinning tighter than the polar's first angle
    # would put the sweep back on clamp-flat speeds where cos alone decides
    # (the historical 30-deg bug). Pinching below the data cannot beat the
    # polar's VMG, so the extension is display-only on the client side.
    floor_deg = max(effective_min_upwind_twa(polar), grid_min_sailable_twa(polar))
    floor = min(90, max(0, math.ceil(floor_deg)))
    best_twa, best_speed, best_vmg = float(floor), 0.0, 0.0
    for twa_int in range(floor, 91):
        twa = float(twa_int)
        sp = lookup_polar(polar, tws_kn, twa)
        vmg = sp * math.cos(math.radians(twa))
        if vmg > best_vmg:
            best_vmg = vmg
            best_twa = twa
            best_speed = sp
    return best_twa, best_speed


def _categorize_twa(twa_deg: float) -> str:
    if twa_deg < 45.0:
        return "pres"
    elif twa_deg < 90.0:
        return "travers"
    elif twa_deg < 135.0:
        return "largue"
    else:
        return "portant"


def build_conditions_summary(report: PassageReport) -> dict:
    tws = [s.tws_kn for s in report.segments]
    counts: dict[str, int] = {}
    for s in report.segments:
        cat = _categorize_twa(s.twa_deg)
        counts[cat] = counts.get(cat, 0) + 1
    predominant = max(counts, key=lambda k: counts[k])
    hs = [s.hs_m for s in report.segments if s.hs_m is not None]
    return {
        "tws_min_kn": round(min(tws), 1),
        "tws_max_kn": round(max(tws), 1),
        "predominant_sail_angle": predominant,
        # Both bounds so consumers (web table, MCP App widget) can render a
        # range like "0.3-0.6m" instead of a single max value. PR #69 added
        # hs_min_m but it was dropped by the squash-merge — restored here.
        "hs_min_m": round(min(hs), 2) if hs else None,
        "hs_max_m": round(max(hs), 2) if hs else None,
    }


@dataclass(frozen=True, slots=True)
class SegmentReport:
    start: Point
    end: Point
    distance_nm: float
    bearing_deg: float
    start_time: datetime
    end_time: datetime
    tws_kn: float
    twd_deg: float
    twa_deg: float
    polar_speed_kn: float
    boat_speed_kn: float  # STW post-derate post-efficiency, through water
    duration_h: float  # actual duration over ground (uses sog_kn when current is modelled)
    hs_m: float | None = None
    wave_derate_factor: float = 1.0
    current_speed_kn: float | None = None
    current_direction_to_deg: float | None = None
    sog_kn: float | None = None  # over-ground speed; None when no current data
    # Provenance of current/tide data: ``"openmeteo_smoc"`` for the global
    # 8 km Mercator product, ``"marc_<atlas>_<res>m"`` (e.g.
    # ``"marc_finis_250m"``) when MARC PREVIMER atlas data overrides Open-Meteo
    # in covered zones. ``None`` when no current data is available.
    current_source: str | None = None
    # Qualitative confidence in the current/tide value: ``"high"`` (MARC 250 m
    # to 2 km, in coverage), ``"medium"`` (Open-Meteo SMOC 8 km global), or
    # ``"low"`` (waypoint falls inside a known narrow tidal pass where every
    # open product under-resolves the choke — Goulet de Brest, Raz de Sein,
    # Fromveur, Goulet du Morbihan, Téignouse, Raz Blanchard, Raz de Barfleur,
    # Chenal du Four). ``None`` when no current data is available.
    current_confidence: str | None = None
    gust_kn: float | None = None
    wave_period_s: float | None = None
    # Wind-model actually used for this segment. Usually equals
    # ``PassageReport.model`` (the primary model from the chain), but the
    # null-data fallback (border / off-coverage waypoints, e.g. AROME outside
    # France) walks the chain per-segment and may resolve to a longer-horizon
    # / wider-coverage model for individual points. ``None`` when the field
    # is not populated (kept optional for backward compatibility).
    model_used: str | None = None
    # True when the segment used the polar's motor configuration (polar speed
    # fell below ``BoatPolar.motor_threshold_kn`` and ``motor_speed_kn`` was
    # set). ``polar_speed_kn`` keeps the original sail estimate for debug /
    # display; ``boat_speed_kn`` reflects the motor speed (no efficiency or
    # wave derate applied — under power, those don't apply).
    motor_used: bool = False


@dataclass(frozen=True, slots=True)
class PassageReport:
    archetype: str
    departure_time: datetime
    arrival_time: datetime
    duration_h: float
    distance_nm: float
    efficiency: float
    model: str  # The model actually used (resolved from "auto" if applicable).
    segments: tuple[SegmentReport, ...]
    warnings: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class EtaPassagePlan:
    """Result of an ETA-driven passage solve.

    Backward-resolved: each segment's end_time is fixed (the next segment's
    start, or `target_arrival` for the last segment), and its duration is
    computed from the wind sampled at a heuristic mid-time. So
    `report.arrival_time == target_arrival` exactly by construction (modulo
    timedelta microsecond drift).
    """

    report: PassageReport
    target_arrival: datetime


def _closest_wind_point(points: tuple[WindPoint, ...], target: datetime) -> WindPoint:
    if not points:
        raise ValueError("no wind data points returned for segment")
    return min(points, key=lambda p: abs((p.time - target).total_seconds()))


def _closest_sea_hs(points: tuple[SeaPoint, ...], target: datetime) -> float | None:
    valid = [p for p in points if p.wave_height_m is not None]
    if not valid:
        return None
    return min(valid, key=lambda p: abs((p.time - target).total_seconds())).wave_height_m


def _closest_sea_point(points: tuple[SeaPoint, ...], target: datetime) -> SeaPoint | None:
    """Return the SeaPoint closest in time to ``target``, or None if empty.

    Unlike ``_closest_sea_hs``, no per-field filtering: caller reads whichever
    fields are populated (Hs, currents, tide). Open-Meteo Marine returns all
    fields together at valid grid points, so the field-by-field None case is a
    grid-coverage edge (inland, very high lat).
    """
    if not points:
        return None
    return min(points, key=lambda p: abs((p.time - target).total_seconds()))


class NoModelCoveredError(RuntimeError):
    """Every model in the per-segment fallback chain returned null
    wind data for a given waypoint. Surfaces a user-actionable message; the
    caller (``estimate_passage``) re-raises as-is so the MCP layer turns it
    into a 422 instead of a 500.

    Distinct from ``ForecastHorizonError`` (which means *the time* is past
    the model's horizon): this fires when the time is in-range but the model
    grid does not cover the *point* (typical: AROME France queried in the
    North Sea, ICON-D2 outside DE/CH/AT). The fallback chain is exhausted
    one model at a time before raising.
    """


def _segment_has_wind(bundle: ForecastBundle | None, model: str, target: datetime) -> bool:
    """True when ``bundle`` exposes at least one wind point for ``model``
    close to ``target``. We don't enforce a temporal tolerance here because
    the upstream fetch window is ±90 min around the mid-time and
    ``_parse_wind`` already drops rows where speed_kn or direction_deg are
    null — so a non-empty ``points`` tuple is strictly "this model returned
    usable wind for this point/window".
    """
    if bundle is None:
        return False
    series = bundle.wind_by_model.get(model)
    if series is None or not series.points:
        return False
    # All points here are guaranteed non-null by ``_parse_wind`` (it filters
    # rows where speed_kn or direction_deg are null on ingestion). So
    # presence == usable data; no further per-field check needed.
    return True


async def _fetch_segment_with_fallback(
    fetch_adapter: MarineDataAdapter,
    lat: float,
    lon: float,
    mid_time: datetime,
    primary_model: str,
    chain: tuple[str, ...],
) -> tuple[str, ForecastBundle]:
    """Fetch wind+sea for a single (lat, lon, mid_time) tuple, walking the
    per-segment fallback chain until a model returns usable wind data.

    Returns ``(model_used, bundle)``. ``primary_model`` is always tried first
    even when it is not in ``chain`` (back-compat: in ``model=auto`` mode
    ``primary_model`` is the resolved one from the outer horizon loop, and
    the chain may have been advanced past it). Each candidate beyond the
    primary costs one extra HTTP call only for the segments that fall
    through. Tradeoff vs batch fetch: routes fully covered by the primary
    model see zero extra calls (single batch as before); border legs cost
    one call per segment per fallback step.

    Raises:
        ForecastHorizonError: only when the very last model in the chain
            raises it (chain is exhausted by horizon, not by null data).
        NoModelCoveredError: when every model returned null-wind for this
            point but did not raise horizon.
    """
    candidates: list[str] = [primary_model]
    for m in chain:
        if m not in candidates:
            candidates.append(m)
    last_horizon_err: ForecastHorizonError | None = None
    for candidate in candidates:
        try:
            bundle = await fetch_adapter.fetch(
                lat,
                lon,
                mid_time - WIND_FETCH_WINDOW / 2,
                mid_time + WIND_FETCH_WINDOW / 2,
                models=[candidate],
            )
        except ForecastHorizonError as exc:
            last_horizon_err = exc
            continue
        if _segment_has_wind(bundle, candidate, mid_time):
            return candidate, bundle
    if last_horizon_err is not None:
        raise last_horizon_err
    raise NoModelCoveredError(
        f"no model in chain {candidates!r} returned wind data for "
        f"point ({lat:.3f}, {lon:.3f}) at {mid_time.isoformat()}; "
        f"likely off-coverage (AROME France only; ICON-D2 DE/CH/AT only)"
    )


def _apply_motor(polar: BoatPolar, sail_speed_kn: float) -> tuple[float, bool]:
    """Return (effective_speed_kn, motor_used) given the polar's motor config.

    Switches to ``polar.motor_speed_kn`` whenever the pure-sail estimate
    falls under ``polar.motor_threshold_kn`` AND both motor knobs are set.
    Either knob alone (e.g. user typed only the threshold) is ignored so the
    behaviour stays predictable. The motor speed bypasses ``efficiency`` and
    wave derate: under power those don't apply (efficiency is a sail-trim
    proxy, wave derate is a heeling/slamming proxy — engine just chugs along).
    """
    threshold = polar.motor_threshold_kn
    motor_kn = polar.motor_speed_kn
    if threshold is None or motor_kn is None:
        return sail_speed_kn, False
    if sail_speed_kn >= threshold:
        return sail_speed_kn, False
    return motor_kn, True


def _apply_current(
    boat_speed_kn: float,
    bearing_deg: float,
    current_speed_kn: float | None,
    current_direction_to_deg: float | None,
) -> float | None:
    """SOG = STW + (current projected on bearing). Returns None when current
    data is absent so callers can preserve no-current semantics.

    Convention: ``current_direction_to_deg`` is "going to" (oceanographic), so a
    current setting along the bearing adds to STW. Floored at MIN_BOAT_SPEED_KN
    to keep duration finite when a strong opposing current would otherwise
    reverse SOG — the wind-against-current warning surfaces the qualitative
    issue.
    """
    if current_speed_kn is None or current_direction_to_deg is None:
        return None
    along = current_speed_kn * math.cos(math.radians(bearing_deg - current_direction_to_deg))
    return max(boat_speed_kn + along, MIN_BOAT_SPEED_KN)


async def estimate_passage(
    waypoints: list[Point],
    departure_time: datetime,
    boat_archetype: str,
    *,
    efficiency: float = 0.75,
    segment_length_nm: float = 10.0,
    adapter: MarineDataAdapter | None = None,
    model: str = DEFAULT_MODEL,
    heuristic_speed_kn: float = HEURISTIC_SPEED_KN,
    use_wave_correction: bool = False,
    polar_override: BoatPolar | None = None,
    model_chain: tuple[str, ...] | None = None,
) -> PassageReport:
    """Estimate a passage's per-segment timing, speed, and warnings.

    Args:
        waypoints: ordered list of route waypoints (>=2 points).
        departure_time: timezone-aware datetime; converted to UTC internally.
        boat_archetype: one of the registry names (see `list_archetypes()`).
        efficiency: multiplier on polar speeds. Reference table:
            - ``0.85`` racing trim (clean hull, fresh sails, attentive crew)
            - ``0.75`` cruising (default — sail trim, comfort margins, helm)
            - ``0.65`` loaded family cruising (water/fuel/gear, fouled hull)
            - ``0.55`` heavy seas, neglected hull, short-handed
        segment_length_nm: target sub-segment length in NM. Default 10 nm
            balances precision and Open-Meteo request budget — Med wind
            gradients <10 nm are rare offshore. Drop to 5 for tight coastal
            work; raise to 20 for long offshore legs.
        adapter: any `MarineDataAdapter` (defaults to a fresh `OpenMeteoAdapter`).
        model: wind model name. Pass ``"auto"`` to try AROME → ICON → GFS in
            order and use the first one whose horizon covers the passage.
            The model actually used is reported in ``PassageReport.model``.
        heuristic_speed_kn: speed used for the single-pass timing estimate.
        use_wave_correction: if True, multiply boat speed by ``wave_derate(Hs, TWA)``
            using sea state from the bundle. Default False keeps V1 timings.

    Raises:
        ForecastHorizonError: if the chosen model's horizon does not cover the
            passage time (and ``model != "auto"``, or all auto candidates fail).
    """
    if departure_time.tzinfo is None:
        raise ValueError("departure_time must be timezone-aware")
    if not 0.0 < efficiency <= 1.0:
        raise ValueError("efficiency must be in (0, 1]")

    if model == AUTO_MODEL:
        chain = model_chain if model_chain else AUTO_FALLBACK_CHAIN
        last_err: ForecastHorizonError | None = None
        for idx, candidate in enumerate(chain):
            try:
                # Pass the remaining chain (this candidate + tail) so that
                # null-data fallback inside _estimate_with_model can advance
                # per-segment without re-trying models we already proved
                # horizon-incompatible.
                return await _estimate_with_model(
                    waypoints,
                    departure_time,
                    boat_archetype,
                    efficiency=efficiency,
                    segment_length_nm=segment_length_nm,
                    adapter=adapter,
                    model=candidate,
                    heuristic_speed_kn=heuristic_speed_kn,
                    use_wave_correction=use_wave_correction,
                    polar_override=polar_override,
                    model_chain=chain[idx:],
                )
            except ForecastHorizonError as exc:
                last_err = exc
                continue
        assert last_err is not None
        raise last_err
    return await _estimate_with_model(
        waypoints,
        departure_time,
        boat_archetype,
        efficiency=efficiency,
        segment_length_nm=segment_length_nm,
        adapter=adapter,
        model=model,
        heuristic_speed_kn=heuristic_speed_kn,
        use_wave_correction=use_wave_correction,
        polar_override=polar_override,
        model_chain=model_chain,
    )


async def _estimate_with_model(
    waypoints: list[Point],
    departure_time: datetime,
    boat_archetype: str,
    *,
    efficiency: float,
    segment_length_nm: float,
    adapter: MarineDataAdapter | None,
    model: str,
    heuristic_speed_kn: float,
    use_wave_correction: bool,
    polar_override: BoatPolar | None = None,
    model_chain: tuple[str, ...] | None = None,
) -> PassageReport:
    """Estimate a passage using a single primary ``model`` for wind sampling.

    When ``model_chain`` is provided, segments where the primary model
    returns null wind (typical: waypoint outside the model's geographic
    coverage — AROME France queried in the North Sea) fall back to the next
    model in the chain, one segment at a time. The primary model is used
    when it works, so routes fully covered by it pay zero extra cost.
    """
    polar = polar_override if polar_override is not None else get_polar(boat_archetype)
    effective_length_nm, capped_route_nm = _resolve_segment_length(waypoints, segment_length_nm)
    segments = segment_route(waypoints, effective_length_nm)
    departure_utc = departure_time.astimezone(UTC)

    heuristic_speed_kn = max(heuristic_speed_kn, MIN_BOAT_SPEED_KN)
    seg_mid_times: list[datetime] = []
    cumulative = timedelta(0)
    for seg in segments:
        seg_h = seg.distance_nm / heuristic_speed_kn
        seg_mid_times.append(departure_utc + cumulative + timedelta(hours=seg_h / 2))
        cumulative += timedelta(hours=seg_h)

    seg_mid_points = [midpoint(s.start, s.end) for s in segments]

    # When a chain is provided, drop the primary so we don't redundantly try
    # it twice in the per-segment fallback. Empty tuple (no fallback) is the
    # back-compat path: segments where primary returns null raise
    # ForecastHorizonError exactly as before, so the outer ``estimate_passage``
    # AUTO loop can advance to the next model.
    chain_tail: tuple[str, ...] = ()
    if model_chain:
        chain_tail = tuple(m for m in model_chain if m != model)

    own_adapter = adapter is None
    fetch_adapter: MarineDataAdapter = adapter or OpenMeteoAdapter()
    try:
        # Warm the cache for every segment point in one batched multi-coordinate
        # call (adapters that support it), so the per-segment gather below is
        # served from cache instead of one HTTP call per point. Pure speedup;
        # adapters without prewarm_batch (cache-backed, stubs) skip it.
        if hasattr(fetch_adapter, "prewarm_batch"):
            await fetch_adapter.prewarm_batch(
                [(pt.lat, pt.lon) for pt in seg_mid_points],
                min(seg_mid_times) - WIND_FETCH_WINDOW / 2,
                max(seg_mid_times) + WIND_FETCH_WINDOW / 2,
                [model],
            )
        # First pass: batch-fetch all segments with the primary model. Same
        # request shape as before — routes 100% covered by the primary see
        # exactly one batched gather (preserves cache prewarm behaviour).
        bundles = await asyncio.gather(
            *[
                fetch_adapter.fetch(
                    pt.lat,
                    pt.lon,
                    mid - WIND_FETCH_WINDOW / 2,
                    mid + WIND_FETCH_WINDOW / 2,
                    models=[model],
                )
                for pt, mid in zip(seg_mid_points, seg_mid_times, strict=True)
            ]
        )

        # Per-segment models default to the primary; fallback may overwrite
        # individual entries below.
        seg_models: list[str] = [model] * len(segments)

        # Identify segments where the primary model returned null wind and
        # walk the rest of the chain for those points only. The chain_tail
        # is empty in single-model mode (no fallback), so this loop is a
        # no-op for the existing behaviour.
        if chain_tail:
            fallback_indices = [
                i
                for i, (b, mid) in enumerate(zip(bundles, seg_mid_times, strict=True))
                if not _segment_has_wind(b, model, mid)
            ]
            if fallback_indices:
                fallback_results = await asyncio.gather(
                    *[
                        _fetch_segment_with_fallback(
                            fetch_adapter,
                            seg_mid_points[i].lat,
                            seg_mid_points[i].lon,
                            seg_mid_times[i],
                            primary_model=chain_tail[0],
                            chain=chain_tail,
                        )
                        for i in fallback_indices
                    ]
                )
                for idx, (used_model, used_bundle) in zip(
                    fallback_indices, fallback_results, strict=True
                ):
                    seg_models[idx] = used_model
                    bundles[idx] = used_bundle
    finally:
        if own_adapter and hasattr(fetch_adapter, "aclose"):
            await fetch_adapter.aclose()  # pragma: no cover

    reports: list[SegmentReport] = []
    cumulative_actual = timedelta(0)
    min_boat_speed = float("inf")
    for seg, mid_time, mid_pt, bundle, seg_model in zip(
        segments, seg_mid_times, seg_mid_points, bundles, seg_models, strict=True
    ):
        wind_series = bundle.wind_by_model.get(seg_model)
        if wind_series is None or not wind_series.points:
            # Primary returned null AND no fallback chain or chain exhausted:
            # preserve the existing horizon-error semantics so the outer
            # AUTO loop in ``estimate_passage`` can advance to the next
            # candidate model.
            raise ForecastHorizonError(seg_model, mid_time)
        wp = _closest_wind_point(wind_series.points, mid_time)
        twa = normalize_twa(twd=wp.direction_deg, course=seg.bearing_deg)
        polar_speed = lookup_polar(polar, wp.speed_kn, twa)
        opt_twa, opt_polar_speed = best_vmg_upwind(polar, wp.speed_kn)
        if twa < opt_twa:
            # Sailor tacks at optimal VMG angle; effective speed toward destination:
            #   v_eff = polar(opt) * cos(opt - twa)
            # At twa=0 reduces to VMG_pure_upwind; at twa->opt transitions smoothly.
            effective_polar = opt_polar_speed * math.cos(math.radians(opt_twa - twa))
        else:
            effective_polar = polar_speed
        # Always surface Hs and currents from the bundle so callers see sea
        # state and ground-track corrections, even if wave correction is off.
        sea_pt = _closest_sea_point(bundle.sea.points, mid_time)
        hs_m = sea_pt.wave_height_m if sea_pt else None
        tp_s = sea_pt.wave_period_s if sea_pt else None
        cur_kn = sea_pt.current_speed_kn if sea_pt else None
        cur_to = sea_pt.current_direction_to_deg if sea_pt else None
        cur_src = sea_pt.current_source if sea_pt else None
        cur_conf = confidence_for_point(mid_pt.lat, mid_pt.lon, cur_src)
        derate = 1.0
        if use_wave_correction and hs_m is not None:
            derate = wave_derate(hs_m, twa)
        sail_speed = max(effective_polar * efficiency * derate, MIN_BOAT_SPEED_KN)
        # Motor kicks in when the user configured a threshold AND the polar
        # estimate falls below it. The check happens on the post-efficiency /
        # post-derate sail speed — that's the value the user actually sees in
        # the UI, so it's the one the threshold should refer to.
        boat_speed, motor_used = _apply_motor(polar, sail_speed)
        sog = _apply_current(boat_speed, seg.bearing_deg, cur_kn, cur_to)
        ground_speed = sog if sog is not None else boat_speed
        seg_duration = timedelta(hours=seg.distance_nm / ground_speed)
        seg_start = departure_utc + cumulative_actual
        seg_end = seg_start + seg_duration
        cumulative_actual += seg_duration
        min_boat_speed = min(min_boat_speed, boat_speed)
        reports.append(
            SegmentReport(
                start=seg.start,
                end=seg.end,
                distance_nm=seg.distance_nm,
                bearing_deg=seg.bearing_deg,
                start_time=seg_start,
                end_time=seg_end,
                tws_kn=wp.speed_kn,
                twd_deg=wp.direction_deg,
                twa_deg=twa,
                polar_speed_kn=polar_speed,
                boat_speed_kn=boat_speed,
                duration_h=seg_duration.total_seconds() / 3600.0,
                hs_m=hs_m,
                wave_derate_factor=derate,
                current_speed_kn=cur_kn,
                current_direction_to_deg=cur_to,
                sog_kn=sog,
                current_source=cur_src,
                current_confidence=cur_conf,
                gust_kn=wp.gust_kn,
                wave_period_s=tp_s,
                model_used=seg_model,
                motor_used=motor_used,
            )
        )

    warnings: list[str] = []
    if capped_route_nm is not None:
        warnings.append(
            f"trajet long ({capped_route_nm:.0f} nm) : {len(segments)} points météo "
            f"échantillonnés (~{effective_length_nm:.0f} nm entre points) au lieu de "
            f"{segment_length_nm:.0f} nm pour limiter les requêtes API."
        )
    if min_boat_speed < LIGHT_WIND_THRESHOLD_KN:
        warnings.append(f"vent faible : vitesse mini {min_boat_speed:.1f} kn, passage très lent")
    # Per-segment fallback bookkeeping. Two cases:
    # 1) every segment fell back to the SAME alternative model — promote it
    #    to ``report.model`` so the UI / LLM sees a single coherent label
    #    (matches the pre-fallback behaviour of the outer AUTO loop, which
    #    used to swap the whole route when the primary couldn't deliver).
    # 2) mixed — keep the primary as ``report.model`` and warn that the
    #    route is split across models.
    used_distinct: list[str] = []
    for m in seg_models:
        if m not in used_distinct:
            used_distinct.append(m)
    resolved_model = model
    if used_distinct and used_distinct != [model]:
        if len(used_distinct) == 1 and used_distinct[0] != model:
            # Full route swap — promote, no warning needed (this matches the
            # outer AUTO loop's behaviour before the per-segment fallback
            # was introduced).
            resolved_model = used_distinct[0]
        else:
            fallback_count = sum(1 for m in seg_models if m != model)
            others = [m for m in used_distinct if m != model]
            warnings.append(
                f"modèle {model} sans données sur {fallback_count}/{len(seg_models)} "
                f"points (probable hors zone de couverture) ; fallback automatique sur "
                f"{', '.join(others)}"
            )

    arrival = departure_utc + cumulative_actual
    total_distance = sum(s.distance_nm for s in segments)
    return PassageReport(
        archetype=boat_archetype,
        departure_time=departure_utc,
        arrival_time=arrival,
        duration_h=cumulative_actual.total_seconds() / 3600.0,
        distance_nm=total_distance,
        efficiency=efficiency,
        model=resolved_model,
        segments=tuple(reports),
        warnings=tuple(warnings),
    )


async def _estimate_backward_with_model(
    waypoints: list[Point],
    target_arrival: datetime,
    boat_archetype: str,
    *,
    efficiency: float,
    segment_length_nm: float,
    adapter: MarineDataAdapter | None,
    model: str,
    heuristic_speed_kn: float,
    use_wave_correction: bool,
    polar_override: BoatPolar | None = None,
    model_chain: tuple[str, ...] | None = None,
) -> PassageReport:
    """Mirror of `_estimate_with_model` anchored at arrival, solving backward.

    Walks segments from last to first: each segment's end_time is fixed (the
    next segment's start_time, or `target_arrival` for the last segment), and
    its actual duration is computed from the wind sampled at a mid-time guess.
    By construction, the resulting report has `arrival_time == target_arrival`
    exactly (modulo timedelta microsecond drift), so no fixed-point iteration
    is needed. Mid-time guesses use `heuristic_speed_kn` like the forward path,
    same temporal-correlation argument applies.
    """
    polar = polar_override if polar_override is not None else get_polar(boat_archetype)
    effective_length_nm, capped_route_nm = _resolve_segment_length(waypoints, segment_length_nm)
    segments = segment_route(waypoints, effective_length_nm)
    target_utc = target_arrival.astimezone(UTC)

    heuristic_speed_kn = max(heuristic_speed_kn, MIN_BOAT_SPEED_KN)
    seg_mid_times: list[datetime] = [target_utc] * len(segments)
    cumulative_back = timedelta(0)
    for idx in range(len(segments) - 1, -1, -1):
        seg_h = segments[idx].distance_nm / heuristic_speed_kn
        seg_mid_times[idx] = target_utc - cumulative_back - timedelta(hours=seg_h / 2)
        cumulative_back += timedelta(hours=seg_h)

    seg_mid_points = [midpoint(s.start, s.end) for s in segments]

    chain_tail: tuple[str, ...] = ()
    if model_chain:
        chain_tail = tuple(m for m in model_chain if m != model)

    own_adapter = adapter is None
    fetch_adapter: MarineDataAdapter = adapter or OpenMeteoAdapter()
    try:
        # Batched multi-coordinate prewarm so the per-segment gather is cache-
        # served (one HTTP call for all points instead of one per point).
        if hasattr(fetch_adapter, "prewarm_batch"):
            await fetch_adapter.prewarm_batch(
                [(pt.lat, pt.lon) for pt in seg_mid_points],
                min(seg_mid_times) - WIND_FETCH_WINDOW / 2,
                max(seg_mid_times) + WIND_FETCH_WINDOW / 2,
                [model],
            )
        bundles = await asyncio.gather(
            *[
                fetch_adapter.fetch(
                    pt.lat,
                    pt.lon,
                    mid - WIND_FETCH_WINDOW / 2,
                    mid + WIND_FETCH_WINDOW / 2,
                    models=[model],
                )
                for pt, mid in zip(seg_mid_points, seg_mid_times, strict=True)
            ]
        )

        seg_models: list[str] = [model] * len(segments)
        if chain_tail:
            fallback_indices = [
                i
                for i, (b, mid) in enumerate(zip(bundles, seg_mid_times, strict=True))
                if not _segment_has_wind(b, model, mid)
            ]
            if fallback_indices:
                fallback_results = await asyncio.gather(
                    *[
                        _fetch_segment_with_fallback(
                            fetch_adapter,
                            seg_mid_points[i].lat,
                            seg_mid_points[i].lon,
                            seg_mid_times[i],
                            primary_model=chain_tail[0],
                            chain=chain_tail,
                        )
                        for i in fallback_indices
                    ]
                )
                for idx, (used_model, used_bundle) in zip(
                    fallback_indices, fallback_results, strict=True
                ):
                    seg_models[idx] = used_model
                    bundles[idx] = used_bundle
    finally:
        if own_adapter and hasattr(fetch_adapter, "aclose"):
            await fetch_adapter.aclose()  # pragma: no cover

    # Backward pass: walk segments in reverse, anchoring end_time at arrival.
    reverse_reports: list[SegmentReport] = []
    end_time = target_utc
    min_boat_speed = float("inf")
    for seg, mid_time, mid_pt, bundle, seg_model in zip(
        reversed(segments),
        reversed(seg_mid_times),
        reversed(seg_mid_points),
        reversed(bundles),
        reversed(seg_models),
        strict=True,
    ):
        wind_series = bundle.wind_by_model.get(seg_model)
        if wind_series is None or not wind_series.points:
            raise ForecastHorizonError(seg_model, mid_time)
        wp = _closest_wind_point(wind_series.points, mid_time)
        twa = normalize_twa(twd=wp.direction_deg, course=seg.bearing_deg)
        polar_speed = lookup_polar(polar, wp.speed_kn, twa)
        opt_twa, opt_polar_speed = best_vmg_upwind(polar, wp.speed_kn)
        if twa < opt_twa:
            effective_polar = opt_polar_speed * math.cos(math.radians(opt_twa - twa))
        else:
            effective_polar = polar_speed
        sea_pt = _closest_sea_point(bundle.sea.points, mid_time)
        hs_m = sea_pt.wave_height_m if sea_pt else None
        tp_s = sea_pt.wave_period_s if sea_pt else None
        cur_kn = sea_pt.current_speed_kn if sea_pt else None
        cur_to = sea_pt.current_direction_to_deg if sea_pt else None
        cur_src = sea_pt.current_source if sea_pt else None
        cur_conf = confidence_for_point(mid_pt.lat, mid_pt.lon, cur_src)
        derate = 1.0
        if use_wave_correction and hs_m is not None:
            derate = wave_derate(hs_m, twa)
        sail_speed = max(effective_polar * efficiency * derate, MIN_BOAT_SPEED_KN)
        boat_speed, motor_used = _apply_motor(polar, sail_speed)
        sog = _apply_current(boat_speed, seg.bearing_deg, cur_kn, cur_to)
        ground_speed = sog if sog is not None else boat_speed
        seg_duration = timedelta(hours=seg.distance_nm / ground_speed)
        seg_start = end_time - seg_duration
        min_boat_speed = min(min_boat_speed, boat_speed)
        reverse_reports.append(
            SegmentReport(
                start=seg.start,
                end=seg.end,
                distance_nm=seg.distance_nm,
                bearing_deg=seg.bearing_deg,
                start_time=seg_start,
                end_time=end_time,
                tws_kn=wp.speed_kn,
                twd_deg=wp.direction_deg,
                twa_deg=twa,
                polar_speed_kn=polar_speed,
                boat_speed_kn=boat_speed,
                duration_h=seg_duration.total_seconds() / 3600.0,
                hs_m=hs_m,
                wave_derate_factor=derate,
                current_speed_kn=cur_kn,
                current_source=cur_src,
                current_direction_to_deg=cur_to,
                sog_kn=sog,
                current_confidence=cur_conf,
                gust_kn=wp.gust_kn,
                wave_period_s=tp_s,
                model_used=seg_model,
                motor_used=motor_used,
            )
        )
        end_time = seg_start

    reports = list(reversed(reverse_reports))
    departure = reports[0].start_time
    duration = target_utc - departure

    warnings: list[str] = []
    if capped_route_nm is not None:
        warnings.append(
            f"trajet long ({capped_route_nm:.0f} nm) : {len(segments)} points météo "
            f"échantillonnés (~{effective_length_nm:.0f} nm entre points) au lieu de "
            f"{segment_length_nm:.0f} nm pour limiter les requêtes API."
        )
    if min_boat_speed < LIGHT_WIND_THRESHOLD_KN:
        warnings.append(f"vent faible : vitesse mini {min_boat_speed:.1f} kn, passage très lent")
    # See forward path for rationale.
    used_distinct: list[str] = []
    for m in seg_models:
        if m not in used_distinct:
            used_distinct.append(m)
    resolved_model = model
    if used_distinct and used_distinct != [model]:
        if len(used_distinct) == 1 and used_distinct[0] != model:
            resolved_model = used_distinct[0]
        else:
            fallback_count = sum(1 for m in seg_models if m != model)
            others = [m for m in used_distinct if m != model]
            warnings.append(
                f"modèle {model} sans données sur {fallback_count}/{len(seg_models)} "
                f"points (probable hors zone de couverture) ; fallback automatique sur "
                f"{', '.join(others)}"
            )

    total_distance = sum(s.distance_nm for s in segments)
    return PassageReport(
        archetype=boat_archetype,
        departure_time=departure,
        arrival_time=target_utc,
        duration_h=duration.total_seconds() / 3600.0,
        distance_nm=total_distance,
        efficiency=efficiency,
        model=resolved_model,
        segments=tuple(reports),
        warnings=tuple(warnings),
    )


async def estimate_passage_windows(
    waypoints: list[Point],
    earliest_departure: datetime,
    latest_departure: datetime,
    boat_archetype: str,
    *,
    sweep_interval_hours: int = 1,
    efficiency: float = 0.75,
    segment_length_nm: float = 10.0,
    adapter: MarineDataAdapter | None = None,
    model: str = AUTO_MODEL,
    use_wave_correction: bool = False,
    polar_override: BoatPolar | None = None,
    model_chain: tuple[str, ...] | None = None,
) -> list[PassageReport]:
    """Simulate multiple departure windows for a fixed route.

    Fetches weather data once (prewarm) then sweeps over departure times from
    ``earliest_departure`` to ``latest_departure`` every ``sweep_interval_hours``,
    returning one ``PassageReport`` per window. All simulations after the first
    are cache hits API cost is identical to a single ``estimate_passage`` call.

    Args:
        waypoints: ordered route waypoints (>=2 points).
        earliest_departure: start of sweep window (timezone-aware).
        latest_departure: end of sweep window (timezone-aware, inclusive).
        boat_archetype: one of the registry names (see ``list_archetypes()``).
        sweep_interval_hours: spacing between departure windows (default 1h).
        efficiency: multiplier on polar speeds (see ``estimate_passage``).
        segment_length_nm: sub-segment length for weather sampling.
        adapter: any ``MarineDataAdapter`` (defaults to a fresh ``OpenMeteoAdapter``).
        model: wind model; ``"auto"`` tries AROME → ICON → GFS in order.
        use_wave_correction: if True, apply wave derate to each segment.

    Raises:
        ValueError: if datetimes are naive, earliest > latest, interval < 1, or
            the sweep would exceed ``MAX_SWEEP_WINDOWS`` windows.
        ForecastHorizonError: if no model covers the full sweep horizon.
    """
    if earliest_departure.tzinfo is None or latest_departure.tzinfo is None:
        raise ValueError("earliest_departure and latest_departure must be timezone-aware")
    if earliest_departure > latest_departure:
        raise ValueError("earliest_departure must be <= latest_departure")
    if sweep_interval_hours < 1:
        raise ValueError("sweep_interval_hours must be >= 1")

    earliest_utc = earliest_departure.astimezone(UTC)
    latest_utc = latest_departure.astimezone(UTC)

    n_windows = int((latest_utc - earliest_utc).total_seconds() / 3600 / sweep_interval_hours) + 1
    if n_windows > MAX_SWEEP_WINDOWS:
        raise ValueError(
            f"sweep would produce {n_windows} windows, exceeding the {MAX_SWEEP_WINDOWS} cap "
            f"(14 d x 24 h). Reduce the sweep range or increase sweep_interval_hours."
        )

    # Resolve once so the prewarm samples the same mid-points the per-window
    # estimates will hit. _resolve_segment_length is idempotent so the nested
    # estimate_passage calls (which re-resolve from segment_length_nm) land on
    # the same effective_length and reuse the warmed cache.
    effective_length_nm, _ = _resolve_segment_length(waypoints, segment_length_nm)
    segments = segment_route(waypoints, effective_length_nm)
    seg_mid_points = [midpoint(s.start, s.end) for s in segments]
    route_nm = sum(s.distance_nm for s in segments)

    own_adapter = adapter is None
    fetch_adapter: MarineDataAdapter = adapter or OpenMeteoAdapter()
    try:
        # Simulate the first window to resolve the model (needed before prewarm).
        first = await estimate_passage(
            waypoints,
            earliest_utc,
            boat_archetype,
            efficiency=efficiency,
            segment_length_nm=segment_length_nm,
            adapter=fetch_adapter,
            model=model,
            use_wave_correction=use_wave_correction,
            polar_override=polar_override,
            model_chain=model_chain,
        )
        resolved_model = first.model
        reports: list[PassageReport] = [first]

        # Prewarm cache for the entire sweep horizon so all remaining calls are
        # hits. One batched multi-coordinate call when the adapter supports it
        # (all points in ~2 HTTP requests), else the per-point gather.
        prewarm_end = (
            latest_utc + timedelta(hours=route_nm / PREWARM_MIN_SPEED_KN) + WIND_FETCH_WINDOW
        )
        if hasattr(fetch_adapter, "prewarm_batch"):
            await fetch_adapter.prewarm_batch(
                [(pt.lat, pt.lon) for pt in seg_mid_points],
                earliest_utc,
                prewarm_end,
                [resolved_model],
            )
        else:
            await asyncio.gather(
                *[
                    fetch_adapter.fetch(
                        pt.lat, pt.lon, earliest_utc, prewarm_end, models=[resolved_model]
                    )
                    for pt in seg_mid_points
                ]
            )

        # Sweep remaining departure windows sequentially. The first window's
        # resolved model is the cache-warmed default; later windows that fall
        # past its horizon retry with the AUTO chain so we escalate to
        # ICON-EU / ECMWF / GFS instead of dropping them. Cost: a non-cached
        # fetch per fallback window (Open-Meteo is keyless and fast). When
        # the user pinned a specific model (model != "auto"), we respect that
        # and skip out-of-horizon windows — explicit choice wins.
        # ValueError / KeyError still bubble (caller-side bugs).
        effective_chain = model_chain if model_chain else AUTO_FALLBACK_CHAIN
        current = earliest_utc + timedelta(hours=sweep_interval_hours)
        while current <= latest_utc:
            try:
                report = await estimate_passage(
                    waypoints,
                    current,
                    boat_archetype,
                    efficiency=efficiency,
                    segment_length_nm=segment_length_nm,
                    adapter=fetch_adapter,
                    model=resolved_model,
                    use_wave_correction=use_wave_correction,
                    polar_override=polar_override,
                )
                reports.append(report)
            except ForecastHorizonError:
                if model == AUTO_MODEL and resolved_model != effective_chain[-1]:
                    try:
                        report = await estimate_passage(
                            waypoints,
                            current,
                            boat_archetype,
                            efficiency=efficiency,
                            segment_length_nm=segment_length_nm,
                            adapter=fetch_adapter,
                            model=AUTO_MODEL,
                            use_wave_correction=use_wave_correction,
                            polar_override=polar_override,
                            model_chain=model_chain,
                        )
                        reports.append(report)
                    except (ForecastHorizonError, NoModelCoveredError):
                        pass  # No model in the chain covers it.
            except NoModelCoveredError:
                # Per-segment fallback exhausted for this departure (no model
                # in the chain has data for at least one point). Same UX
                # decision as ForecastHorizonError above: skip the window
                # rather than failing the whole sweep.
                pass
            current += timedelta(hours=sweep_interval_hours)
    finally:
        if own_adapter and hasattr(fetch_adapter, "aclose"):
            await fetch_adapter.aclose()  # pragma: no cover

    return reports


async def estimate_passage_for_arrival(
    waypoints: list[Point],
    target_arrival: datetime,
    boat_archetype: str,
    *,
    efficiency: float = 0.75,
    segment_length_nm: float = 10.0,
    adapter: MarineDataAdapter | None = None,
    model: str = AUTO_MODEL,
    heuristic_speed_kn: float = HEURISTIC_SPEED_KN,
    use_wave_correction: bool = False,
    polar_override: BoatPolar | None = None,
    model_chain: tuple[str, ...] | None = None,
) -> EtaPassagePlan:
    """Inverse of `estimate_passage`: solve for a departure given a target arrival.

    Single-pass backward resolution: walks segments from last to first, anchoring
    each segment's end_time at the next one's start (or `target_arrival` for the
    last segment) and computing its actual duration from the wind sampled at a
    heuristic mid-time. Returns a plan whose `report.arrival_time` equals
    `target_arrival` exactly by construction, so no iteration / tolerance /
    convergence logic is needed.

    Args:
        waypoints: ordered list of route waypoints (>=2 points).
        target_arrival: timezone-aware datetime; the arrival we want to hit.
        boat_archetype: one of the registry names.
        efficiency: multiplier on polar speeds (see `estimate_passage`).
        segment_length_nm: sub-segment length for weather sampling.
        adapter: any `MarineDataAdapter` (defaults to a fresh `OpenMeteoAdapter`).
        model: wind model name; ``"auto"`` tries AROME → ICON → GFS in order.
        heuristic_speed_kn: speed used to lay out per-segment mid-time guesses.
        use_wave_correction: if True, multiply boat speed by `wave_derate(Hs, TWA)`.

    Raises:
        ValueError: if `target_arrival` is naive.
        ForecastHorizonError: if no model in the (auto-)chain covers the resolved
            passage window.
    """
    if target_arrival.tzinfo is None:
        raise ValueError("target_arrival must be timezone-aware")
    if not 0.0 < efficiency <= 1.0:
        raise ValueError("efficiency must be in (0, 1]")

    target_utc = target_arrival.astimezone(UTC)

    if model == AUTO_MODEL:
        chain = model_chain if model_chain else AUTO_FALLBACK_CHAIN
        last_err: ForecastHorizonError | None = None
        for idx, candidate in enumerate(chain):
            try:
                report = await _estimate_backward_with_model(
                    waypoints,
                    target_utc,
                    boat_archetype,
                    efficiency=efficiency,
                    segment_length_nm=segment_length_nm,
                    adapter=adapter,
                    model=candidate,
                    heuristic_speed_kn=heuristic_speed_kn,
                    use_wave_correction=use_wave_correction,
                    polar_override=polar_override,
                    model_chain=chain[idx:],
                )
                return EtaPassagePlan(report=report, target_arrival=target_utc)
            except ForecastHorizonError as exc:
                last_err = exc
                continue
        assert last_err is not None
        raise last_err

    report = await _estimate_backward_with_model(
        waypoints,
        target_utc,
        boat_archetype,
        efficiency=efficiency,
        segment_length_nm=segment_length_nm,
        adapter=adapter,
        model=model,
        heuristic_speed_kn=heuristic_speed_kn,
        use_wave_correction=use_wave_correction,
        polar_override=polar_override,
        model_chain=model_chain,
    )
    return EtaPassagePlan(report=report, target_arrival=target_utc)
