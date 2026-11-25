# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The archive of land tiles, and the route repair on the world lattice."""

from __future__ import annotations

from itertools import pairwise
from pathlib import Path

import numpy as np
import pytest

from openwind_data.routing.auto_route import land_tiles as lt
from openwind_data.routing.auto_route.repair import (
    FineLand,
    RepairParams,
    _World,
    leg_crosses_land,
    repair_route,
)
from openwind_data.routing.geometry import Point

# Two tiles side by side off Brittany, and what the test draws in them.
TX, TY = 249, 334


def _archive(tmp_path: Path, masks: dict[tuple[int, int], np.ndarray], coverage) -> Path:
    states = np.zeros((lt.TILES, lt.TILES), dtype=np.uint8)
    payloads = []
    for (tx, ty), mask in sorted(masks.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        if mask.all():
            states[ty, tx] = lt.LAND
        elif mask.any():
            states[ty, tx] = lt.MIXED
            payloads.append(lt.encode_tile(mask))
    path = tmp_path / "test.owlt"
    lt.write_archive(path, states, payloads, coverage, {"built": "test"})
    return path


def _island(tmp_path: Path) -> tuple[lt.LandTiles, np.ndarray]:
    """Sea, with an island 200 pixels by 300 in the middle of the west tile
    and the whole east tile ashore."""
    west = np.zeros((lt.TILE_PX, lt.TILE_PX), dtype=bool)
    west[500:700, 400:700] = True
    east = np.ones((lt.TILE_PX, lt.TILE_PX), dtype=bool)
    path = _archive(tmp_path, {(TX, TY): west, (TX + 1, TY): east}, (TX, TY, TX + 2, TY + 1))
    return lt.LandTiles(path), west


def _at(row: float, col: float) -> Point:
    return Point(lt.lat_of(TY * lt.TILE_PX + row), lt.lon_of(TX * lt.TILE_PX + col))


def test_the_lattice_is_square_on_the_ground_and_turns_back_on_itself():
    assert lt.WORLD_PX == 655_360
    assert lt.pixel_m(0.0) == pytest.approx(61.08, abs=0.01)
    assert lt.pixel_m(46.0) == pytest.approx(42.43, abs=0.01)
    for lat, lon in ((48.3829, -4.495), (-33.85, 151.22), (0.0, 0.0), (70.0, -179.9)):
        assert lt.lat_of(lt.row_of(lat)) == pytest.approx(lat, abs=1e-10)
        assert lt.lon_of(lt.col_of(lon)) == pytest.approx(lon, abs=1e-10)
    # Row 0 is the south edge, column 0 the antimeridian.
    assert lt.row_of(-lt.MAX_LAT) == pytest.approx(0.0, abs=1e-6)
    assert lt.col_of(-180.0) == 0.0


def test_an_archive_gives_back_the_mask_it_was_written_from(tmp_path):
    tiles, west = _island(tmp_path)
    assert tiles.coverage == (TX, TY, TX + 2, TY + 1)
    assert tiles.states[TY, TX] == lt.MIXED and tiles.states[TY, TX + 1] == lt.LAND
    r0, c0 = TY * lt.TILE_PX, TX * lt.TILE_PX
    # A window across the seam of the two tiles, and the same pixels one by one.
    win = tiles.window(r0 + 450, r0 + 750, c0 + 350, c0 + lt.TILE_PX + 20)
    assert np.array_equal(win[:, : lt.TILE_PX - 350], west[450:750, 350:])
    assert win[:, lt.TILE_PX - 350 :].all()
    rows, cols = np.mgrid[r0 + 450 : r0 + 750, c0 + 350 : c0 + lt.TILE_PX + 20]
    assert np.array_equal(tiles.land_at(rows, cols), win)
    # North and south of the lattice is land; a tile never written is sea.
    assert tiles.land_at(np.array([-1, lt.WORLD_PX]), np.array([c0, c0])).all()
    assert not tiles.land_at(np.array([r0]), np.array([c0 - 5])).any()


def test_the_index_is_the_head_of_the_file_and_a_tile_its_stored_bytes(tmp_path):
    tiles, west = _island(tmp_path)
    raw = tiles.path.read_bytes()
    assert raw.startswith(tiles.index()) and tiles.index().startswith(lt.MAGIC)
    payload = tiles.payload(TX, TY)
    assert payload is not None and payload in raw
    assert np.array_equal(np.unpackbits(lt.decode_tile(payload), axis=1).astype(bool), west)
    # All land, all sea, outside the lattice: nothing to hand over.
    assert tiles.payload(TX + 1, TY) is None
    assert tiles.payload(TX, TY + 1) is None
    assert tiles.payload(-1, TY) is None


def test_two_archives_of_the_same_tiles_share_an_id(tmp_path):
    a, _ = _island(tmp_path)
    (tmp_path / "again").mkdir()
    b, _ = _island(tmp_path / "again")
    assert a.id == b.id and len(a.id) == 12
    other = np.zeros((lt.TILE_PX, lt.TILE_PX), dtype=bool)
    other[0, 0] = True
    (tmp_path / "other").mkdir()
    c = lt.LandTiles(_archive(tmp_path / "other", {(TX, TY): other}, (TX, TY, TX + 1, TY + 1)))
    assert c.id != a.id


def test_another_lattice_is_refused(tmp_path):
    tiles, _ = _island(tmp_path)
    raw = tiles.path.read_bytes().replace(b'"tile_px": 1280', b'"tile_px": 1024')
    bad = tmp_path / "bad.owlt"
    bad.write_bytes(raw)
    with pytest.raises(ValueError, match="another lattice"):
        lt.LandTiles(bad)
    (tmp_path / "not.owlt").write_bytes(b"something else")
    with pytest.raises(ValueError, match="not a land tile archive"):
        lt.LandTiles(tmp_path / "not.owlt")


def test_a_leg_across_the_island_is_retraced_round_it(tmp_path):
    tiles, _ = _island(tmp_path)
    fine = FineLand(world=_World(tiles))
    a, b = _at(600.3, 200.7), _at(610.2, 900.4)
    rep = repair_route(fine, [a, b])
    assert rep is not None and rep.refusal is None
    assert [n.code for n in rep.notices] == ["route.leg_retraced"]
    assert rep.points[0] == a and rep.points[-1] == b and len(rep.points) > 2
    assert not any(leg_crosses_land(fine.world, p, q) for p, q in pairwise(rep.points))
    # Sent back, the repaired route is at sea and comes back unchanged.
    again = repair_route(fine, rep.points)
    assert again is not None and again.points == rep.points and not again.changes


def test_a_window_too_large_is_coarsened_and_still_goes_round(tmp_path):
    tiles, _ = _island(tmp_path)
    fine = FineLand(world=_World(tiles))
    a, b = _at(600.3, 200.7), _at(610.2, 900.4)
    grid = fine.world.crop([a, b], 12000.0, max_px=20_000)
    # Aligned on the lattice, which may cost a row and a column of cells.
    assert grid.factor > 1 and (grid.shape[0] - 1) * (grid.shape[1] - 1) <= 20_000
    # Land as soon as one pixel of the cell is.
    assert grid.row0 % grid.factor == 0 and grid.col0 % grid.factor == 0
    fine_grid = fine.world.crop([a, b], 12000.0)
    assert grid.land.mean() >= fine_grid.land.mean()
    rep = repair_route(fine, [a, b], RepairParams(max_px=20_000))
    assert rep is not None and rep.refusal is None
    assert not any(leg_crosses_land(fine.world, p, q) for p, q in pairwise(rep.points))


def test_a_route_outside_the_archive_or_across_the_antimeridian_is_left_alone(tmp_path):
    tiles, _ = _island(tmp_path)
    fine = FineLand(world=_World(tiles))
    inside = _at(600.0, 200.0)
    assert fine.region_for([inside, _at(100.0, 100.0)]) is fine.world
    assert fine.region_for([inside, Point(inside.lat, inside.lon - 5.0)]) is None
    assert repair_route(fine, [inside, Point(inside.lat + 3.0, inside.lon)]) is None
    whole = FineLand(world=_World(tiles))
    object.__setattr__(tiles, "coverage", (0, 0, lt.TILES, lt.TILES))
    assert whole.region_for([Point(-16.80, 179.90), Point(-16.75, 179.95)]) is whole.world
    assert whole.region_for([Point(-16.80, 179.90), Point(-16.75, -179.80)]) is None


def test_a_directory_with_two_archives_reads_the_one_that_covers_most(tmp_path):
    small, west = _island(tmp_path)
    big_dir = tmp_path / "big"
    big_dir.mkdir()
    big = _archive(big_dir, {(TX, TY): west}, (TX - 3, TY - 3, TX + 3, TY + 3))
    big.rename(tmp_path / "world.owlt")
    fine = FineLand.from_directory(tmp_path)
    assert fine.world is not None and fine.world.tiles.coverage == (TX - 3, TY - 3, TX + 3, TY + 3)
    assert small.coverage == (TX, TY, TX + 2, TY + 1)
