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
    RATE_LIMIT_SWEEP_S,
    OpenMeteoAdapter,
    limit_window,
    seconds_until_reset,
)

# Aligned on the shared fixtures' window, so a retried call yields real points
# rather than an empty slice that would hide whether the retry worked.
START = datetime(2026, 4, 26, 0, 0, tzinfo=UTC)
END = datetime(2026, 4, 26, 23, 0, tzinfo=UTC)

# Shape of a real Open-Meteo rejection: the body names the counter that tripped.
MINUTELY = {"error": True, "reason": "Minutely API request limit exceeded. Please try again later."}
HOURLY = {
    "error": True,
    "reason": "Hourly API request limit exceeded. Please try again in the next hour.",
}
DAILY = {"error": True, "reason": "Daily API request limit exceeded. Please try again tomorrow."}
CONCURRENT = {"error": True, "reason": "Too many concurrent requests"}


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
    # Both calls fail fast now that a daily refusal is never retried, so the
    # marine one carries the same header: whichever surfaces first is
    # asserted on, and the two must agree.
    forecast = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(429, json=DAILY, headers={"Retry-After": "3600"})
    )
    respx.get(MARINE_URL).mock(
        return_value=httpx.Response(429, json=DAILY, headers={"Retry-After": "3600"})
    )

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


# ------------------------------------------------------- the wait until reset


def test_the_window_is_read_off_the_reason() -> None:
    assert limit_window(MINUTELY["reason"]) == "minute"
    assert limit_window(HOURLY["reason"]) == "hour"
    assert limit_window(DAILY["reason"]) == "day"
    # Momentary refusals and non-JSON bodies name no counter.
    assert limit_window(CONCURRENT["reason"]) is None
    assert limit_window("") is None


def test_the_daily_counter_clears_at_midnight_utc_not_a_day_later() -> None:
    """Fixed clock: refused at 21:30 UTC, the quota is back at 00:01 UTC."""
    at = datetime(2026, 9, 13, 21, 30, tzinfo=UTC)
    assert seconds_until_reset("day", at) == 2.5 * 3600 + RATE_LIMIT_SWEEP_S


def test_the_hourly_counter_clears_at_the_next_full_hour() -> None:
    at = datetime(2026, 9, 13, 10, 20, 30, tzinfo=UTC)
    assert seconds_until_reset("hour", at) == 39.5 * 60 + RATE_LIMIT_SWEEP_S


def test_the_minutely_counter_clears_within_one_sweep() -> None:
    assert seconds_until_reset("minute", datetime(2026, 9, 13, 10, 20, 59, tzinfo=UTC)) == 60


@respx.mock
@pytest.mark.asyncio
async def test_a_daily_refusal_without_header_carries_the_wait_until_midnight_utc() -> None:
    """Open-Meteo sends no Retry-After, so the wait is derived from the clock.

    And nothing is retried: a spent daily counter does not drain in two
    seconds, and the extra attempt was one more refusal in the log.
    """
    forecast = respx.get(FORECAST_URL).mock(return_value=httpx.Response(429, json=DAILY))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(429, json=DAILY))

    before = datetime.now(UTC)
    with pytest.raises(UpstreamRateLimitError) as excinfo:
        await _adapter().fetch(43.3, 5.36, START, END)

    err = excinfo.value
    assert forecast.call_count == 1
    assert err.window == "day"
    assert err.retry_after_s is not None
    expected = seconds_until_reset("day", before)
    # Within the seconds the test itself took.
    assert abs(err.retry_after_s - expected) < 5
    assert "resets in about" in str(err)


@respx.mock
@pytest.mark.asyncio
async def test_an_advertised_retry_after_wins_over_the_derived_wait() -> None:
    refusal = httpx.Response(429, json=HOURLY, headers={"Retry-After": "900"})
    respx.get(FORECAST_URL).mock(return_value=refusal)
    respx.get(MARINE_URL).mock(return_value=refusal)

    with pytest.raises(UpstreamRateLimitError) as excinfo:
        await _adapter().fetch(43.3, 5.36, START, END)

    assert excinfo.value.window == "hour"
    assert excinfo.value.retry_after_s == 900
    assert "resets in about 15 min" in str(excinfo.value)


@respx.mock
@pytest.mark.asyncio
async def test_a_refusal_naming_no_counter_carries_no_wait() -> None:
    """A concurrency refusal is momentary; inventing a wait for it would lie."""
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(429, json=CONCURRENT))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(429, json=CONCURRENT))

    with pytest.raises(UpstreamRateLimitError) as excinfo:
        await _adapter().fetch(43.3, 5.36, START, END)

    assert excinfo.value.window is None
    assert excinfo.value.retry_after_s is None
    assert "resets in" not in str(excinfo.value)
