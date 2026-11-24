# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The route is the model's drawing: every plan says so to the user.

Forum testers found the weak spot of a plan is the route itself (a detour by
the Roches Douvres for Trébeurden to Batz), not the forecast. The payload
carries the warning for the host, and the widget shows it on the map.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from mcp.types import CallToolResult
from openwind_data.testing import DeterministicMarineAdapter

from openwind_mcp_core import build_server
from openwind_mcp_core.server import ROUTE_NOTICE

ROUTE = [{"lat": 43.29, "lon": 5.37}, {"lat": 43.00, "lon": 6.20}]
DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)


async def _plan(**args) -> dict:
    server = build_server(adapter=DeterministicMarineAdapter())
    result = await server.call_tool(
        "plan_passage",
        {"waypoints": ROUTE, "departure": DEPARTURE.isoformat(), "archetype": "cruiser_30ft"}
        | args,
    )
    if isinstance(result, CallToolResult):
        return result.structuredContent
    return result[1] if isinstance(result, tuple) else result


async def test_single_and_sweep_carry_the_route_notice() -> None:
    assert (await _plan())["route_notice"] == ROUTE_NOTICE
    sweep = await _plan(
        latest_departure=(DEPARTURE + timedelta(hours=6)).isoformat(), sweep_interval_hours=3
    )
    assert sweep["route_notice"] == ROUTE_NOTICE


def test_the_notice_says_how_to_fix_the_route() -> None:
    text = ROUTE_NOTICE.lower()
    assert "drawn by the assistant" in text
    assert "redraw" in text
    assert "ohmywind" in text


async def test_the_widget_shows_it_on_the_map() -> None:
    server = build_server(adapter=DeterministicMarineAdapter())
    contents = await server.read_resource("ui://openwind/plan-passage")
    html = "".join(getattr(c, "content", "") or getattr(c, "text", "") for c in contents)
    assert "Tracé proposé par l'assistant, pas par OhMyWind" in html
