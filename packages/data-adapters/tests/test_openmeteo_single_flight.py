# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Concurrent identical fetches share one round-trip, and a borrowed client lives on.

Both properties matter for the same reason: on the deployment there is a
single egress IP, Open-Meteo counts requests against it, and a passage fans
its segments out with ``asyncio.gather``. The cache only helps a caller that
arrives after an answer landed; several segments asking for the same AROME
cell in the same tick all missed it and all paid, which the 2026-09 audit
filed as Mo3.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import httpx
import pytest
import respx

from openwind_data.adapters.base import UpstreamRateLimitError
from openwind_data.adapters.openmeteo import (
    FORECAST_URL,
    MARINE_URL,
    OpenMeteoAdapter,
)

START = datetime(2026, 4, 26, 0, 0, tzinfo=UTC)
END = datetime(2026, 4, 26, 23, 0, tzinfo=UTC)


def _slow(payload: dict, delay: float = 0.02):
    """A responder that yields to the loop, so callers really do overlap.

    Without the await, respx answers inline and the first fetch is finished
    before the second one is even scheduled: the test would pass with no
    single-flight at all.
    """

    async def _respond(_request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(delay)
        return httpx.Response(200, json=payload)

    return _respond


@respx.mock
async def test_concurrent_identical_fetches_make_one_request(
    forecast_marseille_arome, marine_porquerolles
):
    forecast = respx.get(FORECAST_URL).mock(side_effect=_slow(forecast_marseille_arome))
    marine = respx.get(MARINE_URL).mock(side_effect=_slow(marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    bundles = await asyncio.gather(
        *[adapter.fetch(lat=43.30, lon=5.35, start=START, end=END) for _ in range(6)]
    )

    assert forecast.call_count == 1
    assert marine.call_count == 1
    # Every joiner gets the same numbers as the caller that did the work.
    first = bundles[0].wind_by_model["meteofrance_arome_france"].points
    for bundle in bundles[1:]:
        assert bundle.wind_by_model["meteofrance_arome_france"].points == first
        assert bundle.start == bundles[0].start
        assert bundle.end == bundles[0].end


@respx.mock
async def test_a_joiner_asking_for_a_wider_window_fetches_on_its_own(
    forecast_marseille_arome, marine_porquerolles
):
    """Sharing is only sound when the answer covers the joiner's window.

    Same cache key, later window: the flight already in the air was widened
    around the first caller's dates, and nothing guarantees it reaches the
    second one. It issues its own request rather than silently returning a
    slice with no points in it.
    """
    forecast = respx.get(FORECAST_URL).mock(side_effect=_slow(forecast_marseille_arome))
    respx.get(MARINE_URL).mock(side_effect=_slow(marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    far = START.replace(year=2026, month=5, day=8)
    await asyncio.gather(
        adapter.fetch(lat=43.30, lon=5.35, start=START, end=END),
        adapter.fetch(lat=43.30, lon=5.35, start=far, end=far.replace(hour=23)),
    )

    assert forecast.call_count == 2


@respx.mock
async def test_a_failing_flight_fails_its_joiners_too(marine_porquerolles):
    """One refusal, not six.

    A 429 answered to six concurrent identical fetches used to become six
    requests at the address Open-Meteo just told us to slow down on.
    """
    forecast = respx.get(FORECAST_URL).mock(
        side_effect=lambda _r: httpx.Response(
            429, headers={"Retry-After": "600"}, json={"reason": "Daily API request limit exceeded"}
        )
    )
    respx.get(MARINE_URL).mock(side_effect=_slow(marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    results = await asyncio.gather(
        *[adapter.fetch(lat=43.30, lon=5.35, start=START, end=END) for _ in range(6)],
        return_exceptions=True,
    )

    assert forecast.call_count == 1
    assert all(isinstance(r, UpstreamRateLimitError) for r in results), results


@respx.mock
async def test_the_flight_is_forgotten_after_it_fails(
    forecast_marseille_arome, marine_porquerolles
):
    """A failure must not poison the key: the next caller retries for real."""
    responses = [
        httpx.Response(500, json={"reason": "upstream is having a day"}),
        httpx.Response(200, json=forecast_marseille_arome),
    ]
    forecast = respx.get(FORECAST_URL).mock(side_effect=responses)
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    with pytest.raises(httpx.HTTPStatusError):
        await adapter.fetch(lat=43.30, lon=5.35, start=START, end=END)
    bundle = await adapter.fetch(lat=43.30, lon=5.35, start=START, end=END)

    assert forecast.call_count == 2
    assert bundle.wind_by_model["meteofrance_arome_france"].points


@respx.mock
async def test_a_cancelled_joiner_does_not_cancel_the_others(
    forecast_marseille_arome, marine_porquerolles
):
    """The flight belongs to whoever started it, not to whoever waits on it.

    A browser that gives up mid-sweep cancels its task; without shielding, the
    future it was awaiting would be cancelled under every other segment.
    """
    respx.get(FORECAST_URL).mock(side_effect=_slow(forecast_marseille_arome, delay=0.05))
    respx.get(MARINE_URL).mock(side_effect=_slow(marine_porquerolles, delay=0.05))

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    leader = asyncio.create_task(adapter.fetch(lat=43.30, lon=5.35, start=START, end=END))
    await asyncio.sleep(0)  # let the leader register its flight
    joiner = asyncio.create_task(adapter.fetch(lat=43.30, lon=5.35, start=START, end=END))
    await asyncio.sleep(0.01)
    joiner.cancel()

    bundle = await leader
    assert bundle.wind_by_model["meteofrance_arome_france"].points
    assert joiner.cancelled()


@respx.mock
async def test_an_injected_client_is_reused_and_never_closed(
    forecast_marseille_arome, marine_porquerolles
):
    """The process that opened the client decides when it dies.

    This is what lets one client, one connection pool and one cache serve the
    whole deployment instead of one client per upstream call.
    """
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    client = httpx.AsyncClient()
    adapter = OpenMeteoAdapter(client, http_min_interval_s=0)
    await adapter.fetch(lat=43.30, lon=5.35, start=START, end=END)
    assert not client.is_closed
    await adapter.fetch(lat=44.10, lon=5.35, start=START, end=END)
    assert not client.is_closed
    await client.aclose()


@respx.mock
async def test_without_an_injected_client_one_is_opened_per_call(
    forecast_marseille_arome, marine_porquerolles
):
    """The unchanged default, kept for the local stdio runner and the tests.

    Recorded here because it is the baseline the shared-client deployment is
    measured against: N upstream fetches used to mean N connection pools.
    """
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    opened: list[httpx.AsyncClient] = []
    original = httpx.AsyncClient.__init__

    def _counting_init(self, *args, **kwargs):
        original(self, *args, **kwargs)
        opened.append(self)

    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    httpx.AsyncClient.__init__ = _counting_init  # type: ignore[method-assign]
    try:
        await adapter.fetch(lat=43.30, lon=5.35, start=START, end=END)
        await adapter.fetch(lat=44.10, lon=5.35, start=START, end=END)
    finally:
        httpx.AsyncClient.__init__ = original  # type: ignore[method-assign]

    assert len(opened) == 2
    assert all(client.is_closed for client in opened)
