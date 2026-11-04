# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The Open-Meteo budget: what it counts, when it refuses, how it says so.

The quota is per IP and the IP is shared by every user, so the point of the
budget is to be the one that says no, a little before Open-Meteo would. These
tests pin the three things that make it trustworthy: it weighs a request the
way Open-Meteo does (a batch of N points is N calls), it never counts what
the cache answered, and a refusal carries the window and the wait.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import httpx
import pytest
import respx

from openwind_data.adapters.base import UpstreamBudgetExhaustedError, UpstreamRateLimitError
from openwind_data.adapters.budget import (
    DEFAULT_LIMITS,
    UpstreamBudget,
    request_weight,
)
from openwind_data.adapters.openmeteo import (
    DEFAULT_MODEL,
    FORECAST_URL,
    MARINE_URL,
    OpenMeteoAdapter,
)

START = datetime(2026, 4, 26, 0, 0, tzinfo=UTC)
END = datetime(2026, 4, 26, 23, 0, tzinfo=UTC)
POINTS = [(43.30, 5.35), (43.15, 5.78), (43.00, 6.20)]


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


# ------------------------------------------------------------------- weight


def _params(**over: object) -> dict[str, object]:
    base: dict[str, object] = {
        "latitude": 43.3,
        "longitude": 5.35,
        "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        "start_date": "2026-04-26",
        "end_date": "2026-05-03",
    }
    return base | over


def test_a_single_point_request_weighs_one() -> None:
    assert request_weight(_params()) == 1.0


def test_a_batch_of_n_points_weighs_n() -> None:
    # open-meteo/open-meteo#1295: each location of a multi-coordinate
    # request counts, whatever the request count says.
    assert request_weight(_params(latitude="43.3,43.15,43.0", longitude="5,5.7,6.2")) == 3.0


def test_more_than_ten_variables_and_two_weeks_count_fractionally() -> None:
    # Open-Meteo's own example: 15 variables over 4 weeks count 3.0.
    fifteen = ",".join(f"v{i}" for i in range(15))
    weight = request_weight(_params(hourly=fifteen, start_date="2026-04-01", end_date="2026-04-28"))
    assert weight == pytest.approx(3.0)


def test_an_unreadable_request_still_counts() -> None:
    assert request_weight({}) == 1.0


# --------------------------------------------------------------- the windows


def test_spends_under_the_ceiling_and_refuses_above_it() -> None:
    clock = _Clock()
    budget = UpstreamBudget({"minute": 5}, clock=clock)
    for _ in range(5):
        budget.spend(1)
    with pytest.raises(UpstreamBudgetExhaustedError) as caught:
        budget.spend(1)
    assert caught.value.window == "minute"
    # The oldest call leaves the window 60 s after it was made.
    assert caught.value.retry_after_s == 60
    assert budget.refused == 1


def test_a_refusal_is_a_rate_limit_to_everything_that_already_handles_one() -> None:
    budget = UpstreamBudget({"hour": 1}, clock=_Clock())
    budget.spend(1)
    with pytest.raises(UpstreamRateLimitError) as caught:
        budget.spend(1)
    message = str(caught.value)
    # What an older web client matches, and what still works, for the model.
    assert message.startswith("upstream weather service rate limit reached")
    assert "hourly" in message
    assert "get_tidal_stream" in message


def test_the_window_slides_and_a_refused_call_leaves_no_trace() -> None:
    clock = _Clock()
    budget = UpstreamBudget({"minute": 2}, clock=clock)
    budget.spend(1)
    clock.now += 30
    budget.spend(1)
    with pytest.raises(UpstreamBudgetExhaustedError) as caught:
        budget.spend(1)
    assert caught.value.retry_after_s == 30
    # The refusal was not recorded: once the first call ages out, one fits.
    clock.now += 30.5
    budget.spend(1)
    assert budget.snapshot()["windows"]["minute"]["used"] == 2  # type: ignore[index]


def test_the_strictest_window_decides() -> None:
    clock = _Clock()
    budget = UpstreamBudget({"minute": 100, "hour": 3, "day": 1000}, clock=clock)
    budget.spend(3)
    with pytest.raises(UpstreamBudgetExhaustedError) as caught:
        budget.spend(1)
    assert caught.value.window == "hour"


def test_a_batch_heavier_than_what_is_left_is_refused_whole() -> None:
    budget = UpstreamBudget({"minute": 10}, clock=_Clock())
    budget.spend(8)
    with pytest.raises(UpstreamBudgetExhaustedError):
        budget.spend(3)
    budget.spend(2)


def test_disabled_counts_but_never_refuses() -> None:
    budget = UpstreamBudget({"minute": 1}, enabled=False, clock=_Clock())
    for _ in range(5):
        budget.spend(1)
    snap = budget.snapshot()
    assert snap["enabled"] is False
    assert snap["spent_total"] == 5
    assert snap["refused_total"] == 0


def test_the_crossing_is_logged_once_per_episode(caplog) -> None:
    clock = _Clock()
    budget = UpstreamBudget({"minute": 1}, clock=clock)
    budget.spend(1)
    with caplog.at_level(logging.INFO, logger="openwind_data.adapters.budget"):
        for _ in range(3):
            with pytest.raises(UpstreamBudgetExhaustedError):
                budget.spend(1)
        clock.now += 61
        budget.spend(1)
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "window=minute" in warnings[0].getMessage()
    assert any("available again" in r.getMessage() for r in caplog.records)


def test_defaults_are_eighty_percent_of_the_free_tier() -> None:
    assert DEFAULT_LIMITS == {"minute": 480, "hour": 4000, "day": 8000}
    assert UpstreamBudget().limits() == DEFAULT_LIMITS


def test_from_env_reads_the_ceilings_and_the_switch() -> None:
    budget = UpstreamBudget.from_env(
        {
            "OPENWIND_UPSTREAM_BUDGET_PER_MINUTE": "100",
            "OPENWIND_UPSTREAM_BUDGET_PER_HOUR": "0",
            "OPENWIND_UPSTREAM_BUDGET_PER_DAY": "not a number",
        }
    )
    assert budget.enabled is True
    # 0 leaves the hour unenforced; a typo keeps the default.
    assert budget.limits() == {"minute": 100, "day": 8000}
    assert UpstreamBudget.from_env({"OPENWIND_UPSTREAM_BUDGET": "off"}).enabled is False


def test_the_snapshot_holds_counters_only() -> None:
    budget = UpstreamBudget(clock=_Clock())
    budget.spend(2.5)
    snap = budget.snapshot()
    assert snap["windows"]["day"] == {"used": 2.5, "limit": 8000, "remaining": 7997.5}  # type: ignore[index]


# ------------------------------------------------- inside the Open-Meteo adapter


@respx.mock
async def test_the_adapter_counts_a_batch_per_point_and_never_a_cache_hit(
    forecast_marseille_arome, marine_porquerolles
):
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=[forecast_marseille_arome] * len(POINTS))
    )
    respx.get(MARINE_URL).mock(
        return_value=httpx.Response(200, json=[marine_porquerolles] * len(POINTS))
    )
    budget = UpstreamBudget(clock=_Clock())
    adapter = OpenMeteoAdapter(http_min_interval_s=0, budget=budget)

    await adapter.prewarm_batch(POINTS, START, END, [DEFAULT_MODEL])
    # One wind and one marine request, three locations each.
    assert budget.spent == 6
    for lat, lon in POINTS:
        await adapter.fetch(lat, lon, START, END, models=[DEFAULT_MODEL])
    assert budget.spent == 6


@respx.mock
async def test_a_refusal_happens_before_the_request_leaves(
    forecast_marseille_arome, marine_porquerolles
):
    forecast = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=forecast_marseille_arome)
    )
    marine = respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))
    budget = UpstreamBudget({"minute": 1}, clock=_Clock())
    budget.spend(1)
    adapter = OpenMeteoAdapter(http_min_interval_s=0, budget=budget)

    with pytest.raises(UpstreamBudgetExhaustedError):
        await adapter.fetch(43.3, 5.35, START, END)
    assert forecast.call_count == 0
    assert marine.call_count == 0
