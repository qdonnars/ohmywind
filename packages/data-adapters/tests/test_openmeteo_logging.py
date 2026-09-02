# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""What the adapter says about its upstream, and what it must never say.

Two things are being pinned. The first is that the calls are observable at
all: before this, a plan that took nine seconds looked exactly like a plan
that took one, and the only way to tell whether the cache was working was to
read the source. The second is that the coordinates stay out of the logs: a
passage's waypoints are where a boat is going, and a query string carrying
them is not something to leave in a Space's console.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

import httpx
import pytest
import respx

from openwind_data.adapters.base import UpstreamRateLimitError
from openwind_data.adapters.openmeteo import FORECAST_URL, MARINE_URL, OpenMeteoAdapter

LOGGER = "openwind_data.adapters.openmeteo"
START = datetime(2026, 4, 26, 0, 0, tzinfo=UTC)
END = datetime(2026, 4, 26, 23, 0, tzinfo=UTC)


@pytest.fixture
def lines(caplog):
    caplog.set_level(logging.DEBUG, logger=LOGGER)
    return lambda level=None: [
        r.getMessage()
        for r in caplog.records
        if r.name == LOGGER and (not level or r.levelno == level)
    ]


@respx.mock
async def test_every_upstream_call_is_logged_with_its_host_and_status(
    lines, forecast_marseille_arome, marine_porquerolles
):
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    await adapter.fetch(lat=43.30, lon=5.35, start=START, end=END)

    calls = [line for line in lines() if line.startswith("open-meteo call")]
    assert len(calls) == 2
    assert any("host=api.open-meteo.com" in line and "status=200" in line for line in calls)
    assert any("host=marine-api.open-meteo.com" in line for line in calls)
    assert all("dur_ms=" in line for line in calls)


@respx.mock
async def test_the_cache_says_whether_it_answered(
    lines, forecast_marseille_arome, marine_porquerolles
):
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    await adapter.fetch(lat=43.30, lon=5.35, start=START, end=END)
    await adapter.fetch(lat=43.30, lon=5.35, start=START, end=END)

    assert sum(line.startswith("forecast cache miss") for line in lines()) == 1
    assert sum(line.startswith("forecast cache hit") for line in lines()) == 1


@respx.mock
async def test_a_refusal_is_a_warning_naming_the_counter_that_tripped(lines, marine_porquerolles):
    """A 429 changes what the user sees, so it is not a DEBUG detail.

    The reason Open-Meteo returns is the difference between "retry in a
    moment" and "this address is spent for the day", which is the one thing
    worth knowing when the Space starts refusing plans.
    """
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            429,
            headers={"Retry-After": "600"},
            json={"reason": "Daily API request limit exceeded"},
        )
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    with pytest.raises(UpstreamRateLimitError):
        await adapter.fetch(lat=43.30, lon=5.35, start=START, end=END)

    warnings = lines(logging.WARNING)
    assert len(warnings) == 1
    assert "Daily API request limit exceeded" in warnings[0]
    assert "retry_after=600s" in warnings[0]
    assert "retrying=False" in warnings[0]


@respx.mock
async def test_a_timeout_is_a_warning_too(lines, marine_porquerolles):
    respx.get(FORECAST_URL).mock(side_effect=httpx.ReadTimeout("upstream is silent"))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    with pytest.raises(httpx.ReadTimeout):
        await adapter.fetch(lat=43.30, lon=5.35, start=START, end=END)

    warnings = lines(logging.WARNING)
    assert any(line.startswith("open-meteo timed out") for line in warnings)
    assert any("host=api.open-meteo.com" in line for line in warnings)


@respx.mock
async def test_no_query_string_and_no_waypoint_ever_reaches_our_log(
    lines, forecast_marseille_arome, marine_porquerolles
):
    """The URL is logged by host, never in full.

    Coordinates rounded to two decimals do appear on the cache lines, and that
    is the deliberate limit: a ~1 km grid cell is what the cache is keyed on,
    and the full-precision waypoints the caller sent stay out.

    httpx's own logger does print the whole URL at INFO, query string
    included. That is why the deployment mutes it below WARNING; see
    ``configure_logging`` in ``packages/hf-space/app.py`` and its test.
    """
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    await adapter.fetch(lat=43.296431, lon=5.354812, start=START, end=END)

    logged = "\n".join(lines())
    assert logged
    assert "43.296431" not in logged
    assert "?" not in logged
    assert "latitude=" not in logged


@respx.mock
async def test_a_joined_flight_is_logged_apart_from_a_cache_hit(
    lines, forecast_marseille_arome, marine_porquerolles
):
    """The join is not a cache hit, and the log must not pretend it is.

    A joiner has already missed the cache by the time it finds a request in
    the air. Reporting both as hits would flatter the cache and hide the fact
    that the round-trip was saved by the single-flight instead.
    """

    async def _slow(payload):
        async def _respond(_request):
            await asyncio.sleep(0.02)
            return httpx.Response(200, json=payload)

        return _respond

    respx.get(FORECAST_URL).mock(side_effect=await _slow(forecast_marseille_arome))
    respx.get(MARINE_URL).mock(side_effect=await _slow(marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    await asyncio.gather(
        *[adapter.fetch(lat=43.30, lon=5.35, start=START, end=END) for _ in range(4)]
    )

    assert sum(line.startswith("forecast single-flight join") for line in lines()) == 3
    assert sum(line.startswith("forecast cache miss") for line in lines()) == 4
    assert not any(line.startswith("forecast cache hit") for line in lines())
