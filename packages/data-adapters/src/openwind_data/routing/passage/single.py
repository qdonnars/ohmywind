# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""One passage: pin the departure, or pin the arrival.

Both entry points do the same two things, resolve the model chain and hand
the work to `_estimate_with_model`. The only difference is which end of the
passage the caller knows, which the engine takes as a boolean.
"""

from __future__ import annotations

from datetime import UTC, datetime

from openwind_data.adapters.base import ForecastHorizonError, MarineDataAdapter
from openwind_data.adapters.openmeteo import (
    AUTO_FALLBACK_CHAIN,
    AUTO_MODEL,
    DEFAULT_MODEL,
)
from openwind_data.routing.archetypes import BoatPolar
from openwind_data.routing.geometry import Point
from openwind_data.routing.passage.engine import _estimate_with_model
from openwind_data.routing.passage.models import EtaPassagePlan, PassageReport


async def estimate_passage(
    waypoints: list[Point],
    departure_time: datetime,
    boat_archetype: str,
    *,
    efficiency: float = 0.75,
    segment_length_nm: float = 10.0,
    adapter: MarineDataAdapter | None = None,
    model: str = DEFAULT_MODEL,
    heuristic_speed_kn: float | None = None,
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
        heuristic_speed_kn: layout speed for the single-pass timing estimate.
            Default ``None`` derives it from the boat (`_layout_speed_kn`:
            polar at the reference point x efficiency, through the motor
            rule); pass a float to pin it explicitly.
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
                    backward=False,
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
        backward=False,
    )


async def estimate_passage_for_arrival(
    waypoints: list[Point],
    target_arrival: datetime,
    boat_archetype: str,
    *,
    efficiency: float = 0.75,
    segment_length_nm: float = 10.0,
    adapter: MarineDataAdapter | None = None,
    model: str = AUTO_MODEL,
    heuristic_speed_kn: float | None = None,
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
        heuristic_speed_kn: layout speed for per-segment mid-time guesses.
            Default ``None`` derives it from the boat (see `estimate_passage`).
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
                report = await _estimate_with_model(
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
                    backward=True,
                )
                return EtaPassagePlan(report=report, target_arrival=target_utc)
            except ForecastHorizonError as exc:
                last_err = exc
                continue
        assert last_err is not None
        raise last_err

    report = await _estimate_with_model(
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
        backward=True,
    )
    return EtaPassagePlan(report=report, target_arrival=target_utc)
