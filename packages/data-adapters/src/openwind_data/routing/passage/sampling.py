# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Cutting the route, laying out sampling times, and fetching the weather.

The single I/O phase of a passage estimate. Everything downstream of
`_sample_route` is arithmetic on what it returns, which is why the direction
of the walk does not appear here beyond the sign of one accumulation.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import pairwise

from openwind_data.adapters.base import (
    ForecastBundle,
    ForecastHorizonError,
    MarineDataAdapter,
    SeaPoint,
    WindPoint,
)
from openwind_data.adapters.openmeteo import OpenMeteoAdapter
from openwind_data.routing.archetypes import BoatPolar
from openwind_data.routing.geometry import (
    Point,
    Segment,
    haversine_distance,
    midpoint,
    segment_route,
)
from openwind_data.routing.passage.constants import (
    MAX_SAMPLED_SEGMENTS,
    MAX_SEG_LENGTH_NM,
    MIN_BOAT_SPEED_KN,
    MIN_SEG_LENGTH_NM,
    WIND_FETCH_WINDOW,
)
from openwind_data.routing.passage.models import NoModelCoveredError
from openwind_data.routing.passage.physics import _layout_speed_kn


def resolve_fetch_adapter(
    adapter: MarineDataAdapter | None,
) -> tuple[bool, MarineDataAdapter]:
    """Return ``(we built it, the adapter to fetch through)``.

    The single place the engine ever constructs an ``OpenMeteoAdapter``, so
    the boolean that decides who closes it is computed next to the object it
    talks about, and so a test that wants a passage planned without a network
    has exactly one name to replace.
    """
    return adapter is None, adapter or OpenMeteoAdapter()


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


@dataclass(frozen=True, slots=True)
class RouteSampling:
    """Everything the engine needs to know about the route and its weather.

    Produced by `_sample_route`, consumed by the walk. Holds five parallel
    lists, all in route order whichever direction the walk will take: a
    segment, the mid-time its weather was sampled at, its mid-point, the
    bundle that came back, and the model that bundle's wind actually came
    from (the primary for most segments, a fallback for the ones the primary
    could not cover).
    """

    segments: list[Segment]
    mid_times: list[datetime]
    mid_points: list[Point]
    bundles: list[ForecastBundle]
    models: list[str]
    effective_length_nm: float
    # Route length in nm when `_resolve_segment_length` stretched the spacing,
    # `None` when the requested spacing was kept. Feeds the sampling warning.
    capped_route_nm: float | None


def _layout_mid_times(
    segments: list[Segment], anchor_utc: datetime, layout_speed_kn: float, *, backward: bool
) -> list[datetime]:
    """Lay out one weather-sampling mid-time per segment from a fixed anchor.

    Forward the anchor is the departure and the walk accumulates into the
    future; backward it is the target arrival and the walk accumulates into
    the past. Both use the same boat-aware cruising estimate, so the same
    temporal-correlation argument covers them (see the module docstring).
    """
    out: list[datetime] = []
    cumulative = timedelta(0)
    order = range(len(segments) - 1, -1, -1) if backward else range(len(segments))
    for idx in order:
        seg_h = segments[idx].distance_nm / layout_speed_kn
        half = timedelta(hours=seg_h / 2)
        if backward:
            out.append(anchor_utc - cumulative - half)
        else:
            out.append(anchor_utc + cumulative + half)
        cumulative += timedelta(hours=seg_h)
    return list(reversed(out)) if backward else out


async def _sample_route(
    waypoints: list[Point],
    anchor_utc: datetime,
    polar: BoatPolar,
    *,
    efficiency: float,
    segment_length_nm: float,
    adapter: MarineDataAdapter | None,
    model: str,
    heuristic_speed_kn: float | None,
    model_chain: tuple[str, ...] | None,
    backward: bool,
) -> RouteSampling:
    """Split the route, lay out sampling times, and fetch the weather.

    The single I/O phase of a passage estimate, shared by both directions:
    everything after it is arithmetic. Three steps, in order:

    1. Resolve the effective segment spacing (stretched on long routes) and
       cut the polyline, then lay out one mid-time per segment from
       ``anchor_utc`` in the direction the walk will take.
    2. Warm the cache for every mid-point in one batched multi-coordinate
       call when the adapter supports it, then gather the primary model for
       all segments at once. Routes fully covered by the primary pay exactly
       one batched gather, as before the per-segment fallback existed.
    3. For the segments where the primary returned null wind (typically an
       off-coverage waypoint: AROME asked outside France), walk the rest of
       the chain point by point. Border legs cost one call per fallback step,
       covered routes cost nothing.

    ``model_chain`` empty or ``None`` disables step 3 entirely: a segment the
    primary cannot serve then surfaces as ``ForecastHorizonError`` from the
    walk, which is what lets the ``model="auto"`` loop in ``estimate_passage``
    advance to the next candidate.
    """
    effective_length_nm, capped_route_nm = _resolve_segment_length(waypoints, segment_length_nm)
    segments = segment_route(waypoints, effective_length_nm)

    # An explicit heuristic_speed_kn wins (caller pin / test hook); otherwise
    # the layout speed comes from the boat itself.
    layout_speed_kn = (
        max(heuristic_speed_kn, MIN_BOAT_SPEED_KN)
        if heuristic_speed_kn is not None
        else _layout_speed_kn(polar, efficiency)
    )
    mid_times = _layout_mid_times(segments, anchor_utc, layout_speed_kn, backward=backward)
    mid_points = [midpoint(s.start, s.end) for s in segments]

    # When a chain is provided, drop the primary so we don't redundantly try
    # it twice in the per-segment fallback. Empty tuple (no fallback) is the
    # back-compat path described in the docstring.
    chain_tail: tuple[str, ...] = ()
    if model_chain:
        chain_tail = tuple(m for m in model_chain if m != model)

    own_adapter, fetch_adapter = resolve_fetch_adapter(adapter)
    try:
        # Adapters without prewarm_batch (cache-backed, stubs) skip straight to
        # the gather; for the others this is a pure speedup, one HTTP call for
        # all points instead of one per point.
        if hasattr(fetch_adapter, "prewarm_batch"):
            await fetch_adapter.prewarm_batch(
                [(pt.lat, pt.lon) for pt in mid_points],
                min(mid_times) - WIND_FETCH_WINDOW / 2,
                max(mid_times) + WIND_FETCH_WINDOW / 2,
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
                for pt, mid in zip(mid_points, mid_times, strict=True)
            ]
        )

        # Per-segment models default to the primary; the fallback below may
        # overwrite individual entries.
        seg_models: list[str] = [model] * len(segments)
        if chain_tail:
            fallback_indices = [
                i
                for i, (b, mid) in enumerate(zip(bundles, mid_times, strict=True))
                if not _segment_has_wind(b, model, mid)
            ]
            if fallback_indices:
                fallback_results = await asyncio.gather(
                    *[
                        _fetch_segment_with_fallback(
                            fetch_adapter,
                            mid_points[i].lat,
                            mid_points[i].lon,
                            mid_times[i],
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

    return RouteSampling(
        segments=segments,
        mid_times=mid_times,
        mid_points=mid_points,
        bundles=list(bundles),
        models=seg_models,
        effective_length_nm=effective_length_nm,
        capped_route_nm=capped_route_nm,
    )
