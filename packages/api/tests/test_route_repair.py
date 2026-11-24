# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The route repair on the REST passage routes: off by default, on when the deployment says so.

Turned on (``OPENWIND_ROUTE_REPAIR=compute``), it is declinable and quiet
where no grid holds the route. One app and one ``RepairPool`` for the module:
the worker is a process that takes a second to spawn, and sharing it is what
a deployment does anyway.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from openwind_data.testing import DeterministicMarineAdapter, browser_cache_payload, hourly_axis
from starlette.testclient import TestClient

from openwind_api.app import create_app
from openwind_api.routes import passage as passage_routes
from openwind_api.settings import Settings

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
MARSEILLE = [43.295, 5.361]
PORQUEROLLES = [43.000, 6.242]
# Ouessant lies west of the Bretagne sud grid: no grid holds this route.
BREST = [48.38, -4.49]
OUESSANT = [48.46, -5.10]


@pytest.fixture(scope="module")
def client():
    # Turned on the way a deployment turns it on: through the variable.
    app = create_app(Settings.from_env({"OPENWIND_ROUTE_REPAIR": "compute"}))
    assert app.state.services.repair is not None
    app.state.services = replace(app.state.services, marine=DeterministicMarineAdapter())
    yield TestClient(app)
    app.state.services.repair.close()


def _body(waypoints=None, **extra) -> dict:
    body = {
        "waypoints": waypoints or [MARSEILLE, PORQUEROLLES],
        "departure": DEPARTURE.isoformat(),
        "archetype": "cruiser_30ft",
    }
    body.update(extra)
    return body


def test_a_route_over_land_is_repaired_and_said(client) -> None:
    resp = client.post("/api/v1/passage", json=_body())
    assert resp.status_code == 200
    body = resp.json()
    route = body["repaired_route"]
    assert [c["code"] for c in route["changes"]] == ["route.arrival_moved", "route.leg_retraced"]
    for change in route["changes"]:
        assert set(change) == {"code", "params", "message"}
    points = route["waypoints"]
    assert len(points) > 2 and "by_server" not in points[0] and "by_server" not in points[-1]
    assert all(p["by_server"] is True for p in points[1:-1])
    # The passage is the repaired route's: it starts and ends on its ends.
    segments = body["passage"]["segments"]
    assert segments[0]["start"] == {"lat": points[0]["lat"], "lon": points[0]["lon"]}
    assert segments[-1]["end"] == {"lat": points[-1]["lat"], "lon": points[-1]["lon"]}


def test_the_repaired_route_sent_back_is_planned_as_it_is(client) -> None:
    first = client.post("/api/v1/passage", json=_body()).json()
    again = client.post(
        "/api/v1/passage",
        json=_body([[p["lat"], p["lon"]] for p in first["repaired_route"]["waypoints"]]),
    ).json()
    assert "repaired_route" not in again
    assert again["passage"]["distance_nm"] == first["passage"]["distance_nm"]


def test_declined_the_route_is_planned_as_drawn(client) -> None:
    resp = client.post("/api/v1/passage", json=_body(repair_route=False))
    assert resp.status_code == 200
    body = resp.json()
    assert "repaired_route" not in body
    assert body["passage"]["segments"][0]["start"] == {"lat": MARSEILLE[0], "lon": MARSEILLE[1]}


def test_a_flag_that_is_not_a_boolean_is_refused(client) -> None:
    resp = client.post("/api/v1/passage", json=_body(repair_route="no"))
    assert resp.status_code == 422
    assert resp.json()["code"] == "invalid_repair_route"


def test_where_no_grid_holds_the_route_nothing_changes(client) -> None:
    resp = client.post("/api/v1/passage", json=_body([BREST, OUESSANT]))
    assert resp.status_code == 200
    assert "repaired_route" not in resp.json()


def test_a_repaired_route_is_planned_off_the_browser_cache(client, monkeypatch) -> None:
    """The browser sampled the route it drew: the repaired one is planned live."""
    seen = {}
    real = passage_routes.estimate_passage

    async def spy(*args, **kwargs):
        seen["adapter"] = kwargs["adapter"]
        return await real(*args, **kwargs)

    monkeypatch.setattr(passage_routes, "estimate_passage", spy)
    cache = browser_cache_payload(
        [tuple(MARSEILLE), tuple(PORQUEROLLES)],
        hourly_axis(DEPARTURE, DEPARTURE + timedelta(hours=20)),
    )
    resp = client.post("/api/v1/passage", json=_body(forecast_cache=cache, models=["AROME"]))
    assert resp.status_code == 200
    assert "repaired_route" in resp.json()
    assert seen["adapter"] is client.app.state.services.marine


def test_the_sweep_and_the_target_arrival_are_repaired_too(client) -> None:
    sweep = client.post(
        "/api/v1/passage",
        json=_body(
            latest_departure=(DEPARTURE + timedelta(hours=3)).isoformat(),
            sweep_interval_hours=3,
        ),
    ).json()
    assert sweep["windows"] and "repaired_route" in sweep
    body = _body()
    del body["departure"]
    body["target_arrival"] = (DEPARTURE + timedelta(hours=12)).isoformat()
    eta = client.post("/api/v1/passage-by-eta", json=body)
    assert eta.status_code == 200
    assert "repaired_route" in eta.json()


def test_the_repair_is_off_unless_the_deployment_turns_it_on() -> None:
    assert Settings.from_env({}).route_repair == "off"
    assert Settings().route_repair == "off"
    assert Settings.from_env({"OPENWIND_ROUTE_REPAIR": "compute"}).route_repair == "compute"
    assert Settings.from_env({"OPENWIND_ROUTE_REPAIR": "suggest"}).route_repair == "suggest"
    # Off, nothing is built: no worker, no grid read.
    assert create_app(Settings.from_env({})).state.services.repair is None


def test_by_default_a_route_over_land_is_planned_as_drawn() -> None:
    """No variable: the route is planned as drawn, even when the web app asks for the repair."""
    app = create_app(Settings.from_env({}))
    app.state.services = replace(app.state.services, marine=DeterministicMarineAdapter())
    client = TestClient(app)
    for extra in ({}, {"repair_route": True}):
        resp = client.post("/api/v1/passage", json=_body(**extra))
        assert resp.status_code == 200
        body = resp.json()
        assert "repaired_route" not in body
        segments = body["passage"]["segments"]
        assert segments[0]["start"] == {"lat": MARSEILLE[0], "lon": MARSEILLE[1]}
        assert segments[-1]["end"] == {"lat": PORQUEROLLES[0], "lon": PORQUEROLLES[1]}
