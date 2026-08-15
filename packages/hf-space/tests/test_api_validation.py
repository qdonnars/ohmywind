# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Input-bounds tests for the REST handlers.

Same contract as ``mcp-core/tests/test_server_validation.py``: identical
wording on both shells, and refusal before any upstream weather call. The
handlers are driven with a minimal fake Request because hf-space has no
pyproject (it ships via Docker).
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
from datetime import UTC, datetime

import httpx
import pytest
from openwind_data.routing import MAX_WAYPOINTS

_APP_PATH = (pathlib.Path(__file__).parents[1] / "app.py").resolve()
_spec = importlib.util.spec_from_file_location("hf_app_validation", _APP_PATH)
app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(app)

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
MARSEILLE = [43.30, 5.35]
PORQUEROLLES = [43.00, 6.20]


class _FakeRequest:
    def __init__(self, body: dict) -> None:
        self._body = body

    async def json(self) -> dict:
        return self._body


class _FakeQueryRequest:
    def __init__(self, params: dict[str, str]) -> None:
        self.query_params = params


def _body(**extra) -> dict:
    payload = {
        "waypoints": [MARSEILLE, PORQUEROLLES],
        "departure": DEPARTURE.isoformat(),
        "archetype": "cruiser_40ft",
    }
    payload.update(extra)
    return payload


def _error(resp) -> str:
    return json.loads(bytes(resp.body))["error"]


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Any upstream call during these tests is itself the bug."""

    def _boom(*args, **kwargs):
        raise AssertionError("invalid input must be refused before any upstream fetch")

    monkeypatch.setattr(httpx.AsyncClient, "get", _boom)


# ------------------------------------------------------------ POST /passage


@pytest.mark.asyncio
async def test_lat_out_of_range_returns_422() -> None:
    resp = await app._api_passage(_FakeRequest(_body(waypoints=[[999, 5.35], PORQUEROLLES])))
    assert resp.status_code == 422
    assert "out of range [-90, 90]" in _error(resp)


@pytest.mark.asyncio
async def test_lon_out_of_range_returns_422() -> None:
    resp = await app._api_passage(_FakeRequest(_body(waypoints=[MARSEILLE, [43.0, 999]])))
    assert resp.status_code == 422
    assert "out of range [-180, 180]" in _error(resp)


@pytest.mark.asyncio
async def test_nan_coordinate_returns_422() -> None:
    # json.loads accepts the bare NaN literal, so this really is reachable
    # from a hand-rolled POST body.
    resp = await app._api_passage(
        _FakeRequest(_body(waypoints=[[float("nan"), 5.35], PORQUEROLLES]))
    )
    assert resp.status_code == 422
    assert "out of range" in _error(resp)


@pytest.mark.asyncio
async def test_single_waypoint_message_unchanged() -> None:
    # Byte-identical to the pre-existing wording: the web maps this string.
    resp = await app._api_passage(_FakeRequest(_body(waypoints=[MARSEILLE])))
    assert resp.status_code == 422
    assert _error(resp) == "at least 2 waypoints required"


@pytest.mark.asyncio
async def test_too_many_waypoints_returns_422() -> None:
    route = [[43.0 + i * 0.001, 5.0] for i in range(MAX_WAYPOINTS + 1)]
    resp = await app._api_passage(_FakeRequest(_body(waypoints=route)))
    assert resp.status_code == 422
    assert "too many waypoints" in _error(resp)


@pytest.mark.asyncio
async def test_waypoint_count_at_cap_is_not_rejected_by_bounds() -> None:
    # Must fail for some *other* reason (no network here), never for the cap.
    route = [[43.0 + i * 0.001, 5.0] for i in range(MAX_WAYPOINTS)]
    with pytest.raises(AssertionError, match="before any upstream fetch"):
        await app._api_passage(_FakeRequest(_body(waypoints=route)))


# ----------------------------------------------------- POST /passage-by-eta


@pytest.mark.asyncio
async def test_by_eta_lat_out_of_range_returns_422() -> None:
    resp = await app._api_passage_by_eta(
        _FakeRequest(
            {
                "waypoints": [[999, 5.35], PORQUEROLLES],
                "target_arrival": DEPARTURE.isoformat(),
                "archetype": "cruiser_40ft",
            }
        )
    )
    assert resp.status_code == 422
    assert "out of range [-90, 90]" in _error(resp)


@pytest.mark.asyncio
async def test_by_eta_single_waypoint_message_unchanged() -> None:
    resp = await app._api_passage_by_eta(
        _FakeRequest(
            {
                "waypoints": [MARSEILLE],
                "target_arrival": DEPARTURE.isoformat(),
                "archetype": "cruiser_40ft",
            }
        )
    )
    assert resp.status_code == 422
    assert _error(resp) == "at least 2 waypoints required"


# --------------------------------------------------- GET /marine/marc


@pytest.mark.asyncio
async def test_marc_overlay_rejects_out_of_range_point() -> None:
    resp = await app._api_marc_overlay(
        _FakeQueryRequest(
            {
                "lat": "999",
                "lon": "5.35",
                "start": DEPARTURE.isoformat(),
                "end": DEPARTURE.isoformat(),
            }
        )
    )
    assert resp.status_code == 422
    assert "out of range [-90, 90]" in _error(resp)


@pytest.mark.asyncio
async def test_marc_overlay_rejects_out_of_range_lon() -> None:
    resp = await app._api_marc_overlay(
        _FakeQueryRequest(
            {
                "lat": "43.3",
                "lon": "999",
                "start": DEPARTURE.isoformat(),
                "end": DEPARTURE.isoformat(),
            }
        )
    )
    assert resp.status_code == 422
    assert "out of range [-180, 180]" in _error(resp)
