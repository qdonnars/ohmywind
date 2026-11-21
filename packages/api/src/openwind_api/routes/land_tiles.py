# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The shoreline the route repair reads, served to a client that repairs by itself.

The web app retraces a route that crosses land in the browser, with the
same search as the server and on the same shoreline: the archive of land
tiles this deployment reads (``openwind_data.routing.auto_route.land_tiles``).
Two routes hand it over as stored, bytes for bytes:

- ``/api/v1/land-tiles/index``: the archive's header and the state of every
  tile (sea, land or mixed), a few kilobytes;
- ``/api/v1/land-tiles/{id}/{tx}/{ty}``: one mixed tile, a few kilobytes of
  zlib. ``id`` is the archive's, from the index: a tile never changes under
  an id, so it is cached for good, and a client holding the index of an
  archive since replaced gets a 404 and reads the index again.

Serving the tiles from here rather than from a file host is what keeps the
browser and the server on the same shoreline: a deployment cannot ship one
and compute on another.
"""

from __future__ import annotations

import asyncio

from openwind_data.routing.auto_route.land_tiles import LandTiles
from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response

INDEX_CACHE_CONTROL = "public, max-age=3600"
TILE_CACHE_CONTROL = "public, max-age=31536000, immutable"


async def _tiles(request: Request) -> LandTiles | None:
    pool = getattr(request.app.state.services, "repair", None)
    if pool is None:
        return None
    # Read on first use, off the event loop, as the pool itself does.
    fine = await asyncio.to_thread(lambda: pool.fine)
    return fine.world.tiles if fine.world is not None else None


def _not_found() -> PlainTextResponse:
    return PlainTextResponse("Not found", status_code=404, headers={"Cache-Control": "no-store"})


async def api_land_tiles_index(request: Request) -> Response:
    """``GET /api/v1/land-tiles/index``: the archive's index, 404 without an archive."""
    tiles = await _tiles(request)
    if tiles is None:
        return _not_found()
    body = await asyncio.to_thread(tiles.index)
    return Response(
        body,
        media_type="application/octet-stream",
        headers={"Cache-Control": INDEX_CACHE_CONTROL},
    )


async def api_land_tile(request: Request) -> Response:
    """``GET /api/v1/land-tiles/{id}/{tx}/{ty}``: one mixed tile as stored.

    404 for another archive's id, and for a tile that is all sea or all land:
    the index says which tiles to ask for.
    """
    tiles = await _tiles(request)
    if tiles is None or request.path_params["archive"] != tiles.id:
        return _not_found()
    payload = await asyncio.to_thread(
        tiles.payload, request.path_params["tx"], request.path_params["ty"]
    )
    if payload is None:
        return _not_found()
    return Response(
        payload,
        media_type="application/octet-stream",
        headers={"Cache-Control": TILE_CACHE_CONTROL},
    )
