from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from openwind_data.adapters.base import (
    ForecastBundle,
    ForecastHorizonError,
    SeaPoint,
    SeaSeries,
    WindPoint,
    WindSeries,
)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"

DEFAULT_MODEL = "meteofrance_arome_france"

# Ordered fallback when caller passes model="auto": horizon-increasing, with
# the highest-resolution model at each tier. AROME 1.3 km captures Med thermals
# (~48 h); ICON-EU 7 km Europe (~5 d); ECMWF IFS 25 km global (~10 d); GFS 25 km
# global (~16 d, last resort — least skilful in the Med).
AUTO_MODEL = "auto"
AUTO_FALLBACK_CHAIN: tuple[str, ...] = (
    "meteofrance_arome_france",
    "icon_eu",
    "ecmwf_ifs025",
    "gfs_seamless",
)

# Open-Meteo's forecast endpoint caps both ``start_date`` and ``end_date`` to
# roughly today + 16 d (model-agnostic — the cap is on the API, not the model).
# We cap one day below that to leave margin for clock skew and same-day TZ
# crossings. Beyond this, we surface ``ForecastHorizonError`` directly without
# burning an HTTP round-trip — no model in the chain can serve the request.
API_MAX_FUTURE_DAYS = 14

_WIND_VARS = "wind_speed_10m,wind_direction_10m,wind_gusts_10m"
_MARINE_VARS = (
    "wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,"
    "ocean_current_velocity,ocean_current_direction,sea_level_height_msl"
)

# Open-Meteo Marine returns ocean_current_velocity in **km/h by default** (the
# ``length_unit`` parameter would switch to m/s on ``metric``, but we don't
# pass it). Convert at ingestion to keep the domain in knots — 1 nautical mile
# = 1852 m by definition, so 1 kn = 1.852 km/h.
_KMH_TO_KN = 1 / 1.852

CACHE_TTL = timedelta(minutes=30)
# Lat/lon rounding for cache key — 2dp ≈ 1.1 km, matches AROME native grid (~1.3 km).
# Two waypoints in the same AROME cell share a cache entry.
GRID_DECIMALS = 2
# When fetching uncached, prefetch this many days from the start so that subsequent
# calls with later `departure` windows in the same forecast issue still hit cache.
FETCH_HORIZON_DAYS = 7
# Cap entries per adapter instance — adapter may live across many MCP tool
# calls; without a cap, each new (lat, lon, models) tuple grows the dict.
CACHE_MAX_ENTRIES = 64
# Minimum spacing between consecutive HTTP request *starts* on a single adapter.
# A passage routes 12+ sub-segments through `asyncio.gather`, each fetching wind
# + sea; without pacing, that's 24 simultaneous requests on the HF Space's
# shared egress IP, which Open-Meteo rate-limits. The lock serialises starts
# (cache hits stay free); 0.1 s ≈ 10 req/s, well under the public-API quota.
# Disable in tests with `http_min_interval_s=0`.
DEFAULT_HTTP_MIN_INTERVAL_S = 0.1


@dataclass(frozen=True, slots=True)
class _CacheKey:
    lat_round: float
    lon_round: float
    models: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class _CacheEntry:
    fetched_at: datetime
    bundle: ForecastBundle  # bundle.start / bundle.end define the cached window


class OpenMeteoAdapter:
    """Fetches wind (multi-model) and sea state from Open-Meteo's keyless APIs.

    All inputs and outputs are in UTC. Caller is responsible for any local-timezone
    rendering downstream.

    Cache: 30 min in-memory keyed on rounded lat/lon (2 decimals, ~1.1 km, matches
    AROME native grid) and the sorted set of models. The cache stores the widest
    [start, end] ever requested for a given key and slices on read; subsequent
    requests that fall inside a cached window are served without an HTTP call,
    even if the requested time window differs from the original.

    Default model is AROME (Mediterranean focus, high-resolution capture of thermal
    and local winds).
    """

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        *,
        timeout: float = 10.0,
        http_min_interval_s: float = DEFAULT_HTTP_MIN_INTERVAL_S,
    ) -> None:
        self._client = client
        self._timeout = timeout
        self._cache: dict[_CacheKey, _CacheEntry] = {}
        self._http_min_interval_s = http_min_interval_s
        self._http_lock = asyncio.Lock()
        self._last_http_at: float = 0.0

    async def _pace_http(self) -> None:
        """Block until ≥ ``http_min_interval_s`` has elapsed since the last
        HTTP start on this adapter. Cache hits never reach this — they stay
        free.
        """
        if self._http_min_interval_s <= 0:
            return
        async with self._http_lock:
            elapsed = time.monotonic() - self._last_http_at
            wait = self._http_min_interval_s - elapsed
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_http_at = time.monotonic()

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

        models = models or [DEFAULT_MODEL]
        key = _CacheKey(
            lat_round=round(lat, GRID_DECIMALS),
            lon_round=round(lon, GRID_DECIMALS),
            models=tuple(sorted(models)),
        )
        now = datetime.now(UTC)
        # Open-Meteo's start_date/end_date both must fall within ~today+15. If the
        # caller wants data past that cap, no model in the chain can help — fail
        # fast with ForecastHorizonError so the auto-fallback exhausts cleanly
        # and the API layer returns 422 instead of bubbling an httpx 400 → 500.
        api_max_end = now + timedelta(days=API_MAX_FUTURE_DAYS)
        if start_utc > api_max_end:
            raise ForecastHorizonError(models[0], start_utc)
        cached = self._cache.get(key)
        if (
            cached is not None
            and (now - cached.fetched_at) < CACHE_TTL
            and cached.bundle.start <= start_utc
            and cached.bundle.end >= end_utc
        ):
            return _slice_bundle(cached.bundle, start_utc, end_utc)

        # Fetch a wide window so future calls with later `departure` can be served
        # from cache. If a stale-but-narrower entry exists, widen to cover both.
        # Always cap at api_max_end so the prefetch never exceeds Open-Meteo's
        # date-range limit (the +7 d widening would otherwise trip the cap as
        # soon as start_utc is within 7 d of api_max_end).
        fetch_start = start_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        fetch_end = max(end_utc, start_utc + timedelta(days=FETCH_HORIZON_DAYS))
        if cached is not None:
            fetch_start = min(fetch_start, cached.bundle.start)
            fetch_end = max(fetch_end, cached.bundle.end)
        fetch_end = min(fetch_end, api_max_end)

        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=self._timeout)
        try:
            wind_tasks = [
                self._fetch_wind(client, lat, lon, fetch_start, fetch_end, m) for m in models
            ]
            sea_task = self._fetch_sea(client, lat, lon, fetch_start, fetch_end)
            results = await asyncio.gather(*wind_tasks, sea_task)
        finally:
            if owns_client:
                await client.aclose()

        wind_series_list: list[WindSeries] = list(results[:-1])
        sea_series: SeaSeries = results[-1]
        full_bundle = ForecastBundle(
            lat=lat,
            lon=lon,
            start=fetch_start,
            end=fetch_end,
            wind_by_model={w.model: w for w in wind_series_list},
            sea=sea_series,
            requested_at=now,
        )
        if len(self._cache) >= CACHE_MAX_ENTRIES and key not in self._cache:
            self._cache.pop(next(iter(self._cache)))  # FIFO eviction
        self._cache[key] = _CacheEntry(fetched_at=now, bundle=full_bundle)
        return _slice_bundle(full_bundle, start_utc, end_utc)

    async def _fetch_wind(
        self,
        client: httpx.AsyncClient,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        model: str,
    ) -> WindSeries:
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": _WIND_VARS,
            "wind_speed_unit": "kn",
            "models": model,
            "timezone": "UTC",
            "start_date": start.date().isoformat(),
            "end_date": end.date().isoformat(),
        }
        await self._pace_http()
        resp = await client.get(FORECAST_URL, params=params)
        _raise_for_status_with_horizon(resp, model, start)
        return _parse_wind(resp.json(), model, start, end)

    async def _fetch_sea(
        self,
        client: httpx.AsyncClient,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
    ) -> SeaSeries:
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": _MARINE_VARS,
            "timezone": "UTC",
            "start_date": start.date().isoformat(),
            "end_date": end.date().isoformat(),
        }
        await self._pace_http()
        resp = await client.get(MARINE_URL, params=params)
        _raise_for_status_with_horizon(resp, "open-meteo-marine", start)
        return _parse_sea(resp.json(), start, end)


def _raise_for_status_with_horizon(
    resp: httpx.Response, model: str, requested_time: datetime
) -> None:
    """Defense-in-depth: if Open-Meteo rejects the date range with a 400,
    translate to ``ForecastHorizonError`` so the auto-fallback chain reacts
    instead of surfacing a raw ``HTTPStatusError`` (which would 500 the API).
    Other 400s (malformed params, etc.) keep their native exception so real
    bugs stay visible.
    """
    if resp.status_code == 400:
        try:
            payload = resp.json()
        except ValueError:
            payload = {}
        reason = str(payload.get("reason", ""))
        if "out of allowed range" in reason and ("start_date" in reason or "end_date" in reason):
            raise ForecastHorizonError(model, requested_time)
    resp.raise_for_status()


def _slice_bundle(bundle: ForecastBundle, start: datetime, end: datetime) -> ForecastBundle:
    """Return a view of ``bundle`` restricted to [start, end]."""
    sliced_winds = {
        model: WindSeries(
            model=series.model,
            points=tuple(p for p in series.points if start <= p.time <= end),
        )
        for model, series in bundle.wind_by_model.items()
    }
    sliced_sea = SeaSeries(points=tuple(p for p in bundle.sea.points if start <= p.time <= end))
    return ForecastBundle(
        lat=bundle.lat,
        lon=bundle.lon,
        start=start,
        end=end,
        wind_by_model=sliced_winds,
        sea=sliced_sea,
        requested_at=bundle.requested_at,
    )


def _parse_wind(data: dict[str, Any], model: str, start: datetime, end: datetime) -> WindSeries:
    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    speeds = hourly.get("wind_speed_10m") or []
    dirs = hourly.get("wind_direction_10m") or []
    gusts = hourly.get("wind_gusts_10m") or []
    points: list[WindPoint] = []
    for t, s, d, g in zip(times, speeds, dirs, gusts, strict=True):
        ts = _parse_iso_utc(t)
        if not (start <= ts <= end):
            continue
        if s is None or d is None:
            continue
        points.append(
            WindPoint(
                time=ts,
                speed_kn=float(s),
                direction_deg=float(d),
                gust_kn=_opt_float(g),
            )
        )
    return WindSeries(model=model, points=tuple(points))


def _parse_sea(data: dict[str, Any], start: datetime, end: datetime) -> SeaSeries:
    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    h = hourly.get("wave_height") or []
    p = hourly.get("wave_period") or []
    d = hourly.get("wave_direction") or []
    wwh = hourly.get("wind_wave_height") or []
    swh = hourly.get("swell_wave_height") or []
    cur_v = hourly.get("ocean_current_velocity") or []
    cur_d = hourly.get("ocean_current_direction") or []
    tide = hourly.get("sea_level_height_msl") or []
    n = len(times)
    cur_v = list(cur_v) + [None] * (n - len(cur_v))
    cur_d = list(cur_d) + [None] * (n - len(cur_d))
    tide = list(tide) + [None] * (n - len(tide))
    points: list[SeaPoint] = []
    for t, h_, p_, d_, wwh_, swh_, cv_, cd_, tide_ in zip(
        times, h, p, d, wwh, swh, cur_v, cur_d, tide, strict=True
    ):
        ts = _parse_iso_utc(t)
        if not (start <= ts <= end):
            continue
        cv_kn = None if cv_ is None else float(cv_) * _KMH_TO_KN
        # Tag SMOC currents with provenance so downstream code (router,
        # SegmentReport) can distinguish them from MARC PREVIMER overrides.
        smoc_source = "openmeteo_smoc" if cv_kn is not None or tide_ is not None else None
        points.append(
            SeaPoint(
                time=ts,
                wave_height_m=_opt_float(h_),
                wave_period_s=_opt_float(p_),
                wave_direction_deg=_opt_float(d_),
                wind_wave_height_m=_opt_float(wwh_),
                swell_wave_height_m=_opt_float(swh_),
                current_speed_kn=cv_kn,
                current_direction_to_deg=_opt_float(cd_),
                tide_height_m=_opt_float(tide_),
                current_source=smoc_source,
            )
        )
    return SeaSeries(points=tuple(points))


def _parse_iso_utc(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=UTC)


def _opt_float(v: Any) -> float | None:
    if v is None:
        return None
    return float(v)
