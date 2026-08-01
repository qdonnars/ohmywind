"""Characterisation of ``POST /api/v1/passage-by-eta``.

This endpoint arrived after the April plan and had never been tested: the
whole ETA-driven path, the one a user takes when they pin an arrival time
rather than a departure, was covered by nothing at all.

As in the sibling API tests, the solver is stubbed. What is pinned here is the
shell: which bodies are rejected, with which status, and the exact envelope
returned on success. Phase 2 will move this logic into a shared view layer,
and these assertions are what will say whether it moved without changing.
"""

from __future__ import annotations

import dataclasses
import importlib.util
import json
import pathlib
from datetime import UTC, datetime

import httpx
import pytest

_APP_PATH = (pathlib.Path(__file__).parents[1] / "app.py").resolve()
_spec = importlib.util.spec_from_file_location("hf_app_by_eta", _APP_PATH)
app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(app)

ARRIVAL = datetime(2026, 5, 1, 18, 0, tzinfo=UTC)
MARSEILLE = [43.30, 5.35]
PORQUEROLLES = [43.00, 6.20]


class _FakeRequest:
    def __init__(self, body: object) -> None:
        self._body = body

    async def json(self) -> object:
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


@dataclasses.dataclass
class _StubReport:
    distance_nm: float = 42.0
    duration_h: float = 7.5


@dataclasses.dataclass
class _StubComplexity:
    score: int = 2


class _StubPlan:
    def __init__(self) -> None:
        self.report = _StubReport()
        self.target_arrival = ARRIVAL


def _body(**extra) -> dict:
    body = {
        "waypoints": [MARSEILLE, PORQUEROLLES],
        "target_arrival": ARRIVAL.isoformat(),
        "archetype": "cruiser_40ft",
    }
    body.update(extra)
    return body


def _payload(resp) -> dict:
    return json.loads(bytes(resp.body))


@pytest.fixture
def solved(monkeypatch):
    """Solver returns a plan, so only the response assembly is exercised."""

    async def _stub(*_args, **_kwargs):
        return _StubPlan()

    monkeypatch.setattr(app, "estimate_passage_for_arrival", _stub)
    monkeypatch.setattr(app, "score_complexity", lambda _report: _StubComplexity())


class TestEnvelope:
    async def test_success_returns_passage_complexity_and_eta(self, solved) -> None:
        resp = await app._api_passage_by_eta(_FakeRequest(_body()))
        assert resp.status_code == 200
        payload = _payload(resp)
        assert set(payload) == {"passage", "complexity", "eta", "forecast_updated_at"}
        assert payload["passage"]["distance_nm"] == 42.0
        assert payload["complexity"]["score"] == 2

    async def test_eta_block_echoes_the_resolved_arrival(self, solved) -> None:
        # The client reads this back to show what the solver actually hit,
        # which can differ from what was asked within the tolerance.
        resp = await app._api_passage_by_eta(_FakeRequest(_body()))
        assert _payload(resp)["eta"] == {"target_arrival": ARRIVAL.isoformat()}

    async def test_freshness_stamp_is_present_and_iso(self, solved) -> None:
        resp = await app._api_passage_by_eta(_FakeRequest(_body()))
        datetime.fromisoformat(_payload(resp)["forecast_updated_at"])


class TestRejectedBodies:
    async def test_unparseable_json(self) -> None:
        resp = await app._api_passage_by_eta(_FakeRequest(ValueError("nope")))
        assert resp.status_code == 422
        assert _payload(resp)["error"] == "invalid JSON body"

    @pytest.mark.parametrize("field", ["waypoints", "target_arrival", "archetype"])
    async def test_missing_required_field(self, field) -> None:
        body = _body()
        del body[field]
        resp = await app._api_passage_by_eta(_FakeRequest(body))
        assert resp.status_code == 422
        assert field in _payload(resp)["error"]

    async def test_unparseable_arrival(self) -> None:
        resp = await app._api_passage_by_eta(_FakeRequest(_body(target_arrival="soon")))
        assert resp.status_code == 422
        assert "invalid target_arrival" in _payload(resp)["error"]

    async def test_malformed_waypoints(self) -> None:
        resp = await app._api_passage_by_eta(_FakeRequest(_body(waypoints=[[43.3]])))
        assert resp.status_code == 422
        assert "invalid waypoints" in _payload(resp)["error"]

    async def test_out_of_range_latitude_never_reaches_upstream(self, monkeypatch) -> None:
        # Bounds are checked before any network call. Without this an absurd
        # point reached Open-Meteo and came back as a misleading "forecast
        # horizon exceeded".
        async def _explode(*_args, **_kwargs):
            raise AssertionError("solver must not be called for an invalid point")

        monkeypatch.setattr(app, "estimate_passage_for_arrival", _explode)
        resp = await app._api_passage_by_eta(
            _FakeRequest(_body(waypoints=[[999.0, 5.35], PORQUEROLLES]))
        )
        assert resp.status_code == 422

    async def test_single_waypoint_message_is_passed_through_verbatim(self) -> None:
        # The web client maps on this exact wording, so it is part of the
        # contract rather than an internal detail.
        resp = await app._api_passage_by_eta(_FakeRequest(_body(waypoints=[MARSEILLE])))
        assert resp.status_code == 422
        assert "at least 2 waypoints" in _payload(resp)["error"]

    async def test_invalid_efficiency(self) -> None:
        resp = await app._api_passage_by_eta(_FakeRequest(_body(efficiency="fast")))
        assert resp.status_code == 422
        assert "invalid efficiency" in _payload(resp)["error"]


class TestUpstreamFailures:
    async def test_unknown_archetype_is_a_422(self, monkeypatch) -> None:
        async def _stub(*_args, **_kwargs):
            raise KeyError("sloop_of_theseus")

        monkeypatch.setattr(app, "estimate_passage_for_arrival", _stub)
        resp = await app._api_passage_by_eta(_FakeRequest(_body()))
        assert resp.status_code == 422
        assert "unknown archetype" in _payload(resp)["error"]

    async def test_horizon_exceeded_is_a_422(self, monkeypatch) -> None:
        async def _stub(*_args, **_kwargs):
            raise app.ForecastHorizonError("arome", ARRIVAL)

        monkeypatch.setattr(app, "estimate_passage_for_arrival", _stub)
        resp = await app._api_passage_by_eta(_FakeRequest(_body()))
        assert resp.status_code == 422
        # The message names the fallback models, which is what the front
        # turns into its "try a longer-range model" hint.
        assert "forecast horizon exceeded" in _payload(resp)["error"]

    async def test_upstream_timeout_is_a_503_not_a_500(self, monkeypatch) -> None:
        # A slow weather service is not a client error, and the front shows a
        # retry hint on 503 specifically.
        async def _stub(*_args, **_kwargs):
            raise httpx.TimeoutException("too slow")

        monkeypatch.setattr(app, "estimate_passage_for_arrival", _stub)
        resp = await app._api_passage_by_eta(_FakeRequest(_body()))
        assert resp.status_code == 503
        assert "did not respond in time" in _payload(resp)["error"]
