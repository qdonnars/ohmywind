# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The web app and the connector trace the same route.

The deployment hands one ``RepairPool`` to both shells (``build_app``), and
both call the same ``repair_route`` on the same bundled grids. This sends the
same two-point route over land to ``POST /api/v1/passage`` and to the MCP
tool ``plan_passage``, assembled the way ``app.py`` assembles them, with the
repair turned on (``OPENWIND_ROUTE_REPAIR=compute``; it is off by default),
and holds the answers together: the same points,
the same points marked as the server's, the same facts behind the changes
(coded for the web, English sentences for the model). Only the wording may
differ.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

import httpx
import pytest
from openwind_api import Services, Settings, create_app
from openwind_data.testing import DeterministicMarineAdapter
from openwind_mcp_core import build_server

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
# Marseille, Vieux-Port mouth, to Porquerolles: the straight line cuts the
# coast west of Toulon, and the arrival lies on the island.
MARSEILLE = (43.295, 5.361)
PORQUEROLLES = (43.000, 6.242)


@pytest.fixture
def services(monkeypatch):
    # Turned on, as a deployment turns it on.
    monkeypatch.setenv("OPENWIND_ROUTE_REPAIR", "compute")
    monkeypatch.delenv("OPENWIND_ROUTE_GRIDS_DIR", raising=False)
    built = Services.from_settings(Settings.from_env())
    built = replace(built, marine=DeterministicMarineAdapter())
    yield built
    assert built.repair is not None
    built.repair.close()


async def test_rest_and_mcp_repair_a_route_into_the_same_points(services) -> None:
    assert services.repair is not None
    app = create_app(Settings.from_env(), services=services)
    server = build_server(adapter=services.marine, repair_pool=services.repair)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/passage",
            json={
                "waypoints": [list(MARSEILLE), list(PORQUEROLLES)],
                "departure": DEPARTURE.isoformat(),
                "archetype": "cruiser_30ft",
                "efficiency": 0.75,
            },
        )
    assert resp.status_code == 200
    rest = resp.json()

    # The MCP call repairs again rather than reading the REST call's answer
    # from the pool's memory: the two computations are compared, not one.
    services.repair._cache.clear()
    result = await server.call_tool(
        "plan_passage",
        {
            "waypoints": [
                {"lat": MARSEILLE[0], "lon": MARSEILLE[1]},
                {"lat": PORQUEROLLES[0], "lon": PORQUEROLLES[1]},
            ],
            "departure": DEPARTURE.isoformat(),
            "archetype": "cruiser_30ft",
        },
    )
    mcp = result.structuredContent

    # Same points, to the bit, and the same ones marked as the server's.
    repaired = rest["repaired_route"]
    assert repaired["waypoints"] == mcp["waypoints"]
    assert len(mcp["waypoints"]) > 2
    assert [i for i, p in enumerate(mcp["waypoints"]) if p.get("by_server")] == list(
        range(1, len(mcp["waypoints"]) - 1)
    )

    # Same changes: one coded notice per English sentence, same values.
    codes = [c["code"] for c in repaired["changes"]]
    assert codes == ["route.arrival_moved", "route.leg_retraced"]
    assert len(mcp["route_changes"]) == len(codes)
    moved, retraced = (c["params"] for c in repaired["changes"])
    assert mcp["route_changes"][0].startswith(
        f"The arrival was on land: moved {moved['distance_m']} m"
    )
    assert (
        f"retraced it at sea, {retraced['retraced_nm']} nm instead of "
        f"{retraced['straight_nm']} nm in a straight line" in mcp["route_changes"][1]
    )

    # The plan link the connector hands out opens the same route in the web
    # app, written to five decimals as the web app writes its own links.
    wpts = mcp["openwind_url"].split("wpts=")[1].split("&")[0]
    assert wpts == ";".join(f"{p['lat']:.5f},{p['lon']:.5f}" for p in repaired["waypoints"])

    # And the same passage planned on it.
    assert rest["passage"]["distance_nm"] == mcp["passage"]["distance_nm"]
    assert len(rest["passage"]["segments"]) == len(mcp["passage"]["segments"])


async def test_by_default_neither_shell_repairs_the_route(monkeypatch) -> None:
    """No variable: REST plans the route as drawn, MCP keeps its coarse check."""
    monkeypatch.delenv("OPENWIND_ROUTE_REPAIR", raising=False)
    monkeypatch.delenv("OPENWIND_ROUTE_GRIDS_DIR", raising=False)
    built = Services.from_settings(Settings.from_env())
    built = replace(built, marine=DeterministicMarineAdapter())
    assert built.repair is None
    app = create_app(Settings.from_env(), services=built)
    server = build_server(adapter=built.marine, repair_pool=built.repair)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/passage",
            json={
                "waypoints": [list(MARSEILLE), list(PORQUEROLLES)],
                "departure": DEPARTURE.isoformat(),
                "archetype": "cruiser_30ft",
                "repair_route": True,
            },
        )
    assert resp.status_code == 200
    assert "repaired_route" not in resp.json()

    # No coarse land mask in this test deployment (no atlases): the coarse
    # check finds nothing and the route is planned as sent, unrepaired.
    result = await server.call_tool(
        "plan_passage",
        {
            "waypoints": [
                {"lat": MARSEILLE[0], "lon": MARSEILLE[1]},
                {"lat": PORQUEROLLES[0], "lon": PORQUEROLLES[1]},
            ],
            "departure": DEPARTURE.isoformat(),
            "archetype": "cruiser_30ft",
        },
    )
    mcp = result.structuredContent
    assert "route_changes" not in mcp
    assert [(p["lat"], p["lon"]) for p in mcp["waypoints"]] == [MARSEILLE, PORQUEROLLES]
    assert not any(p.get("by_server") for p in mcp["waypoints"])
