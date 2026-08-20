# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Boundary validation on the MCP surface.

Mirror of the REST checks in ``hf-space/tests``: the same bad input must be
refused with the same wording on both shells, and must be refused *before*
any upstream weather call. The StubAdapter's fetch counter is what proves the
second half.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from openwind_data.routing import MAX_WAYPOINTS
from test_server import _BASE_PLAN_ARGS, StubAdapter

from openwind_mcp_core import build_server


def _args(**overrides) -> dict:
    return {**_BASE_PLAN_ARGS, **overrides}


async def _expect_error(server, name: str, args: dict) -> str:
    """Call a tool expecting failure, and return the message the host sees."""
    with pytest.raises(Exception) as excinfo:
        await server.call_tool(name, args)
    return str(excinfo.value)


class TestPlanPassageBounds:
    async def test_out_of_range_lat_refused(self) -> None:
        server = build_server(adapter=StubAdapter())
        message = await _expect_error(
            server,
            "plan_passage",
            _args(waypoints=[{"lat": 999, "lon": 5.35}, {"lat": 43.0, "lon": 6.2}]),
        )
        assert "out of range [-90, 90]" in message

    async def test_out_of_range_lon_refused(self) -> None:
        server = build_server(adapter=StubAdapter())
        message = await _expect_error(
            server,
            "plan_passage",
            _args(waypoints=[{"lat": 43.3, "lon": 5.35}, {"lat": 43.0, "lon": 999}]),
        )
        assert "out of range [-180, 180]" in message

    async def test_refused_before_any_upstream_fetch(self) -> None:
        # Today an out-of-range point reaches Open-Meteo and comes back as a
        # misleading "forecast horizon exceeded". Nothing should leave the
        # process for a request we already know is invalid.
        adapter = StubAdapter()
        server = build_server(adapter=adapter)
        await _expect_error(
            server,
            "plan_passage",
            _args(waypoints=[{"lat": 999, "lon": 5.35}, {"lat": 43.0, "lon": 6.2}]),
        )
        assert adapter.fetch_calls == 0

    async def test_single_waypoint_refused_with_rest_wording(self) -> None:
        server = build_server(adapter=StubAdapter())
        message = await _expect_error(
            server, "plan_passage", _args(waypoints=[{"lat": 43.3, "lon": 5.35}])
        )
        assert "at least 2 waypoints required" in message

    async def test_too_many_waypoints_refused(self) -> None:
        server = build_server(adapter=StubAdapter())
        route = [{"lat": 43.0 + i * 0.001, "lon": 5.0} for i in range(MAX_WAYPOINTS + 1)]
        message = await _expect_error(server, "plan_passage", _args(waypoints=route))
        assert "too many waypoints" in message

    async def test_malformed_waypoint_refused(self) -> None:
        server = build_server(adapter=StubAdapter())
        message = await _expect_error(
            server,
            "plan_passage",
            _args(waypoints=[{"lat": 43.3}, {"lat": 43.0, "lon": 6.2}]),
        )
        assert "invalid waypoints" in message

    async def test_valid_route_still_plans(self) -> None:
        # Guard against the validation being too strict for real input.
        server = build_server(adapter=StubAdapter())
        out = await server.call_tool("plan_passage", _BASE_PLAN_ARGS)
        payload = out[1] if isinstance(out, tuple) else out
        assert "passage" in payload


class TestUnknownArchetype:
    async def test_message_matches_rest_wording(self) -> None:
        # REST returns "unknown archetype: 'nope'"; MCP used to surface the
        # bare KeyError string "'nope'" from deep inside the engine.
        server = build_server(adapter=StubAdapter())
        message = await _expect_error(server, "plan_passage", _args(archetype="nope"))
        assert "unknown archetype" in message
        assert "'nope'" in message

    async def test_refused_before_any_upstream_fetch(self) -> None:
        adapter = StubAdapter()
        server = build_server(adapter=adapter)
        await _expect_error(server, "plan_passage", _args(archetype="nope"))
        assert adapter.fetch_calls == 0


class TestForecastBounds:
    async def test_get_marine_forecast_rejects_out_of_range_point(self) -> None:
        adapter = StubAdapter()
        server = build_server(adapter=adapter)
        message = await _expect_error(
            server,
            "get_marine_forecast",
            {
                "lat": 999,
                "lon": 5.35,
                "start": datetime(2026, 5, 1, 6, 0, tzinfo=UTC).isoformat(),
                "end": datetime(2026, 5, 1, 12, 0, tzinfo=UTC).isoformat(),
            },
        )
        assert "lat=999" in message
        assert "out of range" in message
        assert adapter.fetch_calls == 0

    async def test_get_marine_forecast_accepts_valid_point(self) -> None:
        adapter = StubAdapter()
        server = build_server(adapter=adapter)
        await server.call_tool(
            "get_marine_forecast",
            {
                "lat": 43.30,
                "lon": 5.35,
                "start": datetime(2026, 5, 1, 6, 0, tzinfo=UTC).isoformat(),
                "end": datetime(2026, 5, 1, 12, 0, tzinfo=UTC).isoformat(),
            },
        )
        assert adapter.fetch_calls == 1

    async def test_min_upwind_out_of_range_refused(self) -> None:
        adapter = StubAdapter()
        server = build_server(adapter=adapter)
        message = await _expect_error(server, "plan_passage", _args(min_upwind_twa_deg=10.0))
        assert "min_upwind_twa_deg" in message
        assert "[25, 70]" in message
        assert adapter.fetch_calls == 0
