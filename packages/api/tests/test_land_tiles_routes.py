# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The land tiles handed to a client that repairs routes by itself."""

from __future__ import annotations

import zlib

import numpy as np
import pytest
from openwind_data.routing.auto_route import land_tiles as lt
from openwind_data.routing.auto_route.repair import BUNDLED_GRIDS_DIR
from starlette.testclient import TestClient

from openwind_api.app import create_app
from openwind_api.settings import Settings

# The tile that holds Ouessant, mixed in the archive shipped with the package.
OUESSANT_TILE = (248, 335)


@pytest.fixture(scope="module")
def client():
    # The default deployment: the server repairs nothing, and serves the tiles.
    assert Settings().route_repair == "off"
    return TestClient(create_app(Settings()))


@pytest.fixture(scope="module")
def shipped() -> lt.LandTiles:
    return lt.LandTiles(next(BUNDLED_GRIDS_DIR.glob("*.owlt")))


def test_the_index_is_the_head_of_the_archive(client, shipped) -> None:
    resp = client.get("/api/v1/land-tiles/index")
    assert resp.status_code == 200
    assert resp.content == shipped.index()
    assert resp.headers["content-type"] == "application/octet-stream"
    assert resp.headers["cache-control"] == "public, max-age=3600"
    assert resp.content.startswith(lt.MAGIC)


def test_a_mixed_tile_comes_as_stored_and_is_cached_for_good(client, shipped) -> None:
    tx, ty = OUESSANT_TILE
    resp = client.get(f"/api/v1/land-tiles/{shipped.id}/{tx}/{ty}")
    assert resp.status_code == 200
    assert resp.content == shipped.payload(tx, ty)
    assert resp.headers["cache-control"] == "public, max-age=31536000, immutable"
    # What a client reads from it: the packed bitmap of the tile.
    packed = np.frombuffer(zlib.decompress(resp.content), dtype=np.uint8)
    assert packed.size == lt.TILE_PX * lt.TILE_PX // 8
    assert 0 < np.unpackbits(packed).mean() < 1


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/land-tiles/000000000000/248/335",  # another archive's id
        "/api/v1/land-tiles/{id}/100/335",  # all sea: the index says so
        "/api/v1/land-tiles/{id}/9999/335",  # outside the lattice
    ],
)
def test_what_is_not_a_mixed_tile_of_this_archive_is_not_found(client, shipped, path) -> None:
    resp = client.get(path.format(id=shipped.id))
    assert resp.status_code == 404
    assert resp.headers["cache-control"] == "no-store"


def test_a_server_that_repairs_serves_the_same_tiles(shipped) -> None:
    app = create_app(Settings(route_repair="compute"))
    try:
        resp = TestClient(app).get("/api/v1/land-tiles/index")
        assert resp.status_code == 200
        assert resp.content == shipped.index()
    finally:
        app.state.services.repair.close()


def test_a_directory_without_an_archive_serves_no_tiles(tmp_path) -> None:
    empty = TestClient(create_app(Settings(route_grids_dir=str(tmp_path))))
    assert empty.get("/api/v1/land-tiles/index").status_code == 404
    assert empty.get("/api/v1/land-tiles/abc/248/335").status_code == 404


def test_the_tiles_are_readable_from_another_origin(client) -> None:
    resp = client.get("/api/v1/land-tiles/index", headers={"Origin": "https://ohmywind.fr"})
    assert resp.headers["access-control-allow-origin"] == "*"
