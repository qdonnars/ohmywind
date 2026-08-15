# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Adapter backed by a client-supplied forecast cache.

Instead of calling Open-Meteo, this adapter reads wind (multi-model) and sea
state from an in-memory cache the web client posted alongside a passage
request. The client samples the route corridor in the browser (one Open-Meteo
call per user IP rather than per HF Space IP), so this distributes the
upstream load that the single-IP server path would otherwise concentrate.

The server keeps full authority over segmentation and timing: it calls
``fetch(lat, lon, start, end, models=[slug])`` per segment exactly as it does
with :class:`~openwind_data.adapters.openmeteo.OpenMeteoAdapter`. Spatial
lookup is nearest-neighbour over the corridor points; temporal lookup clips a
shared hourly axis to ``[start, end]``.

All values arrive already in domain units (knots, meteorological "from" wind
direction, oceanographic "to" current direction) — the client does every
conversion — so this adapter is a pure passthrough and performs no arithmetic
on the values. It satisfies the :class:`MarineDataAdapter` Protocol
structurally (no inheritance) and is used only on the HTTP
``/api/v1/passage`` path when the body carries ``forecast_cache``; the MCP
path keeps the live :class:`OpenMeteoAdapter`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from openwind_data.adapters.base import (
    ForecastBundle,
    SeaPoint,
    SeaSeries,
    WindPoint,
    WindSeries,
)
from openwind_data.routing.geometry import Point, haversine_distance

# Bump when the payload shape changes incompatibly; ``from_payload`` rejects
# anything it does not recognise so an old web bundle never silently
# mis-parses against a newer server.
SUPPORTED_VERSION = 1

# Sea field names carried per corridor point, index-aligned to the shared time
# axis. Mirrors ``SeaPoint`` minus ``time``/``current_source`` (handled
# separately) and the openmeteo ``_parse_sea`` output.
_SEA_FIELDS = (
    "wave_height_m",
    "wave_period_s",
    "wave_direction_deg",
    "wind_wave_height_m",
    "swell_wave_height_m",
    "current_speed_kn",
    "current_direction_to_deg",
    "tide_height_m",
)


@dataclass(frozen=True, slots=True)
class _CachePoint:
    lat: float
    lon: float
    # slug -> (speed_kn[], direction_deg[], gust_kn[]), each aligned to the
    # shared time axis. A slug absent here means "this model has no data at
    # this point" — fetch() returns an empty WindSeries so the server's
    # per-segment fallback chain advances, exactly like OpenMeteo off-coverage.
    wind_by_model: dict[str, tuple[list[float | None], ...]]
    # field name -> values[], aligned to the shared time axis.
    sea: dict[str, list[float | None]]
    # Provenance applied to every covered hour of this point (overlay coverage
    # is per-location, not per-hour): "openmeteo_smoc" | "marc_<atlas>_<res>m"
    # | "shom_c2d_*" | None.
    current_source: str | None


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise ValueError(msg)


def _as_float_list(raw: Any, n: int, field: str) -> list[float | None]:
    _require(isinstance(raw, list), f"{field} must be a list")
    _require(len(raw) == n, f"{field} length {len(raw)} != time axis length {n}")
    out: list[float | None] = []
    for v in raw:
        if v is None:
            out.append(None)
        else:
            try:
                out.append(float(v))
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{field} has non-numeric value {v!r}") from exc
    return out


class CacheBackedAdapter:
    """Reads wind + sea from a client-supplied corridor cache. See module docstring."""

    def __init__(
        self,
        models: tuple[str, ...],
        times: tuple[datetime, ...],
        points: tuple[_CachePoint, ...],
    ) -> None:
        self._models = models
        self._times = times
        self._points = points

    @property
    def models(self) -> tuple[str, ...]:
        """Backend model slugs present in the cache, in priority order.

        The HTTP endpoint uses this as the ``model_chain`` so the server's AUTO
        fallback only walks models the client actually sampled.
        """
        return self._models

    # ------------------------------------------------------------------ build

    @classmethod
    def from_payload(cls, payload: Any) -> CacheBackedAdapter:
        """Build an adapter from the parsed ``forecast_cache`` JSON object.

        Raises ``ValueError`` on any shape mismatch so the HTTP layer can
        return 422 (mirrors ``_parse_polar`` in app.py) rather than 500.
        """
        _require(isinstance(payload, dict), "forecast_cache must be an object")
        version = payload.get("version")
        _require(version == SUPPORTED_VERSION, f"unsupported version {version!r}")

        models_raw = payload.get("models")
        _require(
            isinstance(models_raw, list) and len(models_raw) > 0,
            "models must be a non-empty list",
        )
        _require(all(isinstance(m, str) for m in models_raw), "models must be strings")
        models = tuple(models_raw)

        times_raw = payload.get("times_ms")
        _require(
            isinstance(times_raw, list) and len(times_raw) > 0,
            "times_ms must be a non-empty list",
        )
        times: list[datetime] = []
        for ms in times_raw:
            _require(isinstance(ms, (int, float)), "times_ms entries must be numbers")
            times.append(datetime.fromtimestamp(ms / 1000.0, tz=UTC))
        n = len(times)

        points_raw = payload.get("points")
        _require(isinstance(points_raw, list), "points must be a list")
        points: list[_CachePoint] = []
        for i, pt in enumerate(points_raw):
            _require(isinstance(pt, dict), f"points[{i}] must be an object")
            try:
                lat = float(pt["lat"])
                lon = float(pt["lon"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(f"points[{i}] missing valid lat/lon") from exc

            wbm_raw = pt.get("wind_by_model") or {}
            _require(isinstance(wbm_raw, dict), f"points[{i}].wind_by_model must be an object")
            wind_by_model: dict[str, tuple[list[float | None], ...]] = {}
            for slug, series in wbm_raw.items():
                _require(
                    isinstance(series, dict),
                    f"points[{i}].wind_by_model[{slug}] must be an object",
                )
                speed = _as_float_list(series.get("speed_kn"), n, f"points[{i}].{slug}.speed_kn")
                direction = _as_float_list(
                    series.get("direction_deg"), n, f"points[{i}].{slug}.direction_deg"
                )
                gust = _as_float_list(series.get("gust_kn"), n, f"points[{i}].{slug}.gust_kn")
                wind_by_model[slug] = (speed, direction, gust)

            sea_raw = pt.get("sea") or {}
            _require(isinstance(sea_raw, dict), f"points[{i}].sea must be an object")
            sea: dict[str, list[float | None]] = {}
            for field in _SEA_FIELDS:
                raw = sea_raw.get(field)
                # Optional fields default to all-null (e.g. a coastal spot with
                # no wave coverage), matching the openmeteo padding behaviour.
                if raw is None:
                    sea[field] = [None] * n
                else:
                    sea[field] = _as_float_list(raw, n, f"points[{i}].sea.{field}")
            current_source = sea_raw.get("current_source")
            _require(
                current_source is None or isinstance(current_source, str),
                f"points[{i}].sea.current_source must be a string or null",
            )

            points.append(
                _CachePoint(
                    lat=lat,
                    lon=lon,
                    wind_by_model=wind_by_model,
                    sea=sea,
                    current_source=current_source,
                )
            )

        return cls(models=models, times=tuple(times), points=tuple(points))

    # ------------------------------------------------------------------ fetch

    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle:
        if start.tzinfo is None or end.tzinfo is None:
            raise ValueError("start and end must be timezone-aware datetimes")
        start_utc = start.astimezone(UTC)
        end_utc = end.astimezone(UTC)
        if end_utc <= start_utc:
            raise ValueError("end must be strictly after start")

        requested = list(models) if models else list(self._models)

        point = self._nearest(lat, lon)
        if point is None:
            # Empty cache: behave like a total off-coverage miss so the caller
            # surfaces a clean "no model covered" rather than a crash.
            return ForecastBundle(
                lat=lat,
                lon=lon,
                start=start_utc,
                end=end_utc,
                wind_by_model={m: WindSeries(model=m, points=()) for m in requested},
                sea=SeaSeries(points=()),
                requested_at=datetime.now(UTC),
            )

        # Indices of the shared time axis that fall inside the requested window.
        idx = [i for i, t in enumerate(self._times) if start_utc <= t <= end_utc]

        wind_by_model = {slug: self._wind_series(point, slug, idx) for slug in requested}
        sea = self._sea_series(point, idx)
        return ForecastBundle(
            lat=lat,
            lon=lon,
            start=start_utc,
            end=end_utc,
            wind_by_model=wind_by_model,
            sea=sea,
            requested_at=datetime.now(UTC),
        )

    # ---------------------------------------------------------------- helpers

    def _nearest(self, lat: float, lon: float) -> _CachePoint | None:
        if not self._points:
            return None
        target = Point(lat=lat, lon=lon)
        return min(
            self._points,
            key=lambda p: haversine_distance(target, Point(lat=p.lat, lon=p.lon)),
        )

    def _wind_series(self, point: _CachePoint, slug: str, idx: list[int]) -> WindSeries:
        series = point.wind_by_model.get(slug)
        if series is None:
            # Slug absent at this point -> empty series triggers the server's
            # per-segment model fallback (identical to OpenMeteo off-coverage).
            return WindSeries(model=slug, points=())
        speed, direction, gust = series
        points: list[WindPoint] = []
        for i in idx:
            s = speed[i]
            d = direction[i]
            # Drop null wind exactly like openmeteo._parse_wind so that
            # _segment_has_wind sees the same "usable point" semantics.
            if s is None or d is None:
                continue
            points.append(
                WindPoint(time=self._times[i], speed_kn=s, direction_deg=d, gust_kn=gust[i])
            )
        return WindSeries(model=slug, points=tuple(points))

    def _sea_series(self, point: _CachePoint, idx: list[int]) -> SeaSeries:
        sea = point.sea
        points: list[SeaPoint] = []
        for i in idx:
            cur = sea["current_speed_kn"][i]
            tide = sea["tide_height_m"][i]
            # Mirror openmeteo._parse_sea: only tag provenance on hours that
            # actually carry current/tide data.
            source = point.current_source if (cur is not None or tide is not None) else None
            points.append(
                SeaPoint(
                    time=self._times[i],
                    wave_height_m=sea["wave_height_m"][i],
                    wave_period_s=sea["wave_period_s"][i],
                    wave_direction_deg=sea["wave_direction_deg"][i],
                    wind_wave_height_m=sea["wind_wave_height_m"][i],
                    swell_wave_height_m=sea["swell_wave_height_m"][i],
                    current_speed_kn=cur,
                    current_direction_to_deg=sea["current_direction_to_deg"][i],
                    tide_height_m=tide,
                    current_source=source,
                )
            )
        return SeaSeries(points=tuple(points))
