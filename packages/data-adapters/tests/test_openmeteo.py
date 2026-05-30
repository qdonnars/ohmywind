from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx

from openwind_data.adapters.base import ForecastHorizonError
from openwind_data.adapters.openmeteo import (
    API_MAX_FUTURE_DAYS,
    DEFAULT_MODEL,
    FORECAST_URL,
    MARINE_URL,
    OpenMeteoAdapter,
)


def _start_end():
    start = datetime(2026, 4, 26, 0, 0, tzinfo=UTC)
    end = datetime(2026, 4, 26, 23, 0, tzinfo=UTC)
    return start, end


@respx.mock
async def test_fetch_returns_bundle_with_default_model(
    forecast_marseille_arome, marine_porquerolles
):
    forecast_route = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=forecast_marseille_arome)
    )
    marine_route = respx.get(MARINE_URL).mock(
        return_value=httpx.Response(200, json=marine_porquerolles)
    )

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    bundle = await adapter.fetch(lat=43.30, lon=5.35, start=start, end=end)

    assert forecast_route.call_count == 1
    assert marine_route.call_count == 1
    assert DEFAULT_MODEL in bundle.wind_by_model
    wind = bundle.wind_by_model[DEFAULT_MODEL]
    assert wind.model == DEFAULT_MODEL
    assert len(wind.points) == 24
    # First point of fixture
    assert wind.points[0].time == datetime(2026, 4, 26, 0, 0, tzinfo=UTC)
    assert wind.points[0].speed_kn == 4.3
    assert wind.points[0].direction_deg == 87
    assert wind.points[0].gust_kn == 7.8

    assert len(bundle.sea.points) == 24
    sea0 = bundle.sea.points[0]
    assert sea0.time == datetime(2026, 4, 26, 0, 0, tzinfo=UTC)
    # Marine fixture has all sea fields populated
    assert sea0.wave_height_m is not None


@respx.mock
async def test_marine_request_includes_currents_and_tide_vars(
    forecast_marseille_arome, marine_porquerolles
):
    """Marine endpoint must request currents and tide height alongside waves
    so the UI can surface the Currents/Tides pills when relevant. Counted
    against Open-Meteo's 10-variable-per-call limit: 8/10 used.
    """
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    marine_route = respx.get(MARINE_URL).mock(
        return_value=httpx.Response(200, json=marine_porquerolles)
    )

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    await adapter.fetch(lat=43.30, lon=5.35, start=start, end=end)

    requested = marine_route.calls.last.request.url.params["hourly"].split(",")
    assert "ocean_current_velocity" in requested
    assert "ocean_current_direction" in requested
    assert "sea_level_height_msl" in requested
    assert len(requested) <= 10


@respx.mock
async def test_parse_sea_converts_current_to_knots_and_keeps_tide_in_meters(
    forecast_marseille_arome, marine_porquerolles
):
    """Open-Meteo Marine returns ocean_current_velocity in km/h by default
    (no length_unit override passed). Domain is in knots, so the adapter
    converts at ingestion using 1 kn = 1.852 km/h. Tide height stays in
    meters (no conversion).
    """
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    bundle = await adapter.fetch(lat=43.30, lon=5.35, start=start, end=end)

    sea0 = bundle.sea.points[0]
    # Fixture: 0.05 km/h → 0.05 / 1.852 ≈ 0.0270 kn (Med, well below the
    # 0.3 kn relevance threshold — currents pill should stay hidden).
    assert sea0.current_speed_kn == pytest.approx(0.0270, abs=1e-3)
    assert sea0.current_direction_to_deg == 135.0
    assert sea0.tide_height_m == -0.10

    # Med fixture is intentionally below both relevance thresholds — sanity
    # check so future fixture edits don't accidentally cross them.
    max_current = max(p.current_speed_kn for p in bundle.sea.points)
    assert max_current < 0.3
    tides = [p.tide_height_m for p in bundle.sea.points]
    assert (max(tides) - min(tides)) < 0.5


@respx.mock
async def test_parse_sea_handles_missing_current_and_tide_fields(
    forecast_marseille_arome, marine_porquerolles
):
    """Defense against Open-Meteo grids without SMOC coverage (e.g. lakes,
    inland points): if currents/tide arrays are absent or shorter than time,
    the parser must fill with None rather than raising.
    """
    payload = dict(marine_porquerolles)
    hourly = dict(payload["hourly"])
    hourly.pop("ocean_current_velocity", None)
    hourly.pop("ocean_current_direction", None)
    hourly.pop("sea_level_height_msl", None)
    payload["hourly"] = hourly

    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=payload))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    bundle = await adapter.fetch(lat=43.30, lon=5.35, start=start, end=end)

    sea0 = bundle.sea.points[0]
    assert sea0.current_speed_kn is None
    assert sea0.current_direction_to_deg is None
    assert sea0.tide_height_m is None
    assert sea0.wave_height_m is not None  # waves still parse


@respx.mock
async def test_fetch_passes_arome_as_default_model_param(
    forecast_marseille_arome, marine_porquerolles
):
    forecast_route = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=forecast_marseille_arome)
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    await adapter.fetch(lat=43.30, lon=5.35, start=start, end=end)

    sent = forecast_route.calls.last.request
    assert sent.url.params["models"] == DEFAULT_MODEL
    assert sent.url.params["wind_speed_unit"] == "kn"
    assert sent.url.params["timezone"] == "UTC"


@respx.mock
async def test_cache_hits_within_ttl(forecast_marseille_arome, marine_porquerolles):
    forecast_route = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=forecast_marseille_arome)
    )
    marine_route = respx.get(MARINE_URL).mock(
        return_value=httpx.Response(200, json=marine_porquerolles)
    )

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    await adapter.fetch(lat=43.30, lon=5.35, start=start, end=end)
    await adapter.fetch(lat=43.30, lon=5.35, start=start, end=end)

    assert forecast_route.call_count == 1
    assert marine_route.call_count == 1


@respx.mock
async def test_cache_serves_subwindow_without_refetch(
    forecast_marseille_arome, marine_porquerolles
):
    """A second fetch with a narrower [start, end] inside the cached window must hit cache."""
    forecast_route = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=forecast_marseille_arome)
    )
    marine_route = respx.get(MARINE_URL).mock(
        return_value=httpx.Response(200, json=marine_porquerolles)
    )

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    await adapter.fetch(lat=43.30, lon=5.35, start=start, end=end)
    # Sub-window inside the original day — must be served from cache.
    sub_start = datetime(2026, 4, 26, 6, 0, tzinfo=UTC)
    sub_end = datetime(2026, 4, 26, 12, 0, tzinfo=UTC)
    bundle = await adapter.fetch(lat=43.30, lon=5.35, start=sub_start, end=sub_end)

    assert forecast_route.call_count == 1
    assert marine_route.call_count == 1
    wind = bundle.wind_by_model[DEFAULT_MODEL]
    assert all(sub_start <= p.time <= sub_end for p in wind.points)
    assert len(wind.points) == 7  # 06:00..12:00 inclusive


@respx.mock
async def test_cache_dedupes_close_lat_lon_within_grid_cell(
    forecast_marseille_arome, marine_porquerolles
):
    """Two waypoints within the AROME grid cell (~1.1 km) share a cache entry."""
    forecast_route = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=forecast_marseille_arome)
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    await adapter.fetch(lat=43.301, lon=5.351, start=start, end=end)
    await adapter.fetch(lat=43.304, lon=5.348, start=start, end=end)  # same 2dp cell

    assert forecast_route.call_count == 1


@respx.mock
async def test_multi_model_runs_parallel_requests(forecast_marseille_arome, marine_porquerolles):
    forecast_route = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=forecast_marseille_arome)
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    bundle = await adapter.fetch(
        lat=43.30,
        lon=5.35,
        start=start,
        end=end,
        models=["meteofrance_arome_france", "ecmwf_ifs025", "icon_seamless"],
    )

    assert forecast_route.call_count == 3
    assert set(bundle.wind_by_model.keys()) == {
        "meteofrance_arome_france",
        "ecmwf_ifs025",
        "icon_seamless",
    }


async def test_naive_datetime_raises():
    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    with pytest.raises(ValueError, match="timezone-aware"):
        await adapter.fetch(
            lat=43.0,
            lon=5.0,
            start=datetime(2026, 4, 26, 0, 0),
            end=datetime(2026, 4, 26, 23, 0, tzinfo=UTC),
        )


async def test_end_before_start_raises():
    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    end = datetime(2026, 4, 26, 0, 0, tzinfo=UTC)
    start = datetime(2026, 4, 26, 23, 0, tzinfo=UTC)
    with pytest.raises(ValueError, match="after start"):
        await adapter.fetch(lat=43.0, lon=5.0, start=start, end=end)


@respx.mock
async def test_http_error_propagates(marine_porquerolles):
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(500))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    with pytest.raises(httpx.HTTPStatusError):
        await adapter.fetch(lat=43.0, lon=5.0, start=start, end=end)


async def test_start_past_api_cap_raises_horizon_error_without_http():
    """If start_date exceeds Open-Meteo's date-range cap, fail fast with
    ForecastHorizonError — no HTTP call burned, auto-fallback exhausts cleanly,
    API layer returns 422 instead of bubbling httpx 400 → 500.
    """
    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    far_start = datetime.now(UTC) + timedelta(days=API_MAX_FUTURE_DAYS + 5)
    far_end = far_start + timedelta(hours=12)
    with respx.mock(assert_all_called=False) as r:
        forecast = r.get(FORECAST_URL).mock(return_value=httpx.Response(200, json={}))
        marine = r.get(MARINE_URL).mock(return_value=httpx.Response(200, json={}))
        with pytest.raises(ForecastHorizonError):
            await adapter.fetch(lat=43.0, lon=5.0, start=far_start, end=far_end)
        assert forecast.call_count == 0
        assert marine.call_count == 0


@respx.mock
async def test_prefetch_end_capped_to_api_max(forecast_marseille_arome, marine_porquerolles):
    """The +7d prefetch widening must not push end_date past Open-Meteo's cap —
    otherwise even passages within the cap break."""
    forecast_route = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=forecast_marseille_arome)
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    now = datetime.now(UTC)
    start = now + timedelta(days=API_MAX_FUTURE_DAYS - 2)
    end = start + timedelta(hours=12)
    await adapter.fetch(lat=43.30, lon=5.35, start=start, end=end)

    sent = forecast_route.calls.last.request
    end_date_sent = datetime.fromisoformat(sent.url.params["end_date"]).date()
    api_max = (now + timedelta(days=API_MAX_FUTURE_DAYS)).date()
    assert end_date_sent <= api_max


@respx.mock
async def test_om_400_horizon_translates_to_forecast_horizon_error(marine_porquerolles):
    """Open-Meteo returns 400 with 'out of allowed range' when start/end_date
    exceed the API cap. We translate that to ForecastHorizonError so the auto-
    fallback chain reacts (defense-in-depth — the cap above should prevent it).
    """
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            400,
            json={
                "error": True,
                "reason": "Parameter 'end_date' is out of allowed range from X to Y",
            },
        )
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    with pytest.raises(ForecastHorizonError):
        await adapter.fetch(lat=43.0, lon=5.0, start=start, end=end)


@respx.mock
async def test_om_400_other_keeps_http_error(marine_porquerolles):
    """A 400 with an unrelated reason (e.g. malformed param) must keep its
    HTTPStatusError so real bugs stay visible — only horizon errors translate.
    """
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            400, json={"error": True, "reason": "Parameter 'latitude' must be a number"}
        )
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()
    with pytest.raises(httpx.HTTPStatusError):
        await adapter.fetch(lat=43.0, lon=5.0, start=start, end=end)


@respx.mock
async def test_http_pacing_serializes_concurrent_starts(
    forecast_marseille_arome, marine_porquerolles
):
    # A passage routes ~12 sub-segments through asyncio.gather; without pacing
    # that's a 24-request burst on Open-Meteo's free tier. The lock should
    # space starts by ≥http_min_interval_s. Use distinct lat/lon so the cache
    # never short-circuits the HTTP path.
    import asyncio
    import time

    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0.05)
    start, end = _start_end()
    coords = [(43.30, 5.30), (43.40, 5.30), (43.50, 5.30), (43.60, 5.30)]

    t0 = time.monotonic()
    await asyncio.gather(
        *[adapter.fetch(lat=lat, lon=lon, start=start, end=end) for lat, lon in coords]
    )
    elapsed = time.monotonic() - t0

    # 4 fetches x 2 endpoints = 8 HTTP starts; serialized at 50ms each => >=350ms
    # for the spaces between starts (8 starts means 7 inter-start gaps). Be
    # generous on the upper bound to keep the test stable on slow CI.
    assert elapsed >= 0.35, f"pacing not enforced (elapsed={elapsed:.3f}s)"


async def test_http_pacing_disabled_when_zero(forecast_marseille_arome, marine_porquerolles):
    # http_min_interval_s=0 must skip the lock entirely (cheap path for tests
    # and for callers who already rate-limit upstream).
    import asyncio
    import time

    with respx.mock(assert_all_called=False) as r:
        r.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
        r.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

        adapter = OpenMeteoAdapter(http_min_interval_s=0)
        start, end = _start_end()
        coords = [(43.30, 5.30), (43.40, 5.30), (43.50, 5.30), (43.60, 5.30)]

        t0 = time.monotonic()
        await asyncio.gather(
            *[adapter.fetch(lat=lat, lon=lon, start=start, end=end) for lat, lon in coords]
        )
        elapsed = time.monotonic() - t0

    # No artificial wait: 4 mocked fetches in parallel should finish in well
    # under 100ms on any sane runner.
    assert elapsed < 0.1, f"unexpected slowdown with pacing off (elapsed={elapsed:.3f}s)"
