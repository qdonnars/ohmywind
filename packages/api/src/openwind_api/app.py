# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Assemble the REST app, with or without an MCP server mounted behind it.

``create_app(settings)`` returns a complete, serving application: landing
page, the whole ``/api/v1`` surface, the middleware stack. ``mcp_app`` is
optional and, when given, is mounted at ``/`` under everything else. That
optionality is the point of this package: the MCP surface can be frozen,
replaced or removed without touching the API, and the API can be redeployed
anywhere without carrying the MCP SDK.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.routing import BaseRoute, Mount, Route
from starlette.types import ASGIApp, Receive, Scope, Send

from openwind_api.access import AccessLogMiddleware
from openwind_api.routes.archetypes import api_archetypes, api_client_debug
from openwind_api.routes.landing import ICON_REDIRECTS, icon_redirect, index, static_asset_route
from openwind_api.routes.marine import api_marc_batch, api_marc_coverage, api_marc_overlay
from openwind_api.routes.passage import api_passage, api_passage_by_eta
from openwind_api.security import (
    ALLOWED_ORIGINS,
    BodySizeLimitMiddleware,
    RateLimitMiddleware,
    RequestDecompressionMiddleware,
    SecurityHeadersMiddleware,
)
from openwind_api.services import Services
from openwind_api.settings import Settings

_logger = logging.getLogger(__name__)


class PathScopedGZipMiddleware:
    """Compress the REST responses, and only those.

    ``/mcp`` is a streaming transport: FastMCP answers with a long-lived SSE
    body, and a blanket GZipMiddleware would either buffer it or stamp a
    ``Content-Encoding`` on a stream clients read incrementally. Rather than
    reason about which of the two happens in the current SDK version, the
    compressor never sees that path at all.

    Everything under ``/api/v1`` is JSON that compresses 5 to 10x (a sweep
    response reaches several MB in clear text, and the overlay endpoint was
    measured at 8.4 KB uncompressed per corridor point), which is the whole
    point of the exercise for a mobile client on a marina 4G link.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        prefix: str = "/api/v1",
        minimum_size: int = 1024,
    ) -> None:
        self.app = app
        self._prefix = prefix
        self._gzip = GZipMiddleware(app, minimum_size=minimum_size)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path", "").startswith(self._prefix):
            await self._gzip(scope, receive, send)
            return
        await self.app(scope, receive, send)


def _lifespan(services: Services, mcp_app: ASGIApp | None):
    """Warm the atlas coverage, run the mounted app's lifespan, close the pool.

    FastMCP's session manager is started and stopped by the inner app's
    lifespan, and a parent Starlette does NOT propagate a child's: without
    handing it through here the MCP endpoint answers 500 because the
    streamable-http session manager never initialised. With no ``mcp_app``
    there is nothing to hand through, and the warm-up runs alone.

    The shared HTTP client is closed last. It outlives every request by
    design, so no request is in a position to close it, and a process that
    exits without doing so leaves sockets open in the container.
    """

    @contextlib.asynccontextmanager
    async def lifespan(app: Starlette) -> AsyncIterator[None]:
        warm = asyncio.create_task(services.warm_atlas_coverage())
        try:
            if mcp_app is None:
                yield
            else:
                async with mcp_app.router.lifespan_context(app):  # type: ignore[attr-defined]
                    yield
        finally:
            warm.cancel()
            # The thread it may be sitting in cannot be interrupted, but
            # awaiting the cancellation keeps shutdown free of "task was
            # destroyed but it is pending".
            with contextlib.suppress(asyncio.CancelledError):
                await warm
            await services.aclose()

    return lifespan


def create_app(
    settings: Settings,
    mcp_app: ASGIApp | None = None,
    *,
    services: Services | None = None,
) -> Starlette:
    """Build the REST application.

    Args:
        settings: where the atlases and the landing media live.
        mcp_app: an ASGI app to mount at ``/``, or ``None``. Mounted last so
            the exact-match routes above are tried first: MCP traffic on
            ``/mcp`` is unaffected either way.
        services: already-built process-wide objects, or ``None`` to build
            them here. A deployment that also runs an MCP server needs them
            *before* this call, because the same marine adapter has to reach
            ``build_server()`` for the two shells to share one cache, one
            connection pool and one set of atlases. Everyone else leaves it
            out.

    The application keeps its ``Services`` on ``app.state.services``, which is
    how a handler reaches the atlases and the adapter, and how a test replaces
    them.
    """
    if services is None:
        services = Services.from_settings(settings)

    # ``list[BaseRoute]`` and not the inferred ``list[Route]``: the MCP app
    # below is a ``Mount``, and Starlette takes both as ``BaseRoute``.
    routes: list[BaseRoute] = [
        Route("/", index),
        *[Route(path, icon_redirect, methods=["GET"]) for path in ICON_REDIRECTS],
        Route("/static/{asset}", static_asset_route(settings.static_dir), methods=["GET"]),
        Route("/api/v1/archetypes", api_archetypes, methods=["GET"]),
        Route("/api/v1/_client", api_client_debug, methods=["GET"]),
        Route("/api/v1/passage", api_passage, methods=["POST"]),
        Route("/api/v1/passage-by-eta", api_passage_by_eta, methods=["POST"]),
        Route("/api/v1/marine/marc", api_marc_overlay, methods=["GET"]),
        Route("/api/v1/marine/marc/batch", api_marc_batch, methods=["POST"]),
        Route("/api/v1/marine/marc/coverage", api_marc_coverage, methods=["GET"]),
    ]
    if mcp_app is not None:
        routes.append(Mount("/", app=mcp_app))

    app = Starlette(
        routes=routes,
        # Order matters: the first entry is the outermost wrapper. CORS sits
        # outside the limiter so a 429 still carries the Access-Control-Allow-*
        # headers, otherwise the browser reports an opaque CORS failure and
        # the real cause never reaches the user.
        middleware=[
            # Outermost, so the line it logs carries the status the client
            # really got (a 429 never reaches a handler) and the byte count
            # that really left (compression happens inside it).
            Middleware(AccessLogMiddleware),
            Middleware(
                CORSMiddleware,
                allow_origins=ALLOWED_ORIGINS,
                allow_methods=["GET", "POST", "OPTIONS"],
                allow_headers=["Content-Type"],
                # Retry-After is set on our 429s, but a cross-origin fetch only
                # sees the CORS-safelisted response headers unless the server
                # opts the rest in here. Without this the web app cannot tell
                # the user how long to wait and has to guess, which is how the
                # copy ended up hard-coding "une minute" for a 5-minute window.
                # X-Request-Id joins it for the same reason: the web app
                # cannot quote an identifier in a bug report if the browser
                # will not let it read one.
                expose_headers=["Retry-After", "X-Request-Id"],
            ),
            # Compression sits inside CORS (so the negotiated headers are
            # never rewritten by the compressor) and outside everything that
            # can answer on its own, so a 429 or a 413 is compressed on the
            # same terms as a 200.
            Middleware(PathScopedGZipMiddleware),
            Middleware(SecurityHeadersMiddleware),
            Middleware(RateLimitMiddleware),
            # An over-sized body is refused after it has been counted
            # against the caller's quota, never before.
            Middleware(BodySizeLimitMiddleware),
            # Innermost, so it sees the bytes the ceiling above already
            # accepted and applies the same ceiling again to what they expand
            # to. The order is load-bearing: a compressed body's declared
            # length says nothing about its decompressed size, so the outer
            # check alone would let a 40 KB request become 4 GB of JSON.
            Middleware(RequestDecompressionMiddleware),
        ],
        lifespan=_lifespan(services, mcp_app),
    )
    app.state.services = services
    app.state.settings = settings
    return app
