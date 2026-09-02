# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""One segment, one walk, one set of warnings: the engine proper.

`_estimate_with_model` is the whole of it, run forward from a known departure
or backward from a known arrival. The two used to be mirror copies of each
other, 179 identical lines out of 251 and 221, until the 2026-09 audit filed
the drift between them as M1.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

from openwind_data.adapters.base import ForecastBundle, ForecastHorizonError, MarineDataAdapter
from openwind_data.currents.narrow_pass import confidence_for_point
from openwind_data.routing.archetypes import BoatPolar, get_polar, lookup_polar
from openwind_data.routing.geometry import Point, Segment, normalize_twa
from openwind_data.routing.passage.constants import (
    LIGHT_WIND_THRESHOLD_KN,
    MIN_BOAT_SPEED_KN,
)
from openwind_data.routing.passage.models import PassageReport, SegmentReport
from openwind_data.routing.passage.physics import (
    _apply_current,
    _apply_motor,
    best_vmg_upwind,
    wave_derate,
)
from openwind_data.routing.passage.sampling import (
    RouteSampling,
    _closest_sea_point,
    _closest_wind_point,
    _sample_route,
)


def _segment_report(
    seg: Segment,
    *,
    mid_time: datetime,
    mid_point: Point,
    bundle: ForecastBundle,
    model: str,
    polar: BoatPolar,
    efficiency: float,
    use_wave_correction: bool,
    anchor: datetime,
    backward: bool,
) -> SegmentReport:
    """Compute one segment: wind, sail geometry, sea, current, duration.

    Pure. ``anchor`` is the end of the segment when walking backward and its
    start when walking forward, which is the only way the direction of the
    walk reaches this function: everything else, from the tacking correction
    to the motor rule, is the same physics either way.

    Raises:
        ForecastHorizonError: when ``bundle`` carries no wind for ``model``.
            The primary returned null and either no chain was supplied or the
            chain was exhausted; re-raising here preserves the semantics the
            ``model="auto"`` loop relies on to advance to the next candidate.
    """
    wind_series = bundle.wind_by_model.get(model)
    if wind_series is None or not wind_series.points:
        raise ForecastHorizonError(model, mid_time)
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

    # Always surface Hs and currents from the bundle so callers see sea state
    # and ground-track corrections, even if wave correction is off.
    sea_pt = _closest_sea_point(bundle.sea.points, mid_time)
    hs_m = sea_pt.wave_height_m if sea_pt else None
    tp_s = sea_pt.wave_period_s if sea_pt else None
    cur_kn = sea_pt.current_speed_kn if sea_pt else None
    cur_to = sea_pt.current_direction_to_deg if sea_pt else None
    cur_src = sea_pt.current_source if sea_pt else None
    cur_conf = confidence_for_point(mid_point.lat, mid_point.lon, cur_src)

    derate = 1.0
    if use_wave_correction and hs_m is not None:
        derate = wave_derate(hs_m, twa)
    sail_speed = max(effective_polar * efficiency * derate, MIN_BOAT_SPEED_KN)
    # Motor kicks in when the user configured a threshold AND the polar
    # estimate falls below it. The check happens on the post-efficiency /
    # post-derate sail speed, the value the user actually sees in the UI, so
    # it is the one the threshold should refer to.
    boat_speed, motor_used = _apply_motor(polar, sail_speed)
    sog = _apply_current(boat_speed, seg.bearing_deg, cur_kn, cur_to)
    ground_speed = sog if sog is not None else boat_speed
    seg_duration = timedelta(hours=seg.distance_nm / ground_speed)

    start_time = anchor - seg_duration if backward else anchor
    end_time = anchor if backward else anchor + seg_duration
    return SegmentReport(
        start=seg.start,
        end=seg.end,
        distance_nm=seg.distance_nm,
        bearing_deg=seg.bearing_deg,
        start_time=start_time,
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
        current_direction_to_deg=cur_to,
        sog_kn=sog,
        current_source=cur_src,
        current_confidence=cur_conf,
        gust_kn=wp.gust_kn,
        wave_period_s=tp_s,
        model_used=model,
        motor_used=motor_used,
    )


def _collect_warnings(
    sampling: RouteSampling,
    *,
    requested_length_nm: float,
    min_boat_speed_kn: float,
    model: str,
) -> tuple[list[str], str]:
    """Return the route-level warnings and the model to report.

    Three sources, in the order they are appended to the report: the sampling
    cap, the light-wind stall, and the per-segment model fallback.

    The fallback has two outcomes. When every segment ended up on the *same*
    alternative model, it is promoted to ``report.model`` with no warning:
    that is one coherent label for the whole route, and it matches what the
    outer AUTO loop did before the per-segment fallback existed. When the
    route is split across models, the primary stays the reported one and a
    warning names how many points fell through and to what.
    """
    warnings: list[str] = []
    if sampling.capped_route_nm is not None:
        warnings.append(
            f"trajet long ({sampling.capped_route_nm:.0f} nm) : "
            f"{len(sampling.segments)} points météo "
            f"échantillonnés (~{sampling.effective_length_nm:.0f} nm entre points) au lieu de "
            f"{requested_length_nm:.0f} nm pour limiter les requêtes API."
        )
    if min_boat_speed_kn < LIGHT_WIND_THRESHOLD_KN:
        warnings.append(f"vent faible : vitesse mini {min_boat_speed_kn:.1f} kn, passage très lent")

    seg_models = sampling.models
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
    return warnings, resolved_model


async def _estimate_with_model(
    waypoints: list[Point],
    anchor_time: datetime,
    boat_archetype: str,
    *,
    efficiency: float,
    segment_length_nm: float,
    adapter: MarineDataAdapter | None,
    model: str,
    heuristic_speed_kn: float | None,
    use_wave_correction: bool,
    polar_override: BoatPolar | None,
    model_chain: tuple[str, ...] | None,
    backward: bool,
) -> PassageReport:
    """The one passage engine, run in either direction.

    ``anchor_time`` is the departure when ``backward`` is false and the target
    arrival when it is true. Sampling, per-segment physics and warnings are
    the same code either way (see `_sample_route`, `_segment_report`,
    `_collect_warnings`); what differs is which end of the passage is known,
    and therefore which way the walk chains segment times together. Forward,
    each segment starts where the previous one ended, from the departure.
    Backward, each segment ends where the next one started, from the arrival,
    so ``report.arrival_time == target_arrival`` exactly by construction and
    no fixed-point iteration is needed.
    """
    polar = polar_override if polar_override is not None else get_polar(boat_archetype)
    anchor_utc = anchor_time.astimezone(UTC)
    sampling = await _sample_route(
        waypoints,
        anchor_utc,
        polar,
        efficiency=efficiency,
        segment_length_nm=segment_length_nm,
        adapter=adapter,
        model=model,
        heuristic_speed_kn=heuristic_speed_kn,
        model_chain=model_chain,
        backward=backward,
    )

    # The walk. Forward it runs in route order anchored at the departure,
    # backward in reverse order anchored at the arrival; either way each
    # segment's free end becomes the next anchor, so the chain of times is
    # exact rather than a sum of rounded hours.
    order = list(range(len(sampling.segments)))
    if backward:
        order.reverse()
    walked: list[SegmentReport] = []
    anchor = anchor_utc
    for i in order:
        seg_report = _segment_report(
            sampling.segments[i],
            mid_time=sampling.mid_times[i],
            mid_point=sampling.mid_points[i],
            bundle=sampling.bundles[i],
            model=sampling.models[i],
            polar=polar,
            efficiency=efficiency,
            use_wave_correction=use_wave_correction,
            anchor=anchor,
            backward=backward,
        )
        walked.append(seg_report)
        anchor = seg_report.start_time if backward else seg_report.end_time
    reports = list(reversed(walked)) if backward else walked

    min_boat_speed = min((r.boat_speed_kn for r in reports), default=float("inf"))
    max_drift_h = max(
        (
            abs(((r.start_time + (r.end_time - r.start_time) / 2) - mid).total_seconds()) / 3600.0
            for r, mid in zip(reports, sampling.mid_times, strict=True)
        ),
        default=0.0,
    )
    warnings, resolved_model = _collect_warnings(
        sampling,
        requested_length_nm=segment_length_nm,
        min_boat_speed_kn=min_boat_speed,
        model=model,
    )

    departure = anchor if backward else anchor_utc
    arrival = anchor_utc if backward else anchor
    return PassageReport(
        archetype=boat_archetype,
        departure_time=departure,
        arrival_time=arrival,
        duration_h=(arrival - departure).total_seconds() / 3600.0,
        distance_nm=sum(s.distance_nm for s in sampling.segments),
        efficiency=efficiency,
        model=resolved_model,
        segments=tuple(reports),
        warnings=tuple(warnings),
        max_sampling_drift_h=round(max_drift_h, 2),
    )
