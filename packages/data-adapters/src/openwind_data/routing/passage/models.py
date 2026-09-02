# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""What a passage estimate is made of: the report types and the one error.

Data only. Nothing here computes anything, which is what lets the REST and
MCP shells serialise these straight through ``openwind_data.views`` and lets
the field order of the dataclasses be the field order of the JSON.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from openwind_data.routing.geometry import Point


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
    # Largest gap (hours) between a segment's weather-sampling mid-time and
    # its actual mid-passage time. Debug/telemetry for the single-pass layout:
    # values beyond ~2-3 h are the signal that a second sampling pass at
    # corrected mid-times would be worth its cost.
    max_sampling_drift_h: float | None = None


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
