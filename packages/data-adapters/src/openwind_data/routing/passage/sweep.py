# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Many departures, one route: the compare-windows sweep.

Costs one weather fetch and N simulations, because every window after the
first reads the cache the first one warmed. What it guards against is the
product of its two bounds, which is the only quantity a hostile caller can
make large without breaking any single limit.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from openwind_data.adapters.base import ForecastHorizonError, MarineDataAdapter
from openwind_data.adapters.openmeteo import AUTO_FALLBACK_CHAIN, AUTO_MODEL
from openwind_data.routing.archetypes import BoatPolar
from openwind_data.routing.geometry import Point, midpoint, segment_route
from openwind_data.routing.passage.constants import (
    MAX_SWEEP_SIMULATIONS,
    MAX_SWEEP_WINDOWS,
    PREWARM_MIN_SPEED_KN,
    WIND_FETCH_WINDOW,
)
from openwind_data.routing.passage.models import NoModelCoveredError, PassageReport
from openwind_data.routing.passage.sampling import (
    _resolve_segment_length,
    resolve_fetch_adapter,
)
from openwind_data.routing.passage.single import estimate_passage


def resolve_sweep_interval(
    span_hours: float, requested_interval_h: int, n_segments: int
) -> tuple[int, int]:
    """Return (effective_interval_h, n_windows) fitting MAX_SWEEP_SIMULATIONS.

    Widens the requested interval by whole hours until ``n_windows *
    n_segments`` fits the budget. Pure function of its inputs, so it can be
    called before any work is done and asserted on directly in tests.

    Public because the REST and MCP shells have to report the interval they
    actually got. They re-derive it from the same three inputs rather than
    diffing the returned departure times, which would read a skipped window as
    a wider interval.
    """

    def windows_for(interval_h: int) -> int:
        return int(span_hours / interval_h) + 1

    interval = max(1, requested_interval_h)
    budget_windows = max(1, MAX_SWEEP_SIMULATIONS // max(1, n_segments))
    while windows_for(interval) > budget_windows and windows_for(interval) > 1:
        interval += 1
    return interval, windows_for(interval)


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

    ``sweep_interval_hours`` is a request, not a guarantee: it is widened by
    whole hours when the resulting sweep would exceed ``MAX_SWEEP_SIMULATIONS``
    (windows x segments). Read the effective interval back from the departure
    times of the returned reports. Exceeding ``MAX_SWEEP_WINDOWS`` still raises
    instead, on purpose: that cap says the request runs past the useful weather
    horizon, which is a caller mistake to fix, while the simulation budget is a
    resource limit a coarser sweep still answers honestly.

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

    # Fit the simulation budget before doing any work. MAX_SWEEP_WINDOWS above
    # caps one factor and MAX_WAYPOINTS the other; this caps their product,
    # which is what the sweep actually costs. Callers read the effective
    # interval back from the departure times of the returned reports.
    span_hours = (latest_utc - earliest_utc).total_seconds() / 3600
    sweep_interval_hours, _ = resolve_sweep_interval(
        span_hours, sweep_interval_hours, len(segments)
    )

    own_adapter, fetch_adapter = resolve_fetch_adapter(adapter)
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
            # Every window after the first is a cache hit, and a coroutine that
            # never awaits anything real never yields: without this the whole
            # sweep runs as one uninterruptible block and the process serves
            # nothing else meanwhile, landing page and rate-limited REST
            # included. Yielding per window costs nothing measurable.
            await asyncio.sleep(0)
            current += timedelta(hours=sweep_interval_hours)
    finally:
        if own_adapter and hasattr(fetch_adapter, "aclose"):
            await fetch_adapter.aclose()  # pragma: no cover

    return reports
