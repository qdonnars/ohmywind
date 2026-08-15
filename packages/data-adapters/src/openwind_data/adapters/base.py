# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Marine forecast types and adapter Protocol.

Direction conventions (mixed by physical phenomenon — mirrors meteorological and
oceanographic standards, do not normalise):

- Wind direction (``WindPoint.direction_deg``): "from" — meteo standard (TWD).
  0° = wind blowing from the north.
- Wave direction (``SeaPoint.wave_direction_deg``): "from" — same as wind.
- Ocean current direction (``SeaPoint.current_direction_to_deg``): "to" —
  oceanographic / nautical standard. 0° = current setting toward the north.

Any code comparing wind vs current bearings (e.g. wind-against-current scoring)
must explicitly normalise via ``(wind_from + 180) % 360`` to compare like with
like. Mixing them silently is a bug.

Speeds are in knots throughout the domain. Adapters convert at ingestion.

Relevance thresholds (``CURRENT_*``, ``TIDE_*``) match the user-visible filter:
currents and tide range only surface in the UI / MCP output when they exceed
these values per leg. Tuned for the French coast (Med < threshold typically;
Atlantic above on most legs).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

CURRENT_RELEVANCE_THRESHOLD_KN = 0.3
TIDE_RANGE_RELEVANCE_THRESHOLD_M = 0.5
WIND_AGAINST_CURRENT_WARNING_THRESHOLD_KN = 1.5
WIND_AGAINST_CURRENT_OPPOSITION_DEG = 120.0

# Chop detection: short-period steep wind sea ("clapot"). Index = Hs / Tp^2
# (proxy for wave steepness). > 0.05 flags genuinely uncomfortable chop —
# Hs 1.2 m at Tp 5 s, Hs 0.8 m at Tp 4 s. CHOP_HS_FLOOR_M guards against
# absurd flags on ripples (Hs 0.3 m at Tp 2 s mathematically scores 0.075).
CHOP_INDEX_THRESHOLD = 0.05
CHOP_HS_FLOOR_M = 0.8
# |TWA| >= 120° = sea coming from behind the boat (running / broad reach).
# Chop on this angle is uncomfortable but not equivalent to taking it on the
# bow: the boat moves with the wave, slamming is rare, and surfing is often
# a gain. We still emit a warning (broaching / accidental gybe risks remain)
# but skip the complexity bump when *all* chop segments are on this angle.
CHOP_FOLLOWING_TWA_DEG = 120.0


class ForecastHorizonError(RuntimeError):
    """Raised when a forecast model's horizon does not cover the requested time.

    Carries the failing model, the requested timestamp, and a human-actionable
    message suggesting longer-horizon fallbacks. Open-Meteo silently returns
    empty rows past horizon, so detection happens after the fetch.
    """

    def __init__(self, model: str, requested_time: datetime) -> None:
        self.model = model
        self.requested_time = requested_time
        super().__init__(
            f"forecast horizon exceeded for model {model!r} at "
            f"{requested_time.isoformat()}; AROME ~48h, ICON-EU ~5d, "
            f"ECMWF ~10d, GFS ~16d. Try a longer-range model "
            f"or pass model='auto' to fall back automatically"
        )


class UpstreamRateLimitError(RuntimeError):
    """Raised when Open-Meteo answers 429.

    Distinct from *our own* rate limiter, which protects this service from its
    callers. This one means the weather API is refusing *us*, and the caller
    can do nothing beyond waiting. Conflating the two produces the worst
    possible message: telling users to slow down when the bottleneck is
    upstream and unrelated to anything they did.

    Open-Meteo counts against the caller's IP rather than an account, so on
    shared egress (Hugging Face Spaces, cloud NAT) the quota can be consumed
    by an unrelated tenant. That is why ``reason`` is surfaced verbatim: it
    names which counter tripped, which is the only way to tell "wait a moment"
    apart from "this address is done for the day".
    """

    def __init__(self, reason: str = "", retry_after_s: float | None = None) -> None:
        self.reason = reason
        self.retry_after_s = retry_after_s
        detail = f" ({reason})" if reason else ""
        super().__init__(f"upstream weather service rate limit reached{detail}")


@dataclass(frozen=True, slots=True)
class WindPoint:
    time: datetime
    speed_kn: float
    direction_deg: float
    gust_kn: float | None


@dataclass(frozen=True, slots=True)
class SeaPoint:
    time: datetime
    wave_height_m: float | None
    wave_period_s: float | None
    wave_direction_deg: float | None
    wind_wave_height_m: float | None
    swell_wave_height_m: float | None
    current_speed_kn: float | None = None
    current_direction_to_deg: float | None = None
    tide_height_m: float | None = None
    # Provenance label for currents and tide_height: e.g. "openmeteo_smoc"
    # for the global Mercator product, "marc_finis_250m" / "marc_atlne_2km"
    # for the PREVIMER atlases. ``None`` when no current/tide data populated.
    current_source: str | None = None


@dataclass(frozen=True, slots=True)
class WindSeries:
    model: str
    points: tuple[WindPoint, ...]


@dataclass(frozen=True, slots=True)
class SeaSeries:
    points: tuple[SeaPoint, ...]


@dataclass(frozen=True, slots=True)
class ForecastBundle:
    lat: float
    lon: float
    start: datetime
    end: datetime
    wind_by_model: dict[str, WindSeries] = field(default_factory=dict)
    sea: SeaSeries = field(default_factory=lambda: SeaSeries(points=()))
    requested_at: datetime | None = None


class MarineDataAdapter(Protocol):
    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle: ...
