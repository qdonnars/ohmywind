# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Reproducible marine data, for tests that must produce the same bytes twice.

Lives in the shipped package rather than in one test suite because three
suites need the *same* numbers: the REST goldens, the MCP goldens, and the
live-versus-cache parity test. Two copies of a "deterministic" generator that
drift apart silently stop proving anything, and the whole point of the goldens
is that the REST shell and the MCP shell can be shown to serialise the same
passage.

Nothing here reaches the network, reads a file, or looks at the clock. Every
value is a closed-form function of ``(lat, lon, time)``, so a bundle can be
rebuilt identically from a request, from a browser cache payload, or from a
recorded HTTP response.

Not imported by any production code path.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

from openwind_data.adapters.base import (
    ForecastBundle,
    SeaPoint,
    SeaSeries,
    WindPoint,
    WindSeries,
)

# Arbitrary but fixed origin of the phase. Anchored in the past so every
# realistic test date lands on a positive hour count, which keeps the modulo
# arithmetic below free of negative-remainder surprises.
PHASE_EPOCH = datetime(2026, 1, 1, tzinfo=UTC)

# Provenance label the generator stamps on its sea points. Matches what the
# Open-Meteo adapter reports for the global Mercator product, so the
# confidence classifier downstream takes the same branch it would in
# production.
CURRENT_SOURCE = "openmeteo_smoc"

# Same literal expression as ``openmeteo._KMH_TO_KN``, so the two evaluate to
# the same double. Spelled out rather than imported because it is a private
# name there, and because a divergence between the two is exactly what the
# parity test exists to catch.
KMH_TO_KN = 1 / 1.852


def _phase(lat: float, lon: float, when: datetime) -> float:
    """Hours since the epoch, offset by position.

    The spatial term is what makes two segments of the same route see
    different wind: without it every segment would read the same value at the
    same instant and the goldens would stop covering the per-segment logic.
    """
    hours = (when.astimezone(UTC) - PHASE_EPOCH).total_seconds() / 3600.0
    return hours + lat + lon


def wind_at(lat: float, lon: float, when: datetime) -> tuple[float, float, float]:
    """Return ``(speed_kn, direction_deg, gust_kn)``.

    Speed sits in [6, 16] kn, comfortably inside every archetype's polar grid
    so the lookup interpolates rather than clamping at an edge. Direction
    sweeps the full circle over 120 hours.
    """
    p = _phase(lat, lon, when)
    speed = round(11.0 + 5.0 * math.sin(math.radians(15.0 * p)), 3)
    direction = round((40.0 + 3.0 * p) % 360.0, 3)
    gust = round(speed * 1.4, 3)
    return speed, direction, gust


def current_kmh_at(lat: float, lon: float, when: datetime) -> float:
    """Surface current, in the unit Open-Meteo Marine actually answers in.

    Kilometres per hour is the canonical value here rather than knots, and
    that is load-bearing for the live-versus-cache parity test: the adapter
    multiplies the upstream number by ``1/1.852`` on ingestion, so generating
    knots first and dividing back would leave the two paths a rounding error
    apart on a comparison that is supposed to be exact.
    """
    p = _phase(lat, lon, when)
    return round(0.46 + 0.28 * math.sin(math.radians(45.0 * p)), 3)


def sea_at(
    lat: float, lon: float, when: datetime
) -> tuple[float, float, float, float, float, float]:
    """Return ``(hs_m, tp_s, wave_dir_deg, current_kn, current_to_deg, tide_m)``.

    Hs stays in [0.5, 1.3] m and the current in [0.1, 0.4] kn: above the
    relevance thresholds often enough that the current fields are exercised,
    never high enough to trip the heavy-weather branches of the complexity
    score, which have their own tests.
    """
    p = _phase(lat, lon, when)
    hs = round(0.9 + 0.4 * math.sin(math.radians(30.0 * p)), 3)
    tp = round(4.5 + 1.0 * math.cos(math.radians(20.0 * p)), 3)
    wave_dir = round((200.0 + 2.0 * p) % 360.0, 3)
    current = current_kmh_at(lat, lon, when) * KMH_TO_KN
    current_to = round((90.0 + p) % 360.0, 3)
    tide = round(1.5 * math.sin(math.radians(28.984 * p)), 3)
    return hs, tp, wave_dir, current, current_to, tide


def hourly_axis(start: datetime, end: datetime) -> list[datetime]:
    """Whole hours covering ``[start, end]``, inclusive at both ends.

    Mirrors Open-Meteo's own hourly grid: the API answers on the hour whatever
    the requested offsets, and the engine picks the closest point rather than
    interpolating, so a sub-hour axis would flatter the goldens.
    """
    first = start.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    last = end.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    if last < end.astimezone(UTC):
        last += timedelta(hours=1)
    out: list[datetime] = []
    t = first
    while t <= last:
        out.append(t)
        t += timedelta(hours=1)
    return out


class DeterministicMarineAdapter:
    """A ``MarineDataAdapter`` whose answers depend only on their arguments.

    Deliberately without ``prewarm_batch``: the engine asks whether an adapter
    is a ``PrewarmingAdapter`` before batching a corridor, and the "it is not"
    path is the one every cache-backed and stubbed adapter takes in
    production.

    ``fetch_calls`` records how many times the engine asked, which is how a
    sweep proves it does not refetch per window.
    """

    def __init__(self) -> None:
        self.fetch_calls = 0

    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle:
        self.fetch_calls += 1
        axis = hourly_axis(start, end)
        wind_points = tuple(
            WindPoint(time=t, speed_kn=s, direction_deg=d, gust_kn=g)
            for t, (s, d, g) in ((t, wind_at(lat, lon, t)) for t in axis)
        )
        sea_points = tuple(
            SeaPoint(
                time=t,
                wave_height_m=hs,
                wave_period_s=tp,
                wave_direction_deg=wd,
                wind_wave_height_m=None,
                swell_wave_height_m=None,
                current_speed_kn=cur,
                current_direction_to_deg=cur_to,
                tide_height_m=tide,
                current_source=CURRENT_SOURCE,
            )
            for t, (hs, tp, wd, cur, cur_to, tide) in ((t, sea_at(lat, lon, t)) for t in axis)
        )
        requested = models or ["meteofrance_arome_france"]
        return ForecastBundle(
            lat=lat,
            lon=lon,
            start=start,
            end=end,
            wind_by_model={m: WindSeries(model=m, points=wind_points) for m in requested},
            sea=SeaSeries(points=sea_points),
            requested_at=PHASE_EPOCH,
        )


# --------------------------------------------------------------------------
# Payload shapes, so the same numbers can enter the engine by all three doors:
# a stub adapter, a mocked Open-Meteo response, and the browser cache the web
# client posts. Anything that reads differently through one of the three is a
# real divergence, not a fixture mismatch.
# --------------------------------------------------------------------------


def openmeteo_wind_response(lat: float, lon: float, axis: list[datetime]) -> dict[str, object]:
    """The shape ``https://api.open-meteo.com/v1/forecast`` answers with.

    Wind speed is already in knots because the adapter asks for
    ``wind_speed_unit=kn``; it passes the number through untouched.
    """
    values = [wind_at(lat, lon, t) for t in axis]
    return {
        "latitude": lat,
        "longitude": lon,
        "hourly": {
            "time": [t.strftime("%Y-%m-%dT%H:%M") for t in axis],
            "wind_speed_10m": [v[0] for v in values],
            "wind_direction_10m": [v[1] for v in values],
            "wind_gusts_10m": [v[2] for v in values],
        },
    }


def openmeteo_marine_response(lat: float, lon: float, axis: list[datetime]) -> dict[str, object]:
    """The shape ``https://marine-api.open-meteo.com/v1/marine`` answers with.

    Wind-wave and swell split are left null: Open-Meteo does return them, and
    nothing downstream reads them, so the nulls keep the fixture honest about
    which fields the engine actually depends on.
    """
    values = [sea_at(lat, lon, t) for t in axis]
    return {
        "latitude": lat,
        "longitude": lon,
        "hourly": {
            "time": [t.strftime("%Y-%m-%dT%H:%M") for t in axis],
            "wave_height": [v[0] for v in values],
            "wave_period": [v[1] for v in values],
            "wave_direction": [v[2] for v in values],
            "wind_wave_height": [None] * len(axis),
            "swell_wave_height": [None] * len(axis),
            "ocean_current_velocity": [current_kmh_at(lat, lon, t) for t in axis],
            "ocean_current_direction": [v[4] for v in values],
            "sea_level_height_msl": [v[5] for v in values],
        },
    }


def browser_cache_payload(
    points: list[tuple[float, float]],
    axis: list[datetime],
    models: tuple[str, ...] = ("meteofrance_arome_france",),
) -> dict[str, object]:
    """The ``forecast_cache`` object the web client posts, same numbers inside.

    Mirrors ``packages/web/src/api/forecastCache.ts``: one shared millisecond
    time axis, one entry per corridor point, wind split per model slug and sea
    in domain units (knots for the current, "to" convention for its bearing).
    """
    return {
        "version": 1,
        "models": list(models),
        "times_ms": [int(t.timestamp() * 1000) for t in axis],
        "points": [
            {
                "lat": lat,
                "lon": lon,
                "wind_by_model": {
                    slug: {
                        "speed_kn": [wind_at(lat, lon, t)[0] for t in axis],
                        "direction_deg": [wind_at(lat, lon, t)[1] for t in axis],
                        "gust_kn": [wind_at(lat, lon, t)[2] for t in axis],
                    }
                    for slug in models
                },
                "sea": {
                    "wave_height_m": [sea_at(lat, lon, t)[0] for t in axis],
                    "wave_period_s": [sea_at(lat, lon, t)[1] for t in axis],
                    "wave_direction_deg": [sea_at(lat, lon, t)[2] for t in axis],
                    "current_speed_kn": [sea_at(lat, lon, t)[3] for t in axis],
                    "current_direction_to_deg": [sea_at(lat, lon, t)[4] for t in axis],
                    "tide_height_m": [sea_at(lat, lon, t)[5] for t in axis],
                    "current_source": CURRENT_SOURCE,
                },
            }
            for lat, lon in points
        ],
    }
