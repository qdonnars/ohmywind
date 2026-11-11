# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Our own Open-Meteo budget, as the model reads it over MCP.

FastMCP hands the model the message of whatever a tool raised, so the
refusal has to say, in words, what happened, how long to wait and what
still works.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from mcp.server.fastmcp.exceptions import ToolError
from openwind_data.adapters.base import ForecastBundle, UpstreamBudgetExhaustedError

from openwind_mcp_core import build_server

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
PLAN_ARGS = {
    "waypoints": [{"lat": 43.30, "lon": 5.35}, {"lat": 43.00, "lon": 6.20}],
    "departure": DEPARTURE.isoformat(),
    "archetype": "cruiser_40ft",
}


class _RefusingAdapter:
    async def fetch(self, lat, lon, start, end, models=None) -> ForecastBundle:
        raise UpstreamBudgetExhaustedError("hour", 600)


async def test_the_budget_refusal_reaches_the_model_in_words() -> None:
    server = build_server(adapter=_RefusingAdapter())
    with pytest.raises(ToolError) as caught:
        await server.call_tool("plan_passage", PLAN_ARGS)
    message = str(caught.value)
    assert "hourly share of the Open-Meteo free quota is spent" in message
    assert "resets in about 10 min" in message
    assert "get_tidal_stream" in message


async def test_the_tidal_stream_still_answers_when_the_budget_is_spent() -> None:
    # It makes no weather request, which is what the refusal promises.
    server = build_server(adapter=_RefusingAdapter())
    result = await server.call_tool(
        "get_tidal_stream",
        {
            "lat": 48.03,
            "lon": -4.75,
            "start": DEPARTURE.isoformat(),
            "end": (DEPARTURE + timedelta(hours=2)).isoformat(),
        },
    )
    assert result is not None
