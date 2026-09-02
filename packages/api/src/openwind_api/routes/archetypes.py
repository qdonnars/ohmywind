# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The boat table, and how the caller sees itself."""

from __future__ import annotations

from openwind_data.routing.archetypes import list_archetypes_metadata
from starlette.requests import Request
from starlette.responses import JSONResponse

from openwind_api.security import (
    TRUSTED_PROXY_HOPS,
    bucket_id,
    came_through_edge,
    forwarded_hop_count,
    trusted_hops_for,
)

# The archetype table is compiled into the image: it only ever changes when a
# new build ships, and a build restarts the deployment. A day of edge and
# browser caching removes one request from every /plan mount (the web app
# re-fetches it on each mount) at no freshness cost.
ARCHETYPES_CACHE_CONTROL = "public, max-age=86400"


async def api_archetypes(_request: Request) -> JSONResponse:
    return JSONResponse(
        list_archetypes_metadata(),
        headers={"Cache-Control": ARCHETYPES_CACHE_CONTROL},
    )


async def api_client_debug(request: Request) -> JSONResponse:
    """Report how this deployment sees the caller, for rate-limit diagnosis.

    The rate limiter keys on the client address taken from the last
    ``X-Forwarded-For`` hop. Whether that address is the real caller or a
    fixed proxy address is a property of the hosting platform, and it cannot
    be observed from outside: a single-bucket-for-everyone bug looks exactly
    like "you share a NAT with someone busy". Two callers on different
    networks comparing ``bucket`` here tell the two apart in one request each.

    ``forwarded_hops == 0`` is the alarm: the platform strips the header, the
    fallback address is an internal proxy, and every caller shares one bucket.
    Returns no address, only a fingerprint of the caller's own.
    """
    return JSONResponse(
        {
            "bucket": bucket_id(request.scope),
            "forwarded_hops": forwarded_hop_count(request.scope),
            # What the deployment is configured for, versus what this request
            # actually earned. They diverge when the caller reached the app
            # directly instead of through the edge proxy, which is exactly the
            # case that must not get the longer hop count.
            "trusted_hops": TRUSTED_PROXY_HOPS,
            "hops_applied": trusted_hops_for(request.scope),
            "via_edge": came_through_edge(request.scope),
        },
        headers={"Cache-Control": "no-store"},
    )
