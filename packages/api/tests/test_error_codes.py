# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The structured error contract (GO 3), for the paths a golden cannot reach.

``error`` stays what it was, byte for byte, and ``code`` is appended beside
it. The goldens in ``test_rest_goldens.py`` pin the twelve bodies a request
can produce on its own; the ones here need an upstream failure, a full
rate-limit bucket or an oversized sweep to happen, so they are asserted on
the code rather than recorded.

The reason any of this exists: the web client used to decide what to tell the
user by matching regular expressions against English sentences written for an
operator reading a log. Rewording an engine message broke a French error
screen, silently, with no test in between.
"""

from __future__ import annotations

import contextlib
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from openwind_data.adapters.base import ForecastHorizonError, UpstreamRateLimitError
from starlette.responses import PlainTextResponse
from starlette.testclient import TestClient

from openwind_api import security
from openwind_api.app import create_app
from openwind_api.errors import DEFAULT_VALUE_ERROR_CODE, code_for_value_error
from openwind_api.routes import passage as passage_routes
from openwind_api.settings import Settings

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
MARSEILLE = [43.29, 5.37]
PORQUEROLLES = [43.00, 6.20]


def _body(**extra) -> dict:
    body = {
        "waypoints": [MARSEILLE, PORQUEROLLES],
        "departure": DEPARTURE.isoformat(),
        "archetype": "cruiser_30ft",
    }
    body.update(extra)
    return body


class _FakeRequest:
    def __init__(self, body: object) -> None:
        self._body = body

    async def json(self) -> object:
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def _payload(resp) -> dict:
    import json

    return json.loads(bytes(resp.body))


def _raising(exc: Exception):
    async def _stub(*_args, **_kwargs):
        raise exc

    return _stub


class TestEngineFailures:
    """Codes that need the engine to refuse, not the parser."""

    async def test_forecast_horizon(self, monkeypatch) -> None:
        monkeypatch.setattr(
            passage_routes,
            "estimate_passage",
            _raising(ForecastHorizonError("meteofrance_arome_france", DEPARTURE)),
        )
        resp = await passage_routes.api_passage(_FakeRequest(_body()))
        assert resp.status_code == 422
        assert _payload(resp)["code"] == "forecast_horizon"

    async def test_upstream_timeout(self, monkeypatch) -> None:
        monkeypatch.setattr(
            passage_routes, "estimate_passage", _raising(httpx.ReadTimeout("too slow"))
        )
        resp = await passage_routes.api_passage(_FakeRequest(_body()))
        assert resp.status_code == 503
        assert _payload(resp)["code"] == "upstream_timeout"

    async def test_upstream_rate_limited(self, monkeypatch) -> None:
        # Distinct from our own limiter: this one means the caller can do
        # nothing but wait, and telling them to slow down would be wrong.
        monkeypatch.setattr(
            passage_routes,
            "estimate_passage",
            _raising(UpstreamRateLimitError("Minutely API request limit exceeded.")),
        )
        resp = await passage_routes.api_passage(_FakeRequest(_body()))
        assert resp.status_code == 503
        assert _payload(resp)["code"] == "upstream_rate_limited"

    async def test_sweep_too_large(self) -> None:
        # 14 days of hourly departures is the documented cap; ask for a month.
        resp = await passage_routes.api_passage(
            _FakeRequest(
                _body(
                    latest_departure=(DEPARTURE + timedelta(days=30)).isoformat(),
                    sweep_interval_hours=1,
                )
            )
        )
        assert resp.status_code == 422
        assert _payload(resp)["code"] == "sweep_too_large"

    async def test_a_bug_is_still_a_500(self, monkeypatch) -> None:
        # Only deliberate refusals are translated. Swallowing the rest would
        # turn every bug into a 422 the client would display to the user as
        # their own mistake.
        monkeypatch.setattr(passage_routes, "estimate_passage", _raising(ZeroDivisionError("bug")))
        with pytest.raises(ZeroDivisionError):
            await passage_routes.api_passage(_FakeRequest(_body()))


class TestMalformedBody:
    async def test_unparseable_json(self) -> None:
        resp = await passage_routes.api_passage(_FakeRequest(ValueError("not json")))
        assert resp.status_code == 422
        assert _payload(resp)["code"] == "invalid_json"

    async def test_a_body_that_is_not_an_object(self) -> None:
        # A JSON array used to reach ``body.get`` and surface as a 500.
        resp = await passage_routes.api_passage(_FakeRequest([1, 2, 3]))
        assert resp.status_code == 422
        assert _payload(resp)["code"] == "invalid_json"


class TestRateLimited:
    def test_the_429_carries_its_code_and_the_delay_in_the_body(self, monkeypatch) -> None:
        """``retry_after`` is duplicated from the header for a reason.

        A cross-origin fetch only reads CORS-safelisted response headers, so
        the copy in the body is the one the web app can always reach. Without
        it the copy had to guess, which is how it ended up hard-coding "une
        minute" for a five-minute window.
        """
        original = security.RateLimitMiddleware.__init__

        def _one_request(self, app, **kwargs):
            kwargs["max_requests"] = 1
            original(self, app, **kwargs)

        monkeypatch.setattr(security.RateLimitMiddleware, "__init__", _one_request)
        client = TestClient(create_app(Settings(), _StubMcpApp()))
        client.post("/api/v1/passage", json={})
        resp = client.post("/api/v1/passage", json={})
        assert resp.status_code == 429
        payload = resp.json()
        assert payload["code"] == "rate_limited"
        assert payload["retry_after"] == int(resp.headers["retry-after"])


class _StubMcpApp:
    class _Router:
        @staticmethod
        def lifespan_context(_app):
            @contextlib.asynccontextmanager
            async def _noop(_):
                yield

            return _noop(_app)

    router = _Router()

    async def __call__(self, scope, receive, send):
        await PlainTextResponse("mcp")(scope, receive, send)


class TestClassification:
    def test_an_unrecognised_refusal_still_gets_a_code(self) -> None:
        # The table is a lookup, not an exhaustive match: a new domain rule
        # must degrade to a generic code, never to a missing field.
        assert code_for_value_error(ValueError("something new")) == DEFAULT_VALUE_ERROR_CODE
