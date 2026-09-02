# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Transport-level ceilings and response shaping on the public REST surface.

Everything here is about the *cost* of a request rather than its meaning: how
many bytes a caller may push, how many bytes we push back, and which routes
share a rate-limit bucket. The handlers' JSON stays byte-for-byte what it was;
only status codes for previously unbounded inputs, and headers, are new.

The MCP mount is asserted alongside the REST routes on purpose: it is a
streaming transport sharing the same middleware stack, and the easiest way to
break it is to wrap it in something that buffers.
"""

from __future__ import annotations

import contextlib
import importlib.util
import pathlib

import pytest
from starlette.responses import PlainTextResponse
from starlette.testclient import TestClient

import security  # sys.path prepared by conftest.py

_HF_DIR = pathlib.Path(__file__).parents[1].resolve()

# Big enough that the compressor would take it if it ever saw this path, so
# "no content-encoding on /mcp" means something.
_MCP_BODY = "streamed mcp payload " * 200


def _load_app():
    spec = importlib.util.spec_from_file_location("hf_app_limits", _HF_DIR / "app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _StubMcpApp:
    """Stands in for FastMCP's streamable-http app: a route and a no-op lifespan."""

    class _Router:
        @staticmethod
        def lifespan_context(_app):
            @contextlib.asynccontextmanager
            async def _noop(_):
                yield

            return _noop(_app)

    router = _Router()

    async def __call__(self, scope, receive, send):
        await PlainTextResponse(_MCP_BODY)(scope, receive, send)


@pytest.fixture
def client():
    return TestClient(_load_app().build_app(_StubMcpApp()))


# ------------------------------------------------------------- body ceiling


def _over_the_cap() -> bytes:
    return b"x" * (security.MAX_BODY_BYTES + 1)


@pytest.mark.parametrize("path", ["/api/v1/passage", "/api/v1/passage-by-eta"])
def test_declared_oversized_body_is_refused(client, path) -> None:
    resp = client.post(path, content=_over_the_cap(), headers={"Content-Type": "application/json"})
    assert resp.status_code == 413
    assert resp.json() == {"error": "request body too large (max 4 MB)"}


def test_chunked_oversized_body_is_refused(client) -> None:
    """No Content-Length to trust, so the ceiling has to hold on the stream.

    An httpx request built from an iterator carries ``Transfer-Encoding:
    chunked``: the size is unknown until the last byte arrives, which is the
    case the header check cannot cover.
    """

    def chunks():
        for _ in range(5):
            yield b"y" * (1024 * 1024)

    resp = client.post(
        "/api/v1/passage",
        content=chunks(),
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 413
    assert "too large" in resp.json()["error"]


def test_a_body_within_the_ceiling_still_reaches_the_handler(client) -> None:
    # Same 422 and same wording as before the ceiling existed: the middleware
    # is invisible to every request that was already legitimate.
    resp = client.post("/api/v1/passage", json={})
    assert resp.status_code == 422
    assert resp.json()["error"].startswith("missing fields")


def test_a_chunked_body_within_the_ceiling_is_replayed_intact(client) -> None:
    # The buffering path must hand the app the exact bytes it swallowed.
    def chunks():
        yield b'{"waypoints": [[43.3, 5.35], [43.0, 6.2]], '
        yield b'"departure": "not-a-date", "archetype": "cruiser_30ft"}'

    resp = client.post(
        "/api/v1/passage",
        content=chunks(),
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 422
    assert "invalid departure" in resp.json()["error"]


def test_the_ceiling_defaults_to_four_mebibytes() -> None:
    assert security.MAX_BODY_BYTES == 4 * 1024 * 1024


def test_the_ceiling_is_configurable() -> None:
    # OPENWIND_MAX_BODY_BYTES feeds this parameter at import; the message
    # follows the configured value rather than a hard-coded "4 MB".
    limited = security.BodySizeLimitMiddleware(None, max_bytes=2 * 1024 * 1024)
    assert limited._too_large_response().status_code == 413
    assert b"max 2 MB" in limited._too_large_response().body


def test_the_mcp_transport_is_left_alone(client) -> None:
    # Buffering a request body on a streaming transport is the one way this
    # middleware could break MCP, so it never sees that path.
    resp = client.post("/mcp-probe", content=b"z" * 128)
    assert resp.status_code == 200
    assert resp.text == _MCP_BODY


# -------------------------------------------------------------- compression


def test_json_responses_are_compressed_on_demand(client) -> None:
    resp = client.get("/api/v1/archetypes", headers={"Accept-Encoding": "gzip"})
    assert resp.status_code == 200
    assert resp.headers["content-encoding"] == "gzip"
    # Same payload as before, only smaller on the wire.
    assert isinstance(resp.json(), list)


def test_uncompressed_when_the_client_does_not_ask(client) -> None:
    resp = client.get("/api/v1/archetypes", headers={"Accept-Encoding": "identity"})
    assert resp.status_code == 200
    assert "content-encoding" not in resp.headers


def test_compression_actually_saves_bytes(client) -> None:
    plain = client.get("/api/v1/archetypes", headers={"Accept-Encoding": "identity"})
    gzipped = client.get("/api/v1/archetypes", headers={"Accept-Encoding": "gzip"})
    assert int(gzipped.headers["content-length"]) < int(plain.headers["content-length"]) / 2


def test_the_mcp_transport_is_never_compressed(client) -> None:
    """A streamed SSE body must not be handed to a compressor.

    The stub answers with a body well over the 1 KB threshold, so this asserts
    the path exclusion rather than the size threshold.
    """
    resp = client.get("/mcp-probe", headers={"Accept-Encoding": "gzip"})
    assert resp.status_code == 200
    assert "content-encoding" not in resp.headers
    assert len(_MCP_BODY) > 1024


def test_small_responses_are_left_alone(client) -> None:
    resp = client.get("/api/v1/_client", headers={"Accept-Encoding": "gzip"})
    assert resp.status_code == 200
    assert "content-encoding" not in resp.headers


def test_security_headers_survive_compression(client) -> None:
    resp = client.get("/api/v1/archetypes", headers={"Accept-Encoding": "gzip"})
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors" in resp.headers["content-security-policy"]


# ------------------------------------------------------------- cacheability


def test_the_archetype_table_is_cacheable_for_a_day(client) -> None:
    # It is compiled into the image and a new build restarts the Space, so a
    # stale answer is not reachable.
    assert client.get("/api/v1/archetypes").headers["cache-control"] == "public, max-age=86400"


def test_the_client_diagnostic_is_never_cached(client) -> None:
    # It reports per-request state; caching it would make it lie.
    assert client.get("/api/v1/_client").headers["cache-control"] == "no-store"


# --------------------------------------------------------- rate-limit buckets


def _init_with_limits(**overrides):
    original = security.RateLimitMiddleware.__init__

    def _init(self, app, **kwargs):
        kwargs.update(overrides)
        original(self, app, **kwargs)

    return _init


_MARC_QUERY = (
    "/api/v1/marine/marc?lat=48.39&lon=-4.49"
    "&start=2026-05-01T06:00:00%2B00:00&end=2026-05-01T12:00:00%2B00:00"
)


def test_the_overlay_does_not_share_the_planner_bucket(monkeypatch) -> None:
    """The web app fires one overlay call per corridor point, up to 60.

    On the planners' 30/min bucket a single computation would rate-limit
    itself, which is why the route used to be exempt altogether.
    """
    monkeypatch.setattr(security.RateLimitMiddleware, "__init__", _init_with_limits(max_requests=1))
    client = TestClient(_load_app().build_app(_StubMcpApp()))
    assert all(client.get(_MARC_QUERY).status_code == 200 for _ in range(5))


def test_the_overlay_is_limited_on_its_own_bucket(monkeypatch) -> None:
    # Exempt is not the same as free: each call runs a synchronous predictor
    # on the event loop, so the wider bucket still has a ceiling.
    monkeypatch.setattr(
        security.RateLimitMiddleware, "__init__", _init_with_limits(marc_max_requests=2)
    )
    client = TestClient(_load_app().build_app(_StubMcpApp()))
    codes = [client.get(_MARC_QUERY).status_code for _ in range(4)]
    assert codes == [200, 200, 429, 429]


def test_the_overlay_bucket_is_wider_than_the_planner_one() -> None:
    assert security.MARC_RATE_LIMIT_MAX_REQUESTS > security.RATE_LIMIT_MAX_REQUESTS
    # One computation's worth of corridor points must fit.
    assert security.MARC_RATE_LIMIT_MAX_REQUESTS >= 60


def test_filling_the_overlay_bucket_leaves_the_planners_alone(monkeypatch) -> None:
    monkeypatch.setattr(
        security.RateLimitMiddleware, "__init__", _init_with_limits(marc_max_requests=1)
    )
    client = TestClient(_load_app().build_app(_StubMcpApp()))
    client.get(_MARC_QUERY)
    assert client.get(_MARC_QUERY).status_code == 429
    assert client.post("/api/v1/passage", json={}).status_code == 422
