"""Deployment-side hardening for the public Space: CORS allowlist, per-IP
rate limiting, security headers.

This lives in ``hf-space/`` on purpose. It is infrastructure for *this*
deployment, not domain logic — a Fly.io or Modal wrapper would solve the same
problems with that platform's primitives (edge WAF, per-route quotas) and
would not import this module. Keeping it out of ``mcp-core`` is what makes the
cloud-agnostic promise real rather than nominal.

Everything is configurable by environment variable so the dev Space and prod
Space can diverge without a code change.
"""

from __future__ import annotations

import math
import os
import time
from collections import OrderedDict, deque
from collections.abc import Iterable

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# --------------------------------------------------------------------- CORS

# Browsers are the only callers CORS constrains: MCP clients (Claude, Le Chat,
# ...) reach /mcp server-to-server and never send an Origin. So this list only
# has to cover the web app's own origins.
#
# ohmywind.fr is canonical; openwind.fr is kept as a 301 source, and a browser
# that followed the redirect still carries the *original* origin on the
# subsequent XHR, so both families must be listed. localhost covers `vite dev`
# (5173) and `vite preview` (4173) against a live backend.
DEFAULT_ALLOWED_ORIGINS = [
    "https://ohmywind.fr",
    "https://www.ohmywind.fr",
    "https://dev.ohmywind.fr",
    "https://openwind.fr",
    "https://www.openwind.fr",
    "https://dev.openwind.fr",
    "http://localhost:5173",
    "http://localhost:4173",
]

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("OPENWIND_ALLOWED_ORIGINS", ",".join(DEFAULT_ALLOWED_ORIGINS)).split(
        ","
    )
    if o.strip()
]


# ----------------------------------------------------------------- client IP

# uvicorn runs with ``forwarded_allow_ips="*"`` (required: HF terminates TLS at
# the edge, and without it every redirect and scheme is wrong). In that mode
# uvicorn's ProxyHeadersMiddleware trusts every hop and takes the *leftmost*
# X-Forwarded-For entry — which is whatever the client chose to send. So
# ``request.client.host`` is attacker-controlled and unusable as a rate-limit
# key: `curl -H 'X-Forwarded-For: <random>'` would mint a fresh bucket per
# request.
#
# The only entry we can trust is the one appended by the proxy directly in
# front of us, i.e. the rightmost. ``OPENWIND_TRUSTED_PROXY_HOPS`` says how
# many proxies sit in front of the app; raise it if another CDN is ever
# stacked ahead of HF (each extra hop shifts the real client one place left).
TRUSTED_PROXY_HOPS = max(1, int(os.environ.get("OPENWIND_TRUSTED_PROXY_HOPS", "1")))


def resolve_client_ip(scope: Scope, *, hops: int = TRUSTED_PROXY_HOPS) -> str:
    """Best-effort real client IP, resistant to X-Forwarded-For spoofing.

    Reads the raw header rather than ``scope["client"]`` because uvicorn has
    already rewritten the latter to the spoofable leftmost entry.
    """
    forwarded = ""
    for name, value in scope.get("headers", ()):
        if name == b"x-forwarded-for":
            forwarded = value.decode("latin-1")
            break

    parts = [p.strip() for p in forwarded.split(",") if p.strip()]
    if parts:
        # -hops == rightmost when a single proxy fronts us. Clamp so a
        # misconfigured hop count degrades to "most trustworthy available"
        # instead of silently reading the spoofable end of the list.
        return parts[-hops] if len(parts) >= hops else parts[0]

    client = scope.get("client")
    return client[0] if client else "unknown"


# -------------------------------------------------------------- rate limiter


class _SlidingWindowCounter:
    """Fixed-memory sliding-window counter.

    The Space runs a single replica, so an in-process counter is coherent and
    Redis would be pure overhead. What it must not be is unbounded: a dict of
    IP -> timestamps that only ever grows is a slow leak that eventually eats
    the Space's RAM. Two guards, both applied on every request:

    1. Expired entries are purged. The store is an ``OrderedDict`` kept in
       last-activity order, so fully-expired entries pile up at the front and
       the purge is O(number actually expired), not O(size).
    2. A hard ceiling on tracked IPs, enforced by evicting the
       least-recently-active entry.

    A per-key deque never exceeds ``max_requests`` entries (it is trimmed
    before every append), so total memory is bounded by
    ``max_tracked_ips * max_requests`` timestamps.

    No lock: asyncio is single-threaded and no ``await`` happens between the
    read and the write below, so the section is atomic by construction.
    """

    def __init__(self, *, max_requests: int, window_s: float, max_tracked_ips: int) -> None:
        self._max_requests = max_requests
        self._window_s = window_s
        self._max_tracked_ips = max_tracked_ips
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()

    def _purge_expired(self, now: float) -> None:
        cutoff = now - self._window_s
        while self._hits:
            key = next(iter(self._hits))
            stamps = self._hits[key]
            while stamps and stamps[0] <= cutoff:
                stamps.popleft()
            if stamps:
                # Entries are ordered by last activity: if the least-recently
                # active one still has live hits, none behind it can be empty.
                break
            self._hits.popitem(last=False)

    def check(self, key: str, now: float | None = None) -> int | None:
        """Record a hit and return None, or return Retry-After seconds if over.

        A rejected request is deliberately *not* recorded: the window should
        drain on schedule rather than extend itself while a client retries.
        """
        now = time.monotonic() if now is None else now
        self._purge_expired(now)

        stamps = self._hits.get(key)
        if stamps is None:
            stamps = deque()
            self._hits[key] = stamps
        else:
            cutoff = now - self._window_s
            while stamps and stamps[0] <= cutoff:
                stamps.popleft()

        self._hits.move_to_end(key)

        if len(stamps) >= self._max_requests:
            return max(1, math.ceil(stamps[0] + self._window_s - now))

        stamps.append(now)
        while len(self._hits) > self._max_tracked_ips:
            self._hits.popitem(last=False)
        return None

    @property
    def tracked_ips(self) -> int:
        """Current store size. Exposed for tests and future observability."""
        return len(self._hits)


# Only the POST planners are limited. They are the sole routes that can fan out
# into many upstream Open-Meteo calls (a sweep walks up to MAX_SWEEP_WINDOWS
# departures), which is what actually needs protecting — both for our own CPU
# and to stay a good citizen on a keyless public API. GET /archetypes is a
# constant, /marine/marc reads local atlases, and /mcp is left alone so a
# legitimate MCP session doing many tool calls is never throttled.
DEFAULT_LIMITED_PATHS = ("/api/v1/passage", "/api/v1/passage-by-eta")

RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("OPENWIND_RATE_LIMIT_REQUESTS", "30"))
RATE_LIMIT_WINDOW_S = float(os.environ.get("OPENWIND_RATE_LIMIT_WINDOW_S", "300"))
RATE_LIMIT_MAX_IPS = int(os.environ.get("OPENWIND_RATE_LIMIT_MAX_IPS", "5000"))


class RateLimitMiddleware:
    """Per-IP sliding-window limit on the expensive POST routes."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        limited_paths: Iterable[str] = DEFAULT_LIMITED_PATHS,
        max_requests: int = RATE_LIMIT_MAX_REQUESTS,
        window_s: float = RATE_LIMIT_WINDOW_S,
        max_tracked_ips: int = RATE_LIMIT_MAX_IPS,
    ) -> None:
        self.app = app
        self._limited = frozenset(limited_paths)
        self._counter = _SlidingWindowCounter(
            max_requests=max_requests,
            window_s=window_s,
            max_tracked_ips=max_tracked_ips,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Preflight is never limited: an OPTIONS carries no body and no cost,
        # and 429-ing it would surface in the browser as an opaque CORS
        # failure rather than the real reason.
        if (
            scope["type"] != "http"
            or scope.get("method") == "OPTIONS"
            or scope.get("path") not in self._limited
        ):
            await self.app(scope, receive, send)
            return

        retry_after = self._counter.check(resolve_client_ip(scope))
        if retry_after is None:
            await self.app(scope, receive, send)
            return

        response = JSONResponse(
            {"error": "rate limit exceeded, retry shortly"},
            status_code=429,
            headers={"Retry-After": str(retry_after)},
        )
        await response(scope, receive, send)


# ---------------------------------------------------------- security headers


class SecurityHeadersMiddleware:
    """Add the baseline response headers to every route.

    ``X-Frame-Options: DENY`` is safe here: nothing this app serves over HTTP
    is meant to be framed. The MCP Apps widget is delivered as an MCP resource
    (``text/html;profile=mcp-app``) that the host inlines into its own
    sandboxed iframe — it is never fetched from this origin.
    """

    HEADERS = (
        (b"x-content-type-options", b"nosniff"),
        (b"x-frame-options", b"DENY"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
    )

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {name.lower() for name, _ in headers}
                headers.extend((k, v) for k, v in self.HEADERS if k not in present)
            await send(message)

        await self.app(scope, receive, send_with_headers)
