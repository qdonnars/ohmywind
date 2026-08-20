# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Upstream 429 handling.

Before this, a 429 from Open-Meteo reached callers as a raw ``HTTPStatusError``
carrying the full query string. On the REST route that surfaced as a bare 500;
over MCP the model received the upstream URL and gave up, because nothing in
the message said whether to wait or to stop.

The distinction that matters throughout: this is the weather API refusing *us*,
not our own limiter refusing a caller. The counter is per egress IP, so on a
shared host a co-tenant can spend it and no amount of slowing down on our side
helps.
"""

from __future__ import annotations

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

# Aligned on the shared fixtures' window, so a retried call yields real points
# rather than an empty slice that would hide whether the retry worked.
START = datetime(2026, 4, 26, 0, 0, tzinfo=UTC)
END = datetime(2026, 4, 26, 23, 0, tzinfo=UTC)

# Shape of a real Open-Meteo rejection: the body names the counter that tripped.
MINUTELY = {"error": True, "reason": "Minutely API request limit exceeded. Please try again later."}
DAILY = {"error": True, "reason": "Daily API request limit exceeded. Please try again tomorrow."}


def _adapter() -> OpenMeteoAdapter:
    # Pacing off: these tests are about retry behaviour, not about the 0.1 s
    # spacing, and leaving it on only makes them slower.
    return OpenMeteoAdapter(http_min_interval_s=0)


@respx.mock
@pytest.mark.asyncio
async def test_429_becomes_a_typed_error_carrying_the_reason() -> None:
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(429, json=DAILY))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(429, json=DAILY))

    with pytest.raises(UpstreamRateLimitError) as excinfo:
        await _adapter().fetch(43.3, 5.36, START, END)

    err = excinfo.value
    assert "Daily API request limit exceeded" in err.reason
    # The message is what the LLM and the web client both read.
    assert "upstream weather service rate limit reached" in str(err)
    # And it must not be mistakable for our own limiter's wording.
    assert "rate limit exceeded" not in str(err)


@respx.mock
@pytest.mark.asyncio
async def test_a_short_retry_after_is_waited_out_and_the_call_succeeds(
    forecast_marseille_arome, marine_porquerolles
) -> None:
    """The minutely bucket drains in seconds, so one retry rescues the call."""
    forecast = respx.get(FORECAST_URL).mock(
        side_effect=[
            httpx.Response(429, json=MINUTELY, headers={"Retry-After": "1"}),
            httpx.Response(200, json=forecast_marseille_arome),
        ]
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    bundle = await _adapter().fetch(43.3, 5.36, START, END)

    assert forecast.call_count == 2
    assert any(series.points for series in bundle.wind_by_model.values())


@respx.mock
@pytest.mark.asyncio
async def test_a_long_retry_after_fails_fast_instead_of_sleeping() -> None:
    """A daily quota must not be slept through.

    Waiting an advertised hour would convert a fast, explainable error into a
    request that hangs until something else times it out, and the user would
    learn nothing.
    """
    forecast = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(429, json=DAILY, headers={"Retry-After": "3600"})
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(429, json=DAILY))

    with pytest.raises(UpstreamRateLimitError) as excinfo:
        await _adapter().fetch(43.3, 5.36, START, END)

    assert forecast.call_count == 1
    assert excinfo.value.retry_after_s == 3600


@respx.mock
@pytest.mark.asyncio
async def test_retries_once_when_no_retry_after_header_is_sent(
    forecast_marseille_arome, marine_porquerolles
) -> None:
    """Open-Meteo often omits the header; absence should not mean "give up"."""
    forecast = respx.get(FORECAST_URL).mock(
        side_effect=[
            httpx.Response(429, json=MINUTELY),
            httpx.Response(200, json=forecast_marseille_arome),
        ]
    )
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))

    bundle = await _adapter().fetch(43.3, 5.36, START, END)

    assert forecast.call_count == 2
    assert any(series.points for series in bundle.wind_by_model.values())


@respx.mock
@pytest.mark.asyncio
async def test_a_persistent_429_is_not_retried_forever() -> None:
    """Exactly one extra attempt, never a loop against a service refusing us."""
    forecast = respx.get(FORECAST_URL).mock(return_value=httpx.Response(429, json=MINUTELY))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(429, json=MINUTELY))

    with pytest.raises(UpstreamRateLimitError):
        await _adapter().fetch(43.3, 5.36, START, END)

    assert forecast.call_count == 2


@respx.mock
@pytest.mark.asyncio
async def test_a_body_that_is_not_open_meteo_json_still_yields_a_usable_error() -> None:
    """Edges and proxies answer 429 with HTML; the error must survive that."""
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(429, text="<html>429</html>"))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(429, text="<html>429</html>"))

    with pytest.raises(UpstreamRateLimitError) as excinfo:
        await _adapter().fetch(43.3, 5.36, START, END)

    assert excinfo.value.reason == ""
    assert "upstream weather service rate limit reached" in str(excinfo.value)
