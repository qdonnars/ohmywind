# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""One line per request, an id to follow it by, and no addresses anywhere.

The last of those is the one worth having a test for. "Do not log IPs" is a
promise made in the privacy policy and kept by a handful of format strings,
which is exactly the kind of promise a refactor breaks without anyone
noticing. ``test_no_address_ever_reaches_the_log`` sends recognisable
addresses through every header the deployment reads and greps the whole log
for them.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

import pytest
from openwind_data.adapters.base import ForecastHorizonError
from openwind_data.testing import browser_cache_payload, hourly_axis
from starlette.testclient import TestClient

from openwind_api import security
from openwind_api.access import AccessLogMiddleware, request_id_of
from openwind_api.app import create_app
from openwind_api.routes import passage as passage_routes
from openwind_api.settings import Settings

ACCESS_LOGGER = "openwind_api.access"
DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)


@pytest.fixture
def client():
    return TestClient(create_app(Settings()))


@pytest.fixture
def access_lines(caplog):
    caplog.set_level(logging.INFO, logger=ACCESS_LOGGER)
    return lambda: [r.getMessage() for r in caplog.records if r.name == ACCESS_LOGGER]


def _fields(line: str) -> dict[str, str]:
    """Parse one logfmt line back into a dict, quotes included."""
    return {
        m.group(1): (m.group(2) or m.group(3))
        for m in re.finditer(r'(\w+)=(?:"((?:[^"\\]|\\.)*)"|(\S+))', line)
    }


class TestRequestId:
    def test_a_generated_id_comes_back_in_the_header(self, client) -> None:
        resp = client.get("/api/v1/archetypes")
        assert resp.status_code == 200
        assert re.fullmatch(r"[0-9a-f]{16}", resp.headers["x-request-id"])

    def test_the_callers_id_is_echoed(self, client) -> None:
        resp = client.get("/api/v1/archetypes", headers={"X-Request-Id": "web-42_abc.1"})
        assert resp.headers["x-request-id"] == "web-42_abc.1"

    def test_the_echoed_id_is_the_one_that_is_logged(self, client, access_lines) -> None:
        client.get("/api/v1/archetypes", headers={"X-Request-Id": "traced-once"})
        assert _fields(access_lines()[-1])["id"] == "traced-once"

    @pytest.mark.parametrize(
        "forged",
        [
            # A newline forges a second log entry; the rest are simply not ids.
            "ok\nid=other method=GET path=/ status=200",
            "a" * 65,
            "",
            "spaces here",
            "<script>",
        ],
    )
    def test_an_unusable_id_is_replaced_rather_than_echoed(self, client, forged) -> None:
        resp = client.get("/api/v1/archetypes", headers={"X-Request-Id": forged})
        assert re.fullmatch(r"[0-9a-f]{16}", resp.headers["x-request-id"])

    def test_a_forged_id_never_reaches_the_log(self, client, access_lines) -> None:
        client.get("/api/v1/archetypes", headers={"X-Request-Id": "x\nid=forged status=200"})
        assert not any("forged" in line for line in access_lines())

    def test_the_browser_is_allowed_to_read_it(self, client) -> None:
        # A header the browser cannot read is a header the web app cannot put
        # in a bug report.
        resp = client.get("/api/v1/archetypes", headers={"Origin": "https://ohmywind.fr"})
        assert "X-Request-Id" in resp.headers["access-control-expose-headers"]

    def test_two_requests_get_two_ids(self) -> None:
        assert request_id_of({"type": "http", "headers": []}) != request_id_of(
            {"type": "http", "headers": []}
        )


class TestOneLinePerRequest:
    def test_a_get_is_logged_once_with_its_shape(self, client, access_lines) -> None:
        client.get("/api/v1/archetypes")
        lines = access_lines()
        assert len(lines) == 1
        fields = _fields(lines[0])
        assert fields["method"] == "GET"
        assert fields["path"] == "/api/v1/archetypes"
        assert fields["status"] == "200"
        assert float(fields["dur_ms"]) >= 0
        assert int(fields["bytes"]) > 0
        assert re.fullmatch(r"[0-9a-f]{8}", fields["bucket"])

    def test_three_requests_are_three_lines(self, client, access_lines) -> None:
        client.get("/api/v1/archetypes")
        client.get("/api/v1/marine/marc/coverage")
        client.post("/api/v1/passage", json={})
        assert len(access_lines()) == 3

    def test_a_refusal_is_logged_with_the_status_the_client_got(self, client, access_lines) -> None:
        client.post("/api/v1/passage", json={})
        assert _fields(access_lines()[-1])["status"] == "422"

    def test_the_limiter_s_own_429_is_logged(self, monkeypatch, access_lines) -> None:
        """The middleware is outside the limiter, so it sees what a handler never does."""
        original = security.RateLimitMiddleware.__init__

        def _one_request(self, app, **kwargs):
            original(self, app, **{**kwargs, "max_requests": 1})

        monkeypatch.setattr(security.RateLimitMiddleware, "__init__", _one_request)
        limited = TestClient(create_app(Settings()))
        limited.post("/api/v1/passage", json={})
        limited.post("/api/v1/passage", json={})
        assert [_fields(line)["status"] for line in access_lines()] == ["422", "429"]

    def test_a_handler_that_raises_is_still_logged(self, access_lines) -> None:
        async def _boom(scope, receive, send):
            raise ZeroDivisionError("bug")

        client = TestClient(AccessLogMiddleware(_boom), raise_server_exceptions=False)
        assert client.get("/api/v1/archetypes").status_code == 500
        assert _fields(access_lines()[-1])["status"] == "500"


class TestForecastCacheField:
    """Which door the request came through: the field these logs exist for."""

    def _body(self, **extra) -> dict:
        body = {
            "waypoints": [[43.29, 5.37], [43.00, 6.20]],
            "departure": DEPARTURE.isoformat(),
            "archetype": "cruiser_30ft",
        }
        body.update(extra)
        return body

    def test_a_request_that_never_reached_the_parser_says_nothing(
        self, client, access_lines
    ) -> None:
        client.get("/api/v1/archetypes")
        assert _fields(access_lines()[-1])["cache"] == "-"

    def test_a_malformed_body_says_nothing_either(self, client, access_lines) -> None:
        client.post("/api/v1/passage", json={})
        assert _fields(access_lines()[-1])["cache"] == "-"

    def test_a_live_plan_says_no(self, client, access_lines, monkeypatch) -> None:
        # Stop at the engine: the field is decided by parsing, before any fetch.
        async def _stub(*_args, **_kwargs):
            raise ForecastHorizonError("meteofrance_arome_france", DEPARTURE)

        monkeypatch.setattr(passage_routes, "estimate_passage", _stub)
        assert client.post("/api/v1/passage", json=self._body()).status_code == 422
        assert _fields(access_lines()[-1])["cache"] == "no"

    def test_a_plan_off_the_browser_cache_says_yes(self, client, access_lines) -> None:
        axis = hourly_axis(DEPARTURE, DEPARTURE.replace(hour=20))
        payload = browser_cache_payload([(43.29, 5.37), (43.00, 6.20)], axis)
        resp = client.post("/api/v1/passage", json=self._body(forecast_cache=payload))
        assert resp.status_code == 200
        assert _fields(access_lines()[-1])["cache"] == "yes"


def test_no_address_ever_reaches_the_log(caplog) -> None:
    """The promise the privacy policy makes, checked against every log line.

    Both address families, through both headers the deployment reads, on a
    route that answers and on one that refuses. Anything that ends up
    quoting the caller rather than hashing it fails here.
    """
    caplog.set_level(logging.DEBUG)
    addresses = ["203.0.113.77", "2001:db8:dead:beef::1"]
    client = TestClient(create_app(Settings()))
    for address in addresses:
        client.get("/api/v1/archetypes", headers={"X-Forwarded-For": f"{address}, 10.0.0.1"})
        client.post("/api/v1/passage", json={}, headers={"X-Real-Ip": address})

    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert logged  # the check is worthless if nothing was logged at all
    for address in addresses:
        assert address not in logged
    # Nor the hash's input in any other shape: no dotted quad at all.
    assert not re.search(r"\b\d{1,3}(\.\d{1,3}){3}\b", logged)
