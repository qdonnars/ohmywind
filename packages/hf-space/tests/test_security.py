# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Unit tests for the deployment hardening in ``security.py``.

Covers the three properties that matter operationally:
  - the rate-limit store cannot grow without bound (it lives for the whole
    life of a long-running Space process),
  - the rate-limit key is not spoofable via X-Forwarded-For,
  - the middleware stack is wired in the right order on the real app.

Run from the mcp-core worktree venv:

    cd packages/mcp-core && uv run --no-active python -m pytest ../hf-space/tests
"""

from __future__ import annotations

import importlib.util
import pathlib

import pytest

import security  # sys.path prepared by conftest.py

_HF_DIR = pathlib.Path(__file__).parents[1].resolve()


def _load_app():
    """Load app.py by path (hf-space has no pyproject; it ships via Docker)."""
    spec = importlib.util.spec_from_file_location("hf_app", _HF_DIR / "app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _scope(path: str = "/api/v1/passage", method: str = "POST", **headers: str) -> dict:
    return {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": ("10.0.0.1", 12345),
    }


# ------------------------------------------------------------- client IP


def test_client_ip_uses_rightmost_forwarded_hop() -> None:
    # uvicorn's own middleware would pick 1.2.3.4 here (leftmost, client-set).
    # Only the last hop was appended by a proxy we actually sit behind.
    scope = _scope(**{"x-forwarded-for": "1.2.3.4, 203.0.113.7"})
    assert security.resolve_client_ip(scope) == "203.0.113.7"


def test_client_ip_ignores_spoofed_prefix() -> None:
    """The whole point: a hostile client cannot mint a fresh bucket per call."""
    real = "203.0.113.7"
    keys = {
        security.resolve_client_ip(_scope(**{"x-forwarded-for": f"{spoof}, {real}"}))
        for spoof in ("1.1.1.1", "2.2.2.2", "3.3.3.3")
    }
    assert keys == {real}


def test_client_ip_single_hop() -> None:
    assert security.resolve_client_ip(_scope(**{"x-forwarded-for": "203.0.113.7"})) == "203.0.113.7"


def test_client_ip_falls_back_to_peer_without_header() -> None:
    assert security.resolve_client_ip(_scope()) == "10.0.0.1"


def test_client_ip_clamps_when_hops_exceed_chain() -> None:
    # Misconfigured hop count must degrade to the most trustworthy entry
    # available, never to the spoofable end of the list.
    scope = _scope(**{"x-forwarded-for": "1.2.3.4, 203.0.113.7"})
    assert security.resolve_client_ip(scope, hops=5) == "1.2.3.4"


def test_client_ip_unknown_when_no_header_and_no_peer() -> None:
    scope = _scope()
    scope["client"] = None
    assert security.resolve_client_ip(scope) == "unknown"


# --------------------------------------------------------- sliding window


def _counter(**kw):
    params = {"max_requests": 3, "window_s": 60.0, "max_tracked_ips": 100}
    params.update(kw)
    return security._SlidingWindowCounter(**params)


def test_allows_up_to_the_limit_then_rejects() -> None:
    c = _counter()
    assert [c.check("ip", now=0.0) for _ in range(3)] == [None, None, None]
    assert c.check("ip", now=0.0) is not None


def test_retry_after_is_positive_seconds() -> None:
    c = _counter()
    for _ in range(3):
        c.check("ip", now=0.0)
    assert c.check("ip", now=10.0) == 50


def test_window_slides() -> None:
    c = _counter()
    for _ in range(3):
        c.check("ip", now=0.0)
    assert c.check("ip", now=30.0) is not None
    # Past the window, the old hits have aged out.
    assert c.check("ip", now=61.0) is None


def test_rejected_request_does_not_extend_the_ban() -> None:
    c = _counter()
    for _ in range(3):
        c.check("ip", now=0.0)
    for t in (10.0, 20.0, 30.0, 40.0, 50.0):
        assert c.check("ip", now=t) is not None
    assert c.check("ip", now=61.0) is None


def test_buckets_are_per_ip() -> None:
    c = _counter()
    for _ in range(3):
        c.check("a", now=0.0)
    assert c.check("a", now=0.0) is not None
    assert c.check("b", now=0.0) is None


# ------------------------------------------------------- bounded memory


def test_expired_entries_are_purged() -> None:
    c = _counter()
    for i in range(50):
        c.check(f"ip-{i}", now=0.0)
    assert c.tracked_ips == 50
    # One request past the window purges every stale entry, not just its own.
    c.check("fresh", now=100.0)
    assert c.tracked_ips == 1


def test_tracked_ips_never_exceeds_the_cap() -> None:
    c = _counter(max_tracked_ips=10)
    for i in range(1000):
        # All within one window, so nothing expires: only the hard cap bounds it.
        c.check(f"ip-{i}", now=1.0)
    assert c.tracked_ips == 10


def test_eviction_drops_the_least_recently_active() -> None:
    c = _counter(max_tracked_ips=3)
    c.check("old", now=0.0)
    c.check("mid", now=1.0)
    c.check("new", now=2.0)
    c.check("recent-again", now=3.0)  # forces one eviction
    # "old" was the least recently active, so it is the one that went.
    assert c.tracked_ips == 3
    assert c.check("old", now=3.0) is None  # fresh bucket == it was evicted
    assert c.check("mid", now=3.0) is None


def test_per_key_timestamps_stay_bounded() -> None:
    c = _counter(max_requests=3)
    for t in range(500):
        c.check("ip", now=float(t))
    assert len(c._hits["ip"]) <= 3


# ------------------------------------------------- middleware, end to end


class _StubMcpApp:
    """Stands in for FastMCP's streamable-http app: a route and a no-op lifespan."""

    class _Router:
        @staticmethod
        def lifespan_context(_app):
            import contextlib

            @contextlib.asynccontextmanager
            async def _noop(_):
                yield

            return _noop(_app)

    router = _Router()

    async def __call__(self, scope, receive, send):
        from starlette.responses import PlainTextResponse

        await PlainTextResponse("mcp")(scope, receive, send)


@pytest.fixture
def client():
    from starlette.testclient import TestClient

    app = _load_app()
    return TestClient(app.build_app(_StubMcpApp()))


def test_preflight_from_the_web_app_origin_is_accepted(client) -> None:
    resp = client.options(
        "/api/v1/passage",
        headers={
            "Origin": "https://ohmywind.fr",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "*"


def test_cors_is_deliberately_open(client) -> None:
    """Guards the decision, not an accident.

    An allowlist was implemented and deployed, then removed: Hugging Face's
    edge answers preflights itself and rewrites CORS headers, so the app's
    verdict never reached a browser. Keeping an inert allowlist would have
    read as an active control while protecting nothing.

    If this assertion ever fails because someone re-added a list, that is the
    moment to re-check whether the platform still pre-empts CORS (see the
    reproduction in security.py) rather than to just update the test.
    """
    assert security.ALLOWED_ORIGINS == ["*"]


def test_security_headers_present(client) -> None:
    resp = client.get("/api/v1/archetypes")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "frame-ancestors" in resp.headers["content-security-policy"]


def test_security_headers_on_the_landing_page(client) -> None:
    assert client.get("/").headers["x-content-type-options"] == "nosniff"


def test_the_hf_space_page_can_still_frame_the_landing_page(client) -> None:
    """Regression guard for the outage of 2026-08-01.

    A Space's page on huggingface.co renders the app in an iframe pointing at
    <slug>.hf.space. Shipping `X-Frame-Options: DENY` blanked the project's
    own landing page on the HF catalogue. If this ever tightens back to a
    blanket deny, that page breaks again with no error anywhere in our logs.
    """
    csp = client.get("/").headers["content-security-policy"]
    assert "https://huggingface.co" in csp
    assert "'none'" not in csp


def test_x_frame_options_is_not_sent(client) -> None:
    # frame-ancestors is the single source of truth. Sending both risks a
    # browser honouring the stricter X-Frame-Options and re-breaking framing.
    assert "x-frame-options" not in client.get("/").headers


def test_rate_limit_triggers_on_repeated_posts(monkeypatch) -> None:
    from starlette.testclient import TestClient

    app = _load_app()
    monkeypatch.setattr(security.RateLimitMiddleware, "__init__", _init_with_limit(3))
    client = TestClient(app.build_app(_StubMcpApp()))

    # Bodies are deliberately invalid: we are measuring the limiter, not the
    # planner, and a 422 still counts as a request against the quota.
    codes = [client.post("/api/v1/passage", json={}).status_code for _ in range(5)]
    assert codes[:3] == [422, 422, 422]
    assert codes[3:] == [429, 429]


def test_rate_limited_response_carries_retry_after_and_cors(monkeypatch) -> None:
    from starlette.testclient import TestClient

    app = _load_app()
    monkeypatch.setattr(security.RateLimitMiddleware, "__init__", _init_with_limit(1))
    client = TestClient(app.build_app(_StubMcpApp()))

    headers = {"Origin": "https://ohmywind.fr"}
    client.post("/api/v1/passage", json={}, headers=headers)
    resp = client.post("/api/v1/passage", json={}, headers=headers)

    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) >= 1
    # Without this the browser reports an opaque CORS error instead of the 429,
    # and the user never sees the real reason or the retry delay.
    assert resp.headers["access-control-allow-origin"] == "*"
    assert "rate limit" in resp.json()["error"]

    # The assertion above on ``retry-after`` is NOT enough on its own, and that
    # gap shipped once: TestClient reads the raw response, so it sees the header
    # whether or not the browser would. A cross-origin fetch only gets the
    # CORS-safelisted response headers plus whatever the server explicitly
    # exposes, so without this the web app reads null and has to invent a delay.
    exposed = {h.strip().lower() for h in resp.headers["access-control-expose-headers"].split(",")}
    assert "retry-after" in exposed


def test_retry_after_never_exceeds_the_configured_window(monkeypatch) -> None:
    """The advertised delay must stay inside the window it is derived from.

    Guards the copy contract the web app depends on: it renders whatever we
    send here, so an out-of-range value becomes a wrong promise on screen.
    """
    counter = security._SlidingWindowCounter(max_requests=2, window_s=300.0, max_tracked_ips=10)
    assert counter.check("1.2.3.4", now=1000.0) is None
    assert counter.check("1.2.3.4", now=1001.0) is None

    retry_after = counter.check("1.2.3.4", now=1002.0)
    assert retry_after is not None
    assert 1 <= retry_after <= 300


def test_get_routes_and_mcp_are_not_rate_limited(monkeypatch) -> None:
    from starlette.testclient import TestClient

    app = _load_app()
    monkeypatch.setattr(security.RateLimitMiddleware, "__init__", _init_with_limit(1))
    client = TestClient(app.build_app(_StubMcpApp()))

    assert all(client.get("/api/v1/archetypes").status_code == 200 for _ in range(5))
    # A legitimate MCP session issues many tool calls; throttling it would be
    # far more damaging than the abuse we are guarding against.
    assert all(client.get("/mcp-probe").status_code == 200 for _ in range(5))


def test_preflight_is_never_rate_limited(monkeypatch) -> None:
    from starlette.testclient import TestClient

    app = _load_app()
    monkeypatch.setattr(security.RateLimitMiddleware, "__init__", _init_with_limit(1))
    client = TestClient(app.build_app(_StubMcpApp()))

    preflight = {
        "Origin": "https://ohmywind.fr",
        "Access-Control-Request-Method": "POST",
    }
    codes = [client.options("/api/v1/passage", headers=preflight).status_code for _ in range(5)]
    assert codes == [200] * 5


def _init_with_limit(max_requests: int):
    """Patched __init__ pinning a small quota, so tests stay fast and explicit."""
    original = security.RateLimitMiddleware.__init__

    def _init(self, app, **kwargs):
        kwargs["max_requests"] = max_requests
        original(self, app, **kwargs)

    return _init


# -------------------------------------------------- bucket diagnostics


def test_bucket_id_is_stable_and_short() -> None:
    scope = _scope(**{"x-forwarded-for": "1.2.3.4, 203.0.113.7"})
    assert security.bucket_id(scope) == security.bucket_id(scope)
    assert len(security.bucket_id(scope)) == 8


def test_bucket_id_differs_between_clients() -> None:
    a = security.bucket_id(_scope(**{"x-forwarded-for": "203.0.113.7"}))
    b = security.bucket_id(_scope(**{"x-forwarded-for": "203.0.113.8"}))
    assert a != b


def test_bucket_id_leaks_no_address() -> None:
    assert "203.0.113.7" not in security.bucket_id(_scope(**{"x-forwarded-for": "203.0.113.7"}))


def test_bucket_id_ignores_a_spoofed_prefix() -> None:
    # Same property as the rate-limit key: it is the same function.
    plain = security.bucket_id(_scope(**{"x-forwarded-for": "203.0.113.7"}))
    spoofed = security.bucket_id(_scope(**{"x-forwarded-for": "9.9.9.9, 203.0.113.7"}))
    assert plain == spoofed


def test_forwarded_hop_count() -> None:
    assert security.forwarded_hop_count(_scope()) == 0
    assert security.forwarded_hop_count(_scope(**{"x-forwarded-for": "1.1.1.1"})) == 1
    assert security.forwarded_hop_count(_scope(**{"x-forwarded-for": "1.1.1.1, 2.2.2.2"})) == 2


def test_rate_limited_response_exposes_the_bucket(monkeypatch) -> None:
    from starlette.testclient import TestClient

    app = _load_app()
    monkeypatch.setattr(security.RateLimitMiddleware, "__init__", _init_with_limit(1))
    client = TestClient(app.build_app(_StubMcpApp()))

    client.post("/api/v1/passage", json={})
    resp = client.post("/api/v1/passage", json={})
    assert resp.status_code == 429
    assert len(resp.headers["x-ratelimit-bucket"]) == 8


def test_client_debug_route_reports_hops_without_leaking_the_address(client) -> None:
    resp = client.get("/api/v1/_client", headers={"X-Forwarded-For": "9.9.9.9, 203.0.113.7"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["forwarded_hops"] == 2
    assert body["trusted_hops"] == security.TRUSTED_PROXY_HOPS
    assert len(body["bucket"]) == 8
    # forwarded_hops == 0 in production would mean every caller shares one
    # bucket; the whole point of the route is to make that visible.
    assert "203.0.113.7" not in resp.text
    assert "9.9.9.9" not in resp.text


# --------------------------------------------------- edge proxy attestation


def _edge_scope(secret: str | None, xff: str) -> dict:
    headers = {"x-forwarded-for": xff}
    if secret is not None:
        headers["x-ohmywind-edge"] = secret
    return _scope(**headers)


def test_direct_caller_cannot_buy_extra_hops(monkeypatch) -> None:
    """The live bypass of 2026-08-01, as a test.

    With TRUSTED_PROXY_HOPS=2 and no attestation, a caller reaching the Space
    directly could send any X-Forwarded-For and land on `<forged>, <real>`,
    where counting two from the right reads the forged entry. One header, one
    fresh rate-limit bucket per request.
    """
    monkeypatch.setattr(security, "EDGE_SECRET", "s3cret")
    monkeypatch.setattr(security, "TRUSTED_PROXY_HOPS", 2)

    keys = {
        security.resolve_client_ip(_edge_scope(None, f"{spoof}, 203.0.113.7"))
        for spoof in ("1.1.1.1", "2.2.2.2", "3.3.3.3")
    }
    assert keys == {"203.0.113.7"}


def test_edge_traffic_still_reads_the_real_client(monkeypatch) -> None:
    monkeypatch.setattr(security, "EDGE_SECRET", "s3cret")
    monkeypatch.setattr(security, "TRUSTED_PROXY_HOPS", 2)
    scope = _edge_scope("s3cret", "203.0.113.7, 10.0.0.9")
    assert security.resolve_client_ip(scope) == "203.0.113.7"


def test_wrong_secret_is_treated_as_direct(monkeypatch) -> None:
    monkeypatch.setattr(security, "EDGE_SECRET", "s3cret")
    monkeypatch.setattr(security, "TRUSTED_PROXY_HOPS", 2)
    scope = _edge_scope("not-the-secret", "1.1.1.1, 203.0.113.7")
    assert security.resolve_client_ip(scope) == "203.0.113.7"
    assert security.came_through_edge(scope) is False


def test_unconfigured_secret_never_attests(monkeypatch) -> None:
    monkeypatch.setattr(security, "EDGE_SECRET", "")
    assert security.came_through_edge(_edge_scope("anything", "1.1.1.1")) is False


def test_unconfigured_secret_fails_open(monkeypatch) -> None:
    """A rate limiter is an availability control, so it fails open.

    Failing closed would key every proxied request on the edge's egress
    address, collapsing all users into one bucket: an outage, traded for a
    hardening gap. The startup warning covers the gap instead.
    """
    monkeypatch.setattr(security, "EDGE_SECRET", "")
    monkeypatch.setattr(security, "TRUSTED_PROXY_HOPS", 2)
    assert security.trusted_hops_for(_edge_scope(None, "1.1.1.1, 2.2.2.2")) == 2


def test_startup_warns_when_hops_are_trusted_without_proof(monkeypatch, caplog) -> None:
    monkeypatch.setattr(security, "EDGE_SECRET", "")
    monkeypatch.setattr(security, "TRUSTED_PROXY_HOPS", 2)
    with caplog.at_level("WARNING"):
        security.warn_if_edge_secret_missing()
    assert "OPENWIND_EDGE_SECRET" in caplog.text


def test_no_warning_when_correctly_configured(monkeypatch, caplog) -> None:
    monkeypatch.setattr(security, "EDGE_SECRET", "s3cret")
    monkeypatch.setattr(security, "TRUSTED_PROXY_HOPS", 2)
    with caplog.at_level("WARNING"):
        security.warn_if_edge_secret_missing()
    assert caplog.text == ""


def test_single_hop_deployment_is_unaffected(monkeypatch) -> None:
    # Default posture: no proxy in front, nothing to attest, rightmost wins.
    monkeypatch.setattr(security, "EDGE_SECRET", "")
    monkeypatch.setattr(security, "TRUSTED_PROXY_HOPS", 1)
    scope = _edge_scope(None, "1.1.1.1, 203.0.113.7")
    assert security.resolve_client_ip(scope) == "203.0.113.7"
