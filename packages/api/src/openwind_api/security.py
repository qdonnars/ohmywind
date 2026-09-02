# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Deployment-side hardening for the public Space: CORS allowlist, per-IP
rate limiting, request-body ceiling, security headers.

This lives in ``hf-space/`` on purpose. It is infrastructure for *this*
deployment, not domain logic — a Fly.io or Modal wrapper would solve the same
problems with that platform's primitives (edge WAF, per-route quotas) and
would not import this module. Keeping it out of ``mcp-core`` is what makes the
cloud-agnostic promise real rather than nominal.

Everything is configurable by environment variable so the dev Space and prod
Space can diverge without a code change.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import logging
import math
import os
import time
import zlib
from collections import OrderedDict, deque
from collections.abc import Iterable

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_logger = logging.getLogger(__name__)

# --------------------------------------------------------------------- CORS

# No allowlist here, and that is a deliberate, measured decision — not an
# oversight. Do not "fix" this by reinstating one without re-running the
# checks below.
#
# An allowlist was implemented and shipped to the dev Space, then found to be
# inert: Hugging Face's edge proxy answers CORS preflights itself and rewrites
# the CORS headers on every response, so nothing the application decides ever
# reaches the browser. Measured on the deployed Space:
#
#   OPTIONS /api/v1/passage
#     Origin: https://evil.example.com          -> 200 + acao: evil.example.com
#     Access-Control-Request-Method: DELETE     -> allow-methods: DELETE
#
# DELETE is not in this app's allowed methods, and Starlette answers a
# disallowed preflight with 400 (verified locally against this exact code).
# Getting a 200 that echoes DELETE proves the request never reached us. The
# edge also stamps `access-control-expose-headers: *` on plain 404s, a header
# this app never sets.
#
# Keeping a restrictive list would have been worse than having none: it reads
# as an active control in code review and in the threat model, while providing
# zero protection in production. False assurance is the real hazard.
#
# The protection that *does* hold on this platform is the rate limiter below,
# which lives in the container and is out of the edge's reach.
#
# IF THIS EVER MOVES OFF HUGGING FACE (Fly, Modal, VPS): re-add an allowlist.
# Application-level CORS is effective everywhere the edge does not pre-empt
# it. The origins to use are ohmywind.fr and www/dev variants, plus the
# openwind.fr family which is kept as a 301 source (a browser that followed
# the redirect still sends the original origin on the subsequent XHR), plus
# http://localhost:5173 and :4173 for `vite dev` / `vite preview`.
ALLOWED_ORIGINS = ["*"]


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

# Counting from the right is only safe while the chain length is what we think
# it is. The Cloudflare Worker in ``packages/edge-proxy`` rewrites
# X-Forwarded-For to the address Cloudflare vouches for, which is what pins
# TRUSTED_PROXY_HOPS to 2 in production.
#
# But the Space stays directly reachable on its ``*.hf.space`` hostname, and
# that path bypasses the Worker's sanitising. With hops=2 and a hand-written
# ``X-Forwarded-For``, the chain becomes ``<forged>, <real>`` and the app reads
# the forged entry — a fresh rate-limit bucket per request, measured live on
# 2026-08-01.
#
# So the hop count is not a property of the deployment, it is a property of
# each request: only traffic carrying the shared secret the Worker injects has
# earned the extra hop. Everything else is treated as direct, where the
# rightmost entry is the one HF appended and cannot be forged.
EDGE_SECRET = os.environ.get("OPENWIND_EDGE_SECRET", "")
_EDGE_HEADER = b"x-ohmywind-edge"


def came_through_edge(scope: Scope) -> bool:
    """True when this request carries our edge proxy's shared secret."""
    if not EDGE_SECRET:
        return False
    for name, value in scope.get("headers", ()):
        if name == _EDGE_HEADER:
            return hmac.compare_digest(value.decode("latin-1"), EDGE_SECRET)
    return False


def trusted_hops_for(scope: Scope) -> int:
    """How many proxy hops to trust for this particular request."""
    if not EDGE_SECRET:
        # Unconfigured: keep the deployment-wide setting. A rate limiter is an
        # availability control, and the convention for those is to fail open.
        # Failing closed here would mean every request behind the proxy keys on
        # Cloudflare's egress address, collapsing all users into one bucket:
        # that turns a hardening gap into an outage. The startup warning below
        # makes the gap loud instead of silent.
        return TRUSTED_PROXY_HOPS
    return TRUSTED_PROXY_HOPS if came_through_edge(scope) else 1


def warn_if_edge_secret_missing() -> None:
    """Log once at startup when the hop count is trusted without proof."""
    if TRUSTED_PROXY_HOPS > 1 and not EDGE_SECRET:
        _logger.warning(
            "OPENWIND_TRUSTED_PROXY_HOPS=%d but OPENWIND_EDGE_SECRET is unset: "
            "the rate-limit key can be forged by calling this host directly "
            "with an X-Forwarded-For header. Set the secret on both this "
            "deployment and the edge proxy.",
            TRUSTED_PROXY_HOPS,
        )


def resolve_client_ip(scope: Scope, *, hops: int | None = None) -> str:
    """Best-effort real client IP, resistant to X-Forwarded-For spoofing.

    Reads the raw header rather than ``scope["client"]`` because uvicorn has
    already rewritten the latter to the spoofable leftmost entry.

    ``hops`` defaults to what this request has earned (see
    ``trusted_hops_for``); pass it explicitly only in tests.
    """
    if hops is None:
        hops = trusted_hops_for(scope)
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


def forwarded_hop_count(scope: Scope) -> int:
    """Number of entries in X-Forwarded-For, 0 when the header is absent."""
    for name, value in scope.get("headers", ()):
        if name == b"x-forwarded-for":
            return len([p for p in value.decode("latin-1").split(",") if p.strip()])
    return 0


# A single address is not what a caller controls. A phone on IPv6 gets a /64
# from its carrier and picks its own interface identifier inside it, rotating
# it on a timer (RFC 8981 temporary addresses) or on demand. Keying the
# limiter on the full address therefore hands one subscriber 2^64 buckets:
# the quota is unenforceable, and worse, the LRU store that tracks at most
# 5 000 addresses is evicted out from under every legitimate caller by one
# client cycling through its own prefix.
#
# The prefix is the unit an operator actually assigns, so it is the unit the
# limiter counts. /64 for IPv6, which is the smallest allocation any carrier
# or ISP hands to a customer site and the smallest that cannot be picked by
# the customer. /32 for IPv4, i.e. the address itself: NAT already collapses
# a household or a marina onto one address, and grouping further would put a
# whole carrier behind one bucket.
IPV6_PREFIX_BITS = 64
IPV4_PREFIX_BITS = 32


def rate_limit_key(scope: Scope) -> str:
    """The network this caller counts against, as a stable string.

    ``"203.0.113.7/32"`` or ``"2001:db8:dead:beef::/64"``. An address the
    stdlib cannot parse is used verbatim: that covers ``"unknown"`` (no
    header, no transport address) and any malformed entry a client managed to
    place at the trusted position, and both must still be counted rather than
    waved through. Grouping every unparseable value into one bucket is the
    safe direction: it can throttle unfairly, never exempt.
    """
    raw = resolve_client_ip(scope)
    try:
        address = ipaddress.ip_address(raw)
    except ValueError:
        return raw
    bits = IPV4_PREFIX_BITS if address.version == 4 else IPV6_PREFIX_BITS
    return str(ipaddress.ip_network(f"{address}/{bits}", strict=False))


def bucket_id(scope: Scope) -> str:
    """Short, stable fingerprint of the rate-limit key for this caller.

    Exists to answer one operational question that cannot be settled from
    outside: does the platform's edge forward the real client address, or do
    all callers collapse into a single bucket? Two clients on different
    networks comparing this value settle it in one request each.

    Hashes the *key*, not the address, so what it reports is the bucket that
    actually exists: two devices sharing an IPv6 /64 do share a quota, and a
    fingerprint that said otherwise would send the next diagnosis down the
    wrong path.

    Only ever reports the caller's own bucket, and never the address itself.
    Unsalted on purpose: a salt would change on every process restart and
    would make two clients' readings incomparable, which is the whole point.
    """
    return hashlib.sha256(rate_limit_key(scope).encode()).hexdigest()[:8]


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


# Only the POST planners are on the strict bucket. They are the sole routes
# that can fan out into many upstream Open-Meteo calls (a sweep walks up to
# MAX_SWEEP_WINDOWS departures), which is what actually needs protecting —
# both for our own CPU and to stay a good citizen on a keyless public API.
# GET /archetypes is a constant and /mcp is left alone so a legitimate MCP
# session doing many tool calls is never throttled.
DEFAULT_LIMITED_PATHS = ("/api/v1/passage", "/api/v1/passage-by-eta")

# The tidal-atlas overlay gets its own, wider bucket rather than the blanket
# exemption it used to have. It reads local atlases so it never touches an
# upstream API, but it is not free either: the SHOM predictor runs a Python
# loop per requested instant (~1 ms each, measured 2026-09) on the event loop,
# so an unthrottled caller can hold the single worker hostage and stall MCP
# sessions along with it.
#
# It cannot share the 30/min bucket: the web app calls it once per corridor
# point, up to 60 per computation, so the planners' quota would reject a
# single legitimate plan. 120/min leaves room for two full computations a
# minute per IP while still bounding a scripted loop.
DEFAULT_MARC_LIMITED_PATHS = ("/api/v1/marine/marc",)

# 30 requests per 60s, not per 300s. The bucket key is an IP, so everyone
# behind one NAT shares it: a marina wifi, an office, a mobile carrier on
# CGNAT. We hit this for real during validation — three clients on one public
# IP exhausted a 5-minute budget and a legitimate first request was refused.
#
# Shortening the window keeps the same instantaneous ceiling while making an
# accidental block cost 60s instead of 300s. It is also the right shape for
# the actual threat: a human iterating on a route makes a handful of requests
# per minute, a scripted loop makes hundreds per second, and only the latter
# should ever see a 429.
#
# The web client posts a `forecast_cache`, so its requests are served without
# any Open-Meteo call. Being generous here costs us almost nothing upstream.
RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("OPENWIND_RATE_LIMIT_REQUESTS", "30"))
RATE_LIMIT_WINDOW_S = float(os.environ.get("OPENWIND_RATE_LIMIT_WINDOW_S", "60"))
RATE_LIMIT_MAX_IPS = int(os.environ.get("OPENWIND_RATE_LIMIT_MAX_IPS", "5000"))
# Same window and same tracked-IP ceiling as the strict bucket above; only
# the threshold differs.
MARC_RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("OPENWIND_MARC_RATE_LIMIT", "120"))


class RateLimitMiddleware:
    """Per-IP sliding-window limits, on two buckets with different thresholds.

    The strict bucket covers the POST planners (upstream fan-out); the wide
    one covers the tidal-atlas overlay, which is CPU-bound rather than
    upstream-bound and is called once per corridor point by the web app. The
    two never share a counter: a plan would otherwise spend the planners'
    whole quota on its overlay calls.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        limited_paths: Iterable[str] = DEFAULT_LIMITED_PATHS,
        max_requests: int = RATE_LIMIT_MAX_REQUESTS,
        marc_paths: Iterable[str] = DEFAULT_MARC_LIMITED_PATHS,
        marc_max_requests: int = MARC_RATE_LIMIT_MAX_REQUESTS,
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
        self._marc_limited = frozenset(marc_paths)
        # A second store, so the memory bound stated on _SlidingWindowCounter
        # becomes (max_requests + marc_max_requests) x max_tracked_ips
        # timestamps in the worst case. Reaching it would require thousands of
        # distinct IPs each saturating both buckets inside one window, which
        # is far beyond what this single worker can serve at all.
        self._marc_counter = _SlidingWindowCounter(
            max_requests=marc_max_requests,
            window_s=window_s,
            max_tracked_ips=max_tracked_ips,
        )

    def _counter_for(self, path: str) -> _SlidingWindowCounter | None:
        if path in self._limited:
            return self._counter
        if path in self._marc_limited:
            return self._marc_counter
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Preflight is never limited: an OPTIONS carries no body and no cost,
        # and 429-ing it would surface in the browser as an opaque CORS
        # failure rather than the real reason.
        counter = (
            self._counter_for(scope.get("path", ""))
            if scope["type"] == "http" and scope.get("method") != "OPTIONS"
            else None
        )
        if counter is None:
            await self.app(scope, receive, send)
            return

        retry_after = counter.check(rate_limit_key(scope))
        if retry_after is None:
            await self.app(scope, receive, send)
            return

        response = JSONResponse(
            # ``retry_after`` duplicates the Retry-After header on purpose: a
            # cross-origin fetch only sees CORS-safelisted headers, and the
            # copy in the body is what the web app can always read.
            {
                "error": "rate limit exceeded, retry shortly",
                "code": "rate_limited",
                "retry_after": retry_after,
            },
            status_code=429,
            headers={
                "Retry-After": str(retry_after),
                # Lets a support conversation distinguish "you share an IP with
                # a busy neighbour" from "everyone lands in one bucket".
                "X-RateLimit-Bucket": bucket_id(scope),
            },
        )
        await response(scope, receive, send)


# ------------------------------------------------------------- body ceiling

# 4 MiB. The web client's biggest legitimate POST measured 811 KB (61 corridor
# points x 168 h of forecast_cache), so this leaves a factor of five of head
# room while keeping the worst case an order of magnitude below the 65 MB
# payload the 2026-09 audit showed one caller could push through
# ``request.json()``: 768 ms of blocking JSON decode before a single
# validation ran, on a single-worker deployment.
#
# The per-payload ceilings in ``cache_backed.py`` (points, hours) are the
# domain-side guard and stay where the payload is parsed; this one is the
# transport-side guard and refuses the bytes before anything reads them.
MAX_BODY_BYTES = int(os.environ.get("OPENWIND_MAX_BODY_BYTES", str(4 * 1024 * 1024)))

# Scoped to the REST surface on purpose. ``/mcp`` is left untouched: its
# transport owns its own framing, and buffering a request body there would
# interfere with a streaming session for no benefit.
DEFAULT_BODY_LIMITED_PREFIX = "/api/v1"


def body_too_large_response(max_bytes: int) -> JSONResponse:
    """The one 413 body, wherever the ceiling is enforced.

    Shared with ``RequestDecompressionMiddleware`` below: a caller who blows
    the ceiling with 4 MiB of JSON and one who blows it with 40 KB of gzip
    that expands past it have hit the same rule, so they read the same
    sentence and branch on the same code.
    """
    megabytes = max_bytes / (1024 * 1024)
    rendered = f"{megabytes:.0f}" if megabytes >= 1 else f"{megabytes:.2f}"
    return JSONResponse(
        {"error": f"request body too large (max {rendered} MB)", "code": "body_too_large"},
        status_code=413,
    )


class BodySizeLimitMiddleware:
    """Refuse an over-sized request body on the REST routes with a 413.

    Two paths, because a client may or may not announce the size:

    - ``Content-Length`` present: the verdict is immediate and no byte of the
      body is read. The server it sits behind enforces the declared length, so
      the header cannot under-report the real payload.
    - ``Content-Length`` absent (chunked upload): the body is buffered here up
      to the ceiling and replayed to the app. Buffering costs nothing extra,
      since the handlers call ``request.json()`` and read the whole body
      anyway, and it is the only way to stop a chunked stream before the
      handler has committed to it.

    Placed inside the rate limiter so an over-sized request still counts
    against its quota: a caller hammering the endpoint with 4 MB bodies is
    exactly who the limiter is for.
    """

    _BODYLESS_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "DELETE"})

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_bytes: int = MAX_BODY_BYTES,
        prefix: str = DEFAULT_BODY_LIMITED_PREFIX,
    ) -> None:
        self.app = app
        self._max_bytes = max_bytes
        self._prefix = prefix

    def _too_large_response(self) -> JSONResponse:
        return body_too_large_response(self._max_bytes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope.get("method", "").upper() in self._BODYLESS_METHODS
            or not scope.get("path", "").startswith(self._prefix)
        ):
            await self.app(scope, receive, send)
            return

        declared = _content_length(scope)
        if declared is not None:
            if declared > self._max_bytes:
                await self._too_large_response()(scope, receive, send)
                return
            # Announced and within budget: nothing to buffer, the transport
            # will not deliver more bytes than it declared.
            await self.app(scope, receive, send)
            return

        buffered: list[Message] = []
        total = 0
        more = True
        while more:
            message = await receive()
            if message["type"] != "http.request":
                # A disconnect mid-upload: hand it straight to the app, which
                # already knows how to unwind.
                buffered.append(message)
                break
            total += len(message.get("body", b""))
            if total > self._max_bytes:
                await self._too_large_response()(scope, receive, send)
                return
            buffered.append(message)
            more = message.get("more_body", False)

        queued = iter(buffered)

        async def replay() -> Message:
            try:
                return next(queued)
            except StopIteration:
                return await receive()

        await self.app(scope, replay, send)


def _content_length(scope: Scope) -> int | None:
    """Declared body length, or None when absent or unparseable."""
    for name, value in scope.get("headers", ()):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


# ------------------------------------------------ compressed request bodies

# What a caller may say it compressed the body with. ``x-gzip`` is the
# pre-RFC-2616 spelling and still turns up in older HTTP libraries; it names
# the same format. Anything else, ``br`` and ``zstd`` included, is refused
# rather than guessed at: a body we cannot read is not a body we should hand
# a JSON parser.
GZIP_ENCODINGS = frozenset({"gzip", "x-gzip"})
DEFLATE_ENCODINGS = frozenset({"deflate"})
SUPPORTED_REQUEST_ENCODINGS = GZIP_ENCODINGS | DEFLATE_ENCODINGS

# ``identity`` is the explicit absence of compression, and so is a missing
# header. Both go straight through.
_NO_ENCODING = frozenset({"", "identity"})


class _DecompressionError(Exception):
    """Raised inside the read loop, turned into a response by the caller."""


class _BodyTooLargeError(_DecompressionError):
    pass


class _BodyNotDecodableError(_DecompressionError):
    pass


def unsupported_encoding_response() -> JSONResponse:
    """415 for a Content-Encoding we do not implement."""
    return JSONResponse(
        {"error": "unsupported content encoding", "code": "unsupported_encoding"},
        status_code=415,
        # RFC 9110 5.3.4: a 415 caused by the content coding may carry the
        # codings that would have worked, which is the only machine-readable
        # way to say "send it plain or send it gzipped".
        headers={"Accept-Encoding": "gzip, deflate, identity"},
    )


def invalid_body_encoding_response(encoding: str) -> JSONResponse:
    """422 for a body that claims an encoding it does not actually carry."""
    named = "gzip" if encoding in GZIP_ENCODINGS else encoding
    return JSONResponse(
        {"error": f"invalid {named} body", "code": "invalid_body_encoding"},
        status_code=422,
    )


def _deflate_window_bits(head: bytes) -> int:
    """zlib-wrapped or raw deflate, decided by the first two bytes.

    ``Content-Encoding: deflate`` is specified as the zlib format (RFC 1950)
    and is sent as a bare deflate stream (RFC 1951) by a long tail of clients
    that read the name literally. Both are unambiguous on the wire: a zlib
    header is a byte whose low nibble is 8 followed by a byte that makes the
    pair a multiple of 31, and no raw deflate block can start that way often
    enough to matter. Sniffing costs two bytes; refusing half the callers over
    a naming accident from 1996 costs more.
    """
    if len(head) >= 2:
        cmf, flg = head[0], head[1]
        if cmf & 0x0F == 8 and ((cmf << 8) | flg) % 31 == 0:
            return zlib.MAX_WBITS
    return -zlib.MAX_WBITS


class RequestDecompressionMiddleware:
    """Decompress a ``Content-Encoding: gzip`` request body, under the ceiling.

    The web client posts a ``forecast_cache`` that measured 48 KB in clear
    text and 1.5 KB gzipped, which is the difference between a plan that
    starts immediately on a marina 4G link and one that spends a second
    uploading. The responses have been compressed since PR 0.5; this is the
    other direction.

    Why this cannot simply be ``BodySizeLimitMiddleware`` with a decompressor
    bolted on: that middleware's whole job is to decide from
    ``Content-Length``, and the declared length of a compressed body says
    nothing about what it expands to. gzip's maximum ratio is about 1030:1, so
    a 4 MiB body the ceiling happily accepts can carry 4 GiB of zeroes. **The
    ceiling that matters here is on the decompressed bytes**, and it is
    enforced as they are produced: ``decompress(max_length=...)`` never
    materialises more than what is left of the budget, so a bomb is refused
    having allocated a few kilobytes, not a few gigabytes.

    Placed innermost, inside ``BodySizeLimitMiddleware``, which therefore
    still bounds the *compressed* bytes we agree to read at all, and inside
    the rate limiter, so a caller shovelling bombs still burns quota.

    ``/mcp`` never reaches here: the prefix is the REST surface, and the MCP
    transport owns its own framing.
    """

    _BODYLESS_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "DELETE"})

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_bytes: int = MAX_BODY_BYTES,
        prefix: str = DEFAULT_BODY_LIMITED_PREFIX,
    ) -> None:
        self.app = app
        self._max_bytes = max_bytes
        self._prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope.get("method", "").upper() in self._BODYLESS_METHODS
            or not scope.get("path", "").startswith(self._prefix)
        ):
            await self.app(scope, receive, send)
            return

        encoding = _content_encoding(scope)
        if encoding in _NO_ENCODING:
            await self.app(scope, receive, send)
            return

        # Recorded before the support check, so the access log can say what a
        # 415 was refused for without the header having to be logged.
        scope.setdefault("state", {})["request_encoding"] = encoding

        if encoding not in SUPPORTED_REQUEST_ENCODINGS:
            await unsupported_encoding_response()(scope, receive, send)
            return

        try:
            chunks, total = await self._read_decompressed(receive, encoding)
        except _BodyTooLargeError:
            await body_too_large_response(self._max_bytes)(scope, receive, send)
            return
        except _BodyNotDecodableError:
            await invalid_body_encoding_response(encoding)(scope, receive, send)
            return

        # The app downstream must see the body it is about to read: the
        # encoding is gone, and the length is the decompressed one. Leaving
        # the compressed Content-Length in place would misinform anything that
        # trusts it, starting with a future middleware of our own.
        scope["headers"] = [
            (name, value)
            for name, value in scope.get("headers", ())
            if name not in (b"content-encoding", b"content-length")
        ] + [(b"content-length", str(total).encode("latin-1"))]

        queued = list(chunks) or [b""]

        async def replay() -> Message:
            if queued:
                body = queued.pop(0)
                return {"type": "http.request", "body": body, "more_body": bool(queued)}
            return await receive()

        await self.app(scope, replay, send)

    async def _read_decompressed(self, receive: Receive, encoding: str) -> tuple[list[bytes], int]:
        """Drain the compressed stream into decompressed chunks, or refuse.

        Never holds more than ``max_bytes`` of output, and never asks zlib for
        more than the budget still allows in a single call.
        """
        decompressor: zlib._Decompress | None = None
        chunks: list[bytes] = []
        total = 0
        more = True
        while more:
            message = await receive()
            if message["type"] != "http.request":
                # A disconnect mid-upload. Stop reading; the eof check below
                # will call the truncated body what it is, and the response
                # goes nowhere because the client has gone.
                break
            data = message.get("body", b"")
            more = message.get("more_body", False)
            if not data:
                continue
            if decompressor is None:
                window = (
                    zlib.MAX_WBITS | 16
                    if encoding in GZIP_ENCODINGS
                    else _deflate_window_bits(data)
                )
                decompressor = zlib.decompressobj(window)
            while data:
                budget = self._max_bytes - total
                try:
                    # ``max_length=budget + 1`` is the bomb guard: one byte
                    # over the ceiling is all that is ever allocated, and it
                    # is enough to know the body is over it.
                    produced = decompressor.decompress(data, max_length=budget + 1)
                except zlib.error as exc:
                    raise _BodyNotDecodableError(str(exc)) from exc
                total += len(produced)
                if total > self._max_bytes:
                    raise _BodyTooLargeError()
                if produced:
                    chunks.append(produced)
                # Non-empty only when ``max_length`` cut the call short, so
                # the budget strictly shrinks each time round and this ends.
                data = decompressor.unconsumed_tail

        if decompressor is None:
            # ``Content-Encoding: gzip`` and nothing to decode: an empty
            # stream is not a valid member of either format.
            raise _BodyNotDecodableError("empty body")
        if not decompressor.eof:
            # zlib does not raise on a stream that simply stops early, so a
            # truncated upload would otherwise reach the handler as a
            # half-parsed body and be reported as invalid JSON.
            raise _BodyNotDecodableError("truncated stream")
        if decompressor.unused_data:
            # Bytes after the end of the stream. Concatenated gzip members are
            # legal in the format and are not something any client of this API
            # produces; silently dropping them would truncate the body.
            raise _BodyNotDecodableError("trailing data after the compressed stream")
        return chunks, total


def _content_encoding(scope: Scope) -> str:
    """Declared body encoding, lowercased and trimmed, ``""`` when absent.

    A list of codings (``gzip, gzip``) is refused rather than unwrapped: it
    does not occur outside a test suite, and layered decompression is a second
    place for a bomb to hide.
    """
    for name, value in scope.get("headers", ()):
        if name == b"content-encoding":
            return value.decode("latin-1").strip().lower()
    return ""


# ---------------------------------------------------------- security headers


class SecurityHeadersMiddleware:
    """Add the baseline response headers to every route.

    Framing is restricted with CSP ``frame-ancestors`` rather than
    ``X-Frame-Options``, and it is NOT a blanket deny. A Hugging Face Space
    page (``huggingface.co/spaces/<owner>/<name>``) renders the Space inside
    an iframe pointing at ``<slug>.hf.space``: that *is* the Space UI. A
    ``DENY`` shipped here blanks the project's own landing page on the HF
    catalogue, which is exactly what happened on 2026-08-01.

    ``X-Frame-Options`` is deliberately absent. It cannot express an
    allowlist (``ALLOW-FROM`` is dead), and while the CSP spec says
    ``frame-ancestors`` supersedes it, sending both invites a browser that
    honours the stricter one to break the page again. One header, one source
    of truth.

    The MCP Apps widget is unaffected either way: it travels as an MCP
    resource (``text/html;profile=mcp-app``) that the host inlines into its
    own sandboxed iframe, never fetched from this origin.
    """

    # Overridable so a non-HF deployment can tighten this back to 'none'.
    FRAME_ANCESTORS = os.environ.get(
        "OPENWIND_FRAME_ANCESTORS", "'self' https://huggingface.co https://*.hf.space"
    )

    HEADERS = (
        (b"x-content-type-options", b"nosniff"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
        (
            b"content-security-policy",
            f"frame-ancestors {FRAME_ANCESTORS}".encode("latin-1"),
        ),
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
