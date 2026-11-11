# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Every tool call has a deadline.

It is what a client that never hears back gets instead of a hung session:
an error the model can read and act on.
"""

from __future__ import annotations

import asyncio
import threading
from datetime import UTC, datetime, timedelta

import pytest
from mcp.server.fastmcp.exceptions import ToolError
from openwind_data.adapters.base import (
    ForecastBundle,
    SeaSeries,
    WindPoint,
    WindSeries,
)

from openwind_mcp_core import build_server
from openwind_mcp_core.guards import (
    DEFAULT_TOOL_TIMEOUT_S,
    ToolTimeoutError,
    tool_timeout_from_env,
)

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
PLAN_ARGS = {
    "waypoints": [{"lat": 43.30, "lon": 5.35}, {"lat": 43.00, "lon": 6.20}],
    "departure": DEPARTURE.isoformat(),
    "archetype": "cruiser_40ft",
}


class _RecordingAdapter:
    """Answers steady wind, after ``delay``, and notes the thread it ran on."""

    def __init__(self, delay: float = 0.0) -> None:
        self.delay = delay
        self.threads: set[int] = set()

    async def fetch(self, lat, lon, start, end, models=None) -> ForecastBundle:
        self.threads.add(threading.get_ident())
        if self.delay:
            await asyncio.sleep(self.delay)
        models = models or ["meteofrance_arome_france"]
        points = []
        t = start
        while t <= end:
            points.append(WindPoint(time=t, speed_kn=12.0, direction_deg=0.0, gust_kn=None))
            t += timedelta(hours=1)
        return ForecastBundle(
            lat=lat,
            lon=lon,
            start=start,
            end=end,
            wind_by_model={m: WindSeries(model=m, points=tuple(points)) for m in models},
            sea=SeaSeries(points=()),
            requested_at=start,
        )


async def test_a_tool_past_its_deadline_returns_an_error_the_model_can_act_on() -> None:
    server = build_server(adapter=_RecordingAdapter(delay=5), tool_timeout_s=0.2)
    with pytest.raises(ToolError) as caught:
        await server.call_tool(
            "get_marine_forecast",
            {
                "lat": 43.3,
                "lon": 5.35,
                "start": DEPARTURE.isoformat(),
                "end": (DEPARTURE + timedelta(hours=6)).isoformat(),
            },
        )
    message = str(caught.value)
    assert "stopped this get_marine_forecast call after 0.2 s" in message
    assert "Try the same call again" in message
    assert isinstance(caught.value.__cause__, ToolTimeoutError)


async def test_a_slow_plan_is_stopped_with_a_hint_for_the_sweep() -> None:
    server = build_server(adapter=_RecordingAdapter(delay=5), tool_timeout_s=0.2)
    with pytest.raises(ToolError, match="sweep_interval_hours"):
        await server.call_tool("plan_passage", PLAN_ARGS)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("", DEFAULT_TOOL_TIMEOUT_S), ("30", 30.0), ("0", 0.0), ("soon", DEFAULT_TOOL_TIMEOUT_S)],
)
def test_timeout_from_env(raw: str, expected: float) -> None:
    assert tool_timeout_from_env({"OPENWIND_MCP_TOOL_TIMEOUT_S": raw}) == expected


def test_the_default_deadline_is_ninety_seconds() -> None:
    assert DEFAULT_TOOL_TIMEOUT_S == 90.0
