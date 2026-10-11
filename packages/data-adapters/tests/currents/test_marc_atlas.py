# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tests for the MARC atlas runtime loader.

The fixture is a minimal in-memory atlas with one cell, M2-only constants.
This isolates the loader logic from the actual build pipeline (which is
covered by ``scripts/build_marc_atlas.py``'s own validation).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest

from openwind_data.currents.harmonic import predict as schureman_predict
from openwind_data.currents.marc_atlas import MarcAtlasRegistry


@pytest.fixture
def fixture_atlas(tmp_path: Path) -> Path:
    """Build a tiny single-cell FINIS-like atlas at (48.35, -4.80).

    M2-only height + U/V constants. The coverage polygon is a 1° square
    around the cell, so all queries inside are covered.
    """
    atlas_dir = tmp_path / "FINIS"
    atlas_dir.mkdir()
    (atlas_dir / "metadata.json").write_text(
        json.dumps(
            {
                "atlas": "FINIS",
                "rank": 2,
                "resolution_m": 250,
                "constituents_h": ["M2"],
                "constituents_u": ["M2"],
                "constituents_v": ["M2"],
                "schema_version": 2,
            }
        )
    )
    (atlas_dir / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"atlas": "FINIS"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [-5.5, 47.5],
                                    [-4.5, 47.5],
                                    [-4.5, 49.0],
                                    [-5.5, 49.0],
                                    [-5.5, 47.5],
                                ]
                            ],
                        },
                    }
                ],
            }
        )
    )
    tile_dir = atlas_dir / "tile_lat=48.0" / "tile_lon=-5.0"
    tile_dir.mkdir(parents=True)
    df = pl.DataFrame(
        {
            "lat": [48.35],
            "lon": [-4.80],
            "z0_hydro_m": [-3.85],
            "M2_h_amp": [2.05],
            "M2_h_g": [108.0],
            "M2_u_amp": [0.5],  # m/s
            "M2_u_g": [80.0],
            "M2_v_amp": [0.3],
            "M2_v_g": [120.0],
        }
    )
    df.write_parquet(tile_dir / "data.parquet", compression="zstd")
    return tmp_path


def test_registry_discovers_atlas(fixture_atlas: Path) -> None:
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    assert len(reg.atlases) == 1
    a = reg.atlases[0]
    assert a.name == "FINIS"
    assert a.rank == 2
    assert a.resolution_m == 250


def test_covers_near_cell(fixture_atlas: Path) -> None:
    """Query close to the (48.35, -4.80) cell (within ~1km) hits FINIS."""
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    inside = reg.covers(48.355, -4.795)
    assert inside is not None
    assert inside.name == "FINIS"


def test_covers_outside_bbox_returns_none(fixture_atlas: Path) -> None:
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    # well outside the 1° square
    assert reg.covers(43.0, 5.0) is None


def test_cell_at_pulls_constants(fixture_atlas: Path) -> None:
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    cell = reg.cell_at(48.35, -4.80)
    assert cell is not None
    assert cell.atlas_name == "FINIS"
    assert cell.lat == pytest.approx(48.35)
    assert cell.lon == pytest.approx(-4.80)
    assert cell.z0_hydro_m == pytest.approx(-3.85)
    assert cell.h_constants == {"M2": (2.05, 108.0)}
    assert cell.u_constants == {"M2": (0.5, 80.0)}
    assert cell.v_constants == {"M2": (0.3, 120.0)}


def test_predict_height_matches_direct_call(fixture_atlas: Path) -> None:
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    t = datetime(2024, 6, 15, 12, 0, 0, tzinfo=UTC)
    result = reg.predict_height(48.35, -4.80, t)
    assert result is not None
    h, atlas_name = result
    assert atlas_name == "FINIS"
    expected = float(schureman_predict([t], {"M2": (2.05, 108.0)})[0])
    assert h == pytest.approx(expected, abs=1e-9)


def test_predict_current_returns_speed_and_direction(fixture_atlas: Path) -> None:
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    t = datetime(2024, 6, 15, 12, 0, 0, tzinfo=UTC)
    result = reg.predict_current(48.35, -4.80, t)
    assert result is not None
    speed_kn, direction_to_deg, atlas_name = result
    assert atlas_name == "FINIS"
    assert speed_kn >= 0
    assert 0 <= direction_to_deg < 360


def test_predict_height_outside_returns_none(fixture_atlas: Path) -> None:
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    t = datetime(2024, 6, 15, 12, tzinfo=UTC)
    assert reg.predict_height(43.0, 5.0, t) is None


def test_predict_height_series(fixture_atlas: Path) -> None:
    """Series prediction should match per-time predict_height calls."""
    import numpy as np

    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    times = [datetime(2024, 6, 15, h, tzinfo=UTC) for h in range(0, 24, 3)]
    result = reg.predict_height_series(48.35, -4.80, times)
    assert result is not None
    series, _ = result
    individual = np.array([reg.predict_height(48.35, -4.80, t)[0] for t in times])
    assert np.allclose(series, individual, atol=1e-9)


def test_finer_atlas_wins_when_overlap(tmp_path: Path) -> None:
    """If both rank 1 and rank 2 cover the point, rank 2 (250 m) wins."""
    # Reuse the fixture builder for two atlases at the same bbox.
    for name, rank, res in [("MANGA", 1, 700), ("FINIS", 2, 250)]:
        d = tmp_path / name
        d.mkdir()
        (d / "metadata.json").write_text(
            json.dumps(
                {
                    "atlas": name,
                    "rank": rank,
                    "resolution_m": res,
                    "constituents_h": ["M2"],
                    "constituents_u": [],
                    "constituents_v": [],
                    "schema_version": 2,
                }
            )
        )
        (d / "coverage.geojson").write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "properties": {"atlas": name},
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [
                                    [
                                        [-5.5, 47.5],
                                        [-4.5, 47.5],
                                        [-4.5, 49.0],
                                        [-5.5, 49.0],
                                        [-5.5, 47.5],
                                    ]
                                ],
                            },
                        }
                    ],
                }
            )
        )
        td = d / "tile_lat=48.0" / "tile_lon=-5.0"
        td.mkdir(parents=True)
        pl.DataFrame(
            {
                "lat": [48.35],
                "lon": [-4.80],
                "z0_hydro_m": [0.0],
                "M2_h_amp": [1.0],
                "M2_h_g": [0.0],
            }
        ).write_parquet(td / "data.parquet")

    reg = MarcAtlasRegistry.from_directory(tmp_path)
    chosen = reg.covers(48.35, -4.80)
    assert chosen is not None
    assert chosen.name == "FINIS"
    assert chosen.rank == 2


# ------------------------------------------------------------- coverage cells


def _write_tile(atlas_dir: Path, tile_lat: float, tile_lon: float, *, rows: int) -> None:
    """Write one tile at a partition path the runtime will look for.

    ``rows=0`` writes a real Parquet file with the right schema and no cell,
    which is what a partial or interrupted build leaves behind.
    """
    tile_dir = atlas_dir / f"tile_lat={tile_lat:.1f}" / f"tile_lon={tile_lon:.1f}"
    tile_dir.mkdir(parents=True, exist_ok=True)
    lats = [tile_lat + 0.25] * rows
    lons = [tile_lon + 0.25] * rows
    pl.DataFrame(
        {
            "lat": pl.Series(lats, dtype=pl.Float64),
            "lon": pl.Series(lons, dtype=pl.Float64),
            "z0_hydro_m": pl.Series([0.0] * rows, dtype=pl.Float64),
            "M2_h_amp": pl.Series([1.0] * rows, dtype=pl.Float64),
            "M2_h_g": pl.Series([0.0] * rows, dtype=pl.Float64),
        }
    ).write_parquet(tile_dir / "data.parquet", compression="zstd")


def _write_atlas(root: Path, name: str, bbox: tuple[float, float, float, float]) -> Path:
    """An atlas directory with metadata and a bbox coverage polygon, no tiles."""
    atlas_dir = root / name
    atlas_dir.mkdir(parents=True, exist_ok=True)
    (atlas_dir / "metadata.json").write_text(
        json.dumps(
            {
                "atlas": name,
                "rank": 0,
                "resolution_m": 2000,
                "constituents_h": ["M2"],
                "constituents_u": [],
                "constituents_v": [],
                "schema_version": 2,
            }
        )
    )
    lat_min, lon_min, lat_max, lon_max = bbox
    (atlas_dir / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"atlas": name},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [lon_min, lat_min],
                                    [lon_max, lat_min],
                                    [lon_max, lat_max],
                                    [lon_min, lat_max],
                                    [lon_min, lat_min],
                                ]
                            ],
                        },
                    }
                ],
            }
        )
    )
    return atlas_dir


def test_coverage_cells_merges_a_contiguous_run(tmp_path: Path) -> None:
    # Three tiles side by side along one latitude row collapse into one
    # rectangle. Without the merge the response would carry a box per tile,
    # and a real atlas has thousands of them.
    atlas_dir = _write_atlas(tmp_path, "RUN", (48.0, -5.0, 48.5, -3.5))
    for tile_lon in (-5.0, -4.5, -4.0):
        _write_tile(atlas_dir, 48.0, tile_lon, rows=2)

    cells = MarcAtlasRegistry.from_directory(tmp_path).coverage_cells()
    assert cells == (("RUN", ((48.0, -5.0, 48.5, -3.5),)),)


def test_coverage_cells_keeps_a_gap_as_two_rectangles(tmp_path: Path) -> None:
    # A hole in the middle of a row must stay a hole: merging across it would
    # claim coverage where the atlas has no tile at all.
    atlas_dir = _write_atlas(tmp_path, "GAP", (48.0, -6.0, 48.5, -3.5))
    for tile_lon in (-6.0, -4.0):
        _write_tile(atlas_dir, 48.0, tile_lon, rows=1)

    boxes = MarcAtlasRegistry.from_directory(tmp_path).coverage_cells()[0][1]
    assert boxes == ((48.0, -6.0, 48.5, -5.5), (48.0, -4.0, 48.5, -3.5))


def test_coverage_cells_skips_an_empty_tile(tmp_path: Path) -> None:
    # An interrupted build can leave a tile file with the right schema and no
    # row. ``covers`` skips it (empty frame, next candidate), so the coverage
    # answer has to skip it too or the two disagree.
    atlas_dir = _write_atlas(tmp_path, "EMPTY", (48.0, -6.0, 48.5, -3.5))
    _write_tile(atlas_dir, 48.0, -6.0, rows=3)
    _write_tile(atlas_dir, 48.0, -5.5, rows=0)

    boxes = MarcAtlasRegistry.from_directory(tmp_path).coverage_cells()[0][1]
    assert boxes == ((48.0, -6.0, 48.5, -5.5),)


def test_coverage_cells_keeps_latitude_rows_separate(tmp_path: Path) -> None:
    atlas_dir = _write_atlas(tmp_path, "ROWS", (47.5, -5.0, 48.5, -4.0))
    _write_tile(atlas_dir, 47.5, -5.0, rows=1)
    _write_tile(atlas_dir, 48.0, -5.0, rows=1)
    _write_tile(atlas_dir, 48.0, -4.5, rows=1)

    boxes = MarcAtlasRegistry.from_directory(tmp_path).coverage_cells()[0][1]
    assert boxes == ((47.5, -5.0, 48.0, -4.5), (48.0, -5.0, 48.5, -4.0))


def test_coverage_cells_is_empty_for_an_atlas_without_tiles(tmp_path: Path) -> None:
    _write_atlas(tmp_path, "NOTILES", (48.0, -5.0, 48.5, -4.5))
    assert MarcAtlasRegistry.from_directory(tmp_path).coverage_cells() == (("NOTILES", ()),)


def test_a_mediterranean_point_sits_in_the_bbox_but_in_no_cell(tmp_path: Path) -> None:
    """The reason this method exists, reproduced at fixture scale.

    ATLNE's coverage polygon is a bounding box spanning 39.98 N to 64.99 N and
    20.03 W to 15.00 E, so Porquerolles (43.0, 6.2) falls inside it while the
    overlay answers ``covered: false`` there, 14 times out of 14 in the live
    measurement. A client filtering on the bbox skips nothing in the
    Mediterranean; filtering on the cells, it skips every call.
    """
    atlas_dir = _write_atlas(tmp_path, "ATLNE", (39.98, -20.03, 64.99, 15.0))
    # Atlantic tiles only, exactly like the real atlas.
    for tile_lon in (-5.0, -4.5):
        _write_tile(atlas_dir, 48.0, tile_lon, rows=2)
    registry = MarcAtlasRegistry.from_directory(tmp_path)

    med = (43.0, 6.2)
    atlas = registry.atlases[0]
    assert atlas.bbox[0] <= med[0] <= atlas.bbox[2]
    assert atlas.bbox[1] <= med[1] <= atlas.bbox[3]

    boxes = registry.coverage_cells()[0][1]
    assert not any(
        lat_min <= med[0] <= lat_max and lon_min <= med[1] <= lon_max
        for lat_min, lon_min, lat_max, lon_max in boxes
    )
    # And the endpoint's promise holds where it matters: no cell, no coverage.
    assert registry.covers(*med) is None


def test_no_point_outside_the_cells_is_ever_covered(tmp_path: Path) -> None:
    """The invariant the client relies on to skip a call.

    Swept over a grid that straddles the tiles, their seams and the empty
    tile, so a rectangle that is one tile too narrow fails here rather than in
    production as a silently missing current.
    """
    atlas_dir = _write_atlas(tmp_path, "SWEEP", (47.0, -6.0, 49.0, -3.0))
    for tile_lat, tile_lon in ((48.0, -5.0), (48.0, -4.5), (47.5, -3.5)):
        _write_tile(atlas_dir, tile_lat, tile_lon, rows=4)
    _write_tile(atlas_dir, 48.5, -5.0, rows=0)
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    boxes = registry.coverage_cells()[0][1]

    covered_seen = 0
    for i in range(41):
        for j in range(61):
            lat = 47.0 + i * 0.05
            lon = -6.0 + j * 0.05
            if registry.covers(lat, lon) is None:
                continue
            covered_seen += 1
            assert any(
                lat_min <= lat <= lat_max and lon_min <= lon <= lon_max
                for lat_min, lon_min, lat_max, lon_max in boxes
            ), (lat, lon)
    assert covered_seen > 0


def test_coverage_cells_is_memoised_per_directory(tmp_path: Path) -> None:
    # Two registries over the same atlas share the answer: the deployment
    # builds one for the REST routes and one inside build_server, and the
    # directory walk should not happen twice.
    atlas_dir = _write_atlas(tmp_path, "MEMO", (48.0, -5.0, 48.5, -4.5))
    _write_tile(atlas_dir, 48.0, -5.0, rows=1)

    first = MarcAtlasRegistry.from_directory(tmp_path).coverage_cells()
    # Add a tile behind its back: a cached answer must not see it.
    _write_tile(atlas_dir, 48.0, -4.5, rows=1)
    second = MarcAtlasRegistry.from_directory(tmp_path).coverage_cells()
    assert first == second


# ------------------------------------------------------------ tile-edge search


def _write_cells(
    atlas_dir: Path, tile_lat: float, tile_lon: float, cells: list[tuple[float, float]]
) -> None:
    """Write a tile holding exactly the cells given, in decimal degrees."""
    tile_dir = atlas_dir / f"tile_lat={tile_lat:.1f}" / f"tile_lon={tile_lon:.1f}"
    tile_dir.mkdir(parents=True, exist_ok=True)
    n = len(cells)
    pl.DataFrame(
        {
            "lat": pl.Series([c[0] for c in cells], dtype=pl.Float64),
            "lon": pl.Series([c[1] for c in cells], dtype=pl.Float64),
            "z0_hydro_m": pl.Series([0.0] * n, dtype=pl.Float64),
            "M2_h_amp": pl.Series([1.0] * n, dtype=pl.Float64),
            "M2_h_g": pl.Series([0.0] * n, dtype=pl.Float64),
            "M2_u_amp": pl.Series([0.5] * n, dtype=pl.Float64),
            "M2_u_g": pl.Series([0.0] * n, dtype=pl.Float64),
            "M2_v_amp": pl.Series([0.3] * n, dtype=pl.Float64),
            "M2_v_g": pl.Series([0.0] * n, dtype=pl.Float64),
        }
    ).write_parquet(tile_dir / "data.parquet", compression="zstd")


# 0.0134 deg of longitude at 48 N is about 1 km, so this query sits inside the
# western tile, a kilometre short of the seam at -4.5.
SEAM_QUERY = (48.25, -4.5134)


def _two_tile_atlas(tmp_path: Path) -> MarcAtlasRegistry:
    """Two adjacent tiles, seam at longitude -4.5.

    Tile A, west of the seam, holds one cell about 2 km from the query: near
    enough to establish coverage on its own, which is what keeps the atlas
    cascade out of this. Tile B, just past the seam, holds one about 1 km
    away. A query inside A is therefore nearer to B's cell than to A's own,
    the arrangement the single-tile lookup used to get wrong.
    """
    atlas_dir = _write_atlas(tmp_path, "SEAM", (47.5, -5.5, 49.0, -4.0))
    _write_cells(atlas_dir, 48.0, -5.0, [(48.25, -4.54)])
    _write_cells(atlas_dir, 48.0, -4.5, [(48.25, -4.499)])
    return MarcAtlasRegistry.from_directory(tmp_path)


def test_nearest_cell_is_found_across_a_tile_seam(tmp_path: Path) -> None:
    """A point 1 km inside tile A gets tile B's cell when B's is nearer."""
    registry = _two_tile_atlas(tmp_path)
    query_lat, query_lon = SEAM_QUERY
    assert query_lon < -4.5, "the query must sit in the western tile"

    cell = registry.cell_at(query_lat, query_lon)
    assert cell is not None
    # Tile B's cell is about 1.1 km away, tile A's own about 2.0 km.
    assert cell.lon == pytest.approx(-4.499)
    assert cell.lat == pytest.approx(48.25)


def test_the_seam_search_does_not_widen_coverage(tmp_path: Path) -> None:
    """Coverage stays decided by the containing tile, cell choice does not.

    Letting a neighbour establish coverage would break two things at once:
    the promise ``coverage_cells`` makes to the web client, and the atlas
    cascade, which would promote a fine atlas whose nearest cell is
    kilometres away over a coarser one with a cell next door.
    """
    registry = _two_tile_atlas(tmp_path)
    atlas = registry.covers(*SEAM_QUERY)
    assert atlas is not None
    assert atlas.name == "SEAM"
    # Same answer with the containing tile's own cell removed: no coverage,
    # even though the neighbour still holds one a kilometre away.
    empty_root = tmp_path / "empty"
    empty_dir = _write_atlas(empty_root, "SEAM", (47.5, -5.5, 49.0, -4.0))
    _write_tile(empty_dir, 48.0, -5.0, rows=0)
    _write_cells(empty_dir, 48.0, -4.5, [(48.25, -4.499)])
    assert MarcAtlasRegistry.from_directory(empty_root).covers(*SEAM_QUERY) is None


def test_the_closer_cell_of_the_containing_tile_still_wins(tmp_path: Path) -> None:
    """No regression for the ordinary case: the local cell is the answer."""
    atlas_dir = _write_atlas(tmp_path, "LOCAL", (47.5, -5.5, 49.0, -4.0))
    _write_cells(atlas_dir, 48.0, -5.0, [(48.25, -4.51)])
    _write_cells(atlas_dir, 48.0, -4.5, [(48.25, -4.49)])
    registry = MarcAtlasRegistry.from_directory(tmp_path)

    cell = registry.cell_at(48.25, -4.505)
    assert cell is not None
    assert cell.lon == pytest.approx(-4.51)


def test_a_corner_query_reaches_the_diagonal_tile(tmp_path: Path) -> None:
    """Four tiles meet: the nearest cell sits in the diagonal one.

    The containing tile carries a cell 6.5 km away, enough to cover the query
    on its own, while the diagonal tile has one 466 m away. Only a search that
    walks the corner finds it.
    """
    atlas_dir = _write_atlas(tmp_path, "CORNER", (47.5, -5.5, 49.0, -4.0))
    _write_cells(atlas_dir, 48.0, -5.0, [(48.45, -4.55)])
    _write_cells(atlas_dir, 48.5, -4.5, [(48.502, -4.498)])
    registry = MarcAtlasRegistry.from_directory(tmp_path)

    cell = registry.cell_at(48.4985, -4.5015)
    assert cell is not None
    assert cell.lat == pytest.approx(48.502)
    assert cell.lon == pytest.approx(-4.498)


def test_an_empty_containing_tile_is_still_not_covered(tmp_path: Path) -> None:
    """The promise coverage_cells makes to the web client, kept.

    The neighbour search improves which cell answers inside coverage; it must
    never extend coverage past the published rectangles, or the client would
    skip a request the server would have honoured.
    """
    atlas_dir = _write_atlas(tmp_path, "HALO", (47.5, -5.5, 49.0, -4.0))
    _write_tile(atlas_dir, 48.0, -5.0, rows=0)
    _write_cells(atlas_dir, 48.0, -4.5, [(48.25, -4.49)])
    registry = MarcAtlasRegistry.from_directory(tmp_path)

    boxes = registry.coverage_cells()[0][1]
    query_lat, query_lon = 48.25, -4.5134
    assert not any(
        lat_min <= query_lat <= lat_max and lon_min <= query_lon <= lon_max
        for lat_min, lon_min, lat_max, lon_max in boxes
    )
    assert registry.covers(query_lat, query_lon) is None
    assert registry.cell_at(query_lat, query_lon) is None


def test_no_point_outside_the_cells_is_covered_with_neighbour_search(tmp_path: Path) -> None:
    """The sweep of the coverage invariant, rerun against seams and corners.

    Same contract as ``test_no_point_outside_the_cells_is_ever_covered``, on a
    layout built to put queries a few hundred metres from every kind of tile
    boundary: side seams, the corner where four tiles meet, and the empty
    tile that must stay a hole.
    """
    atlas_dir = _write_atlas(tmp_path, "SWEEP2", (47.0, -6.0, 49.5, -3.0))
    for tile_lat, tile_lon in ((48.0, -5.0), (48.0, -4.5), (48.5, -4.5)):
        _write_cells(
            atlas_dir,
            tile_lat,
            tile_lon,
            [(tile_lat + 0.01, tile_lon + 0.01), (tile_lat + 0.49, tile_lon + 0.49)],
        )
    _write_tile(atlas_dir, 48.5, -5.0, rows=0)
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    boxes = registry.coverage_cells()[0][1]

    covered_seen = 0
    for i in range(51):
        for j in range(61):
            lat = 47.75 + i * 0.02
            lon = -5.25 + j * 0.02
            if registry.covers(lat, lon) is None:
                continue
            covered_seen += 1
            assert any(
                lat_min <= lat <= lat_max and lon_min <= lon <= lon_max
                for lat_min, lon_min, lat_max, lon_max in boxes
            ), (lat, lon)
    assert covered_seen > 0


def test_cell_at_is_memoised_for_a_repeated_point(tmp_path: Path) -> None:
    """One overlay request asks for the same point three times.

    Asserted through the tile reader rather than a call counter on the method,
    because the memo is only worth anything if it also spares the numpy scan
    behind it.
    """
    atlas_dir = _write_atlas(tmp_path, "MEMOCELL", (47.5, -5.5, 49.0, -4.0))
    _write_cells(atlas_dir, 48.0, -5.0, [(48.25, -4.75)])
    registry = MarcAtlasRegistry.from_directory(tmp_path)

    first = registry.cell_at(48.25, -4.75)
    assert first is not None
    # Rewrite the tile with a different cell behind the memo's back: a cached
    # answer must not see it.
    _write_cells(atlas_dir, 48.0, -5.0, [(48.26, -4.76)])
    again = registry.cell_at(48.25, -4.75)
    assert again is first


def _write_single_cell_atlas(
    root: Path,
    name: str,
    metadata: dict,
    lat: float,
    lon: float,
    *,
    u_amp: float = 0.8,
    v_amp: float = 0.3,
) -> None:
    """One-cell atlas at (lat, lon) with M2 constants (m/s) and the given metadata."""
    atlas_dir = root / name
    atlas_dir.mkdir()
    (atlas_dir / "metadata.json").write_text(json.dumps(metadata))
    (atlas_dir / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"atlas": name},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [lon - 1, lat - 1],
                                    [lon + 1, lat - 1],
                                    [lon + 1, lat + 1],
                                    [lon - 1, lat + 1],
                                    [lon - 1, lat - 1],
                                ]
                            ],
                        },
                    }
                ],
            }
        )
    )
    tile_lat = (lat // 0.5) * 0.5
    tile_lon = (lon // 0.5) * 0.5
    tile_dir = atlas_dir / f"tile_lat={tile_lat:.1f}" / f"tile_lon={tile_lon:.1f}"
    tile_dir.mkdir(parents=True)
    pl.DataFrame(
        {
            "lat": [lat],
            "lon": [lon],
            "M2_u_amp": [u_amp],
            "M2_u_g": [100.0],
            "M2_v_amp": [v_amp],
            "M2_v_g": [190.0],
        }
    ).write_parquet(tile_dir / "data.parquet")


def test_schema3_metadata_drives_label_and_validity(tmp_path: Path) -> None:
    """A schema 3 atlas answers with its own label and refuses outside its validity box.

    Two cells 0.4 degrees apart, both inside the bbox, only one inside
    ``validity_bbox``: the other one must fall through to ``None`` even
    though a cell sits right there.
    """
    _write_single_cell_atlas(
        tmp_path,
        "BSH_CUXBRU",
        {
            "atlas": "BSH_CUXBRU",
            "zone": "cuxbru",
            "rank": 3,
            "resolution_m": 90,
            "source": {"short": "bsh"},
            "confidence": "high",
            "validity_bbox": [53.8, 8.6, 53.95, 9.0],
            "schema_version": 3,
        },
        53.88,
        8.70,
    )
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    atlas = registry.covers(53.88, 8.70)
    assert atlas is not None
    assert atlas.source_label == "bsh_cuxbru_90m"
    assert atlas.validity_bbox == (53.8, 8.6, 53.95, 9.0)
    assert registry.atlas_named("BSH_CUXBRU") is atlas
    # Inside the bbox of the atlas (1 degree square) but outside validity.
    assert registry.covers(54.3, 8.70) is None
    assert registry.covers(53.88, 9.4) is None


def test_schema2_metadata_keeps_historical_label(fixture_atlas: Path) -> None:
    """The MARC fixture carries no source or zone: label and validity default."""
    atlas = MarcAtlasRegistry.from_directory(fixture_atlas).covers(48.35, -4.80)
    assert atlas is not None
    assert atlas.source_label == "marc_finis_250m"
    assert atlas.validity_bbox is None
    assert atlas.confidence == "high"


def test_validity_bbox_confines_a_coarse_atlas_but_not_a_fine_one(tmp_path: Path) -> None:
    """ATLNE-style: coarse atlas valid only west of 3 E, fine atlas everywhere.

    East of the line the coarse atlas must not answer, and with no fine
    atlas there the registry returns ``None`` (the caller falls back to
    SMOC); west of it the coarse atlas still answers.
    """
    _write_single_cell_atlas(
        tmp_path,
        "ATLNE",
        {
            "atlas": "ATLNE",
            "rank": 0,
            "resolution_m": 2000,
            "validity_bbox": [40.0, -20.0, 53.0, 3.0],
            "schema_version": 3,
        },
        53.87,
        8.70,
    )
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    assert registry.covers(53.87, 8.70) is None  # Cuxhaven: east of the line
    # Same registry, a west-of-the-line atlas of the same kind still covers.
    _write_single_cell_atlas(
        tmp_path,
        "ATLNE_W",
        {
            "atlas": "ATLNE_W",
            "rank": 0,
            "resolution_m": 2000,
            "validity_bbox": [40.0, -20.0, 53.0, 3.0],
            "schema_version": 3,
        },
        47.0,
        -5.0,
    )
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    atlas = registry.covers(47.0, -5.0)
    assert atlas is not None and atlas.source_label == "marc_atlne_w_2000m"


def test_coverage_cells_are_clipped_to_the_validity_bbox(tmp_path: Path) -> None:
    """Published rectangles never extend where ``covers`` would refuse."""
    _write_single_cell_atlas(
        tmp_path,
        "ATLNE",
        {
            "atlas": "ATLNE",
            "rank": 0,
            "resolution_m": 2000,
            "validity_bbox": [40.0, -20.0, 53.0, 3.0],
            "schema_version": 3,
        },
        53.87,
        8.70,
    )
    _write_single_cell_atlas(
        tmp_path,
        "ATLNE_W",
        {
            "atlas": "ATLNE_W",
            "rank": 0,
            "resolution_m": 2000,
            "validity_bbox": [40.0, -20.0, 53.0, 3.0],
            "schema_version": 3,
        },
        52.9,
        2.9,
    )
    cells = dict(MarcAtlasRegistry.from_directory(tmp_path).coverage_cells())
    assert cells["ATLNE"] == ()  # the only tile lies east of 3 E
    # The western tile (52.5 to 53.0 N, 2.5 to 3.0 E) touches the box edge and is kept whole.
    assert cells["ATLNE_W"] == ((52.5, 2.5, 53.0, 3.0),)


def test_atlas_can_declare_its_own_tile_pitch(tmp_path: Path) -> None:
    """A global atlas cut in 2 degree tiles is found, predicted and published.

    ``grid.tile_deg`` in the metadata drives the tile lookup, the seam
    search and the coverage rectangles; the 0.5 degree default stays what
    every MARC atlas uses.
    """
    atlas_dir = tmp_path / "FES_GLOBAL"
    atlas_dir.mkdir()
    (atlas_dir / "metadata.json").write_text(
        json.dumps(
            {
                "atlas": "FES_GLOBAL",
                "zone": "global",
                "rank": 0,
                "resolution_m": 7000,
                "source": {"short": "fes"},
                "grid": {"type": "regular_ll", "tile_deg": 2.0},
                "schema_version": 3,
            }
        )
    )
    (atlas_dir / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"atlas": "FES_GLOBAL"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[[0, 50], [12, 50], [12, 56], [0, 56], [0, 50]]],
                        },
                    }
                ],
            }
        )
    )
    tile_dir = atlas_dir / "tile_lat=52.0" / "tile_lon=8.0"
    tile_dir.mkdir(parents=True)
    pl.DataFrame(
        {
            "lat": [53.1],
            "lon": [9.3],
            "M2_u_amp": [0.4],
            "M2_u_g": [100.0],
            "M2_v_amp": [0.1],
            "M2_v_g": [190.0],
        }
    ).write_parquet(tile_dir / "data.parquet")
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    atlas = registry.covers(53.12, 9.31)
    assert atlas is not None and atlas.tile_deg == 2.0
    assert atlas.source_label == "fes_global_7000m"
    # 7 km pitch: the threshold is 5 x 7 km = 35 km, so a point 20 km away
    # in the same 2 degree tile is still answered by that cell.
    assert registry.covers(53.28, 9.30) is atlas
    assert registry.predict_current(53.12, 9.31, datetime(2026, 9, 20, tzinfo=UTC)) is not None
    assert dict(registry.coverage_cells())["FES_GLOBAL"] == ((52.0, 8.0, 54.0, 10.0),)


def test_the_serving_policy_withholds_a_published_atlas(tmp_path: Path) -> None:
    """NorKyst is in the dataset but out of the cascade: the registry skips it
    unless a study tool asks for everything."""
    _write_single_cell_atlas(
        tmp_path,
        "NORKYST_LOFOTEN",
        {
            "atlas": "NORKYST_LOFOTEN",
            "zone": "lofoten",
            "rank": 1,
            "resolution_m": 800,
            "source": {"short": "norkyst"},
            "schema_version": 3,
        },
        67.80,
        12.83,
    )
    assert MarcAtlasRegistry.from_directory(tmp_path).atlases == ()
    assert MarcAtlasRegistry.from_directory(tmp_path).covers(67.80, 12.83) is None
    every = MarcAtlasRegistry.from_directory(tmp_path, withheld=frozenset())
    assert [a.name for a in every.atlases] == ["NORKYST_LOFOTEN"]


def test_gibraltar_is_cut_out_of_the_copernicus_tide(tmp_path: Path) -> None:
    """The IBI atlas holds the tide alone and erases the Atlantic inflow in
    the strait: it must not answer there, and still answers outside it."""
    from openwind_data.currents.serving_policy import GIBRALTAR

    meta = {
        "atlas": "CMEMS_IBI",
        "zone": "ibi",
        "rank": 0,
        "resolution_m": 3000,
        "source": {"short": "cmems"},
        "schema_version": 3,
    }
    _write_single_cell_atlas(tmp_path, "CMEMS_IBI", meta, 35.95, -5.60)
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    assert registry.atlas_named("CMEMS_IBI").excluded_bboxes == (GIBRALTAR,)
    assert registry.covers(35.95, -5.60) is None
    assert registry.cell_at(35.95, -5.60) is None
    # Cadiz roads, same atlas, outside the box.
    other = tmp_path / "other"
    other.mkdir()
    _write_single_cell_atlas(other, "CMEMS_IBI", meta, 36.50, -6.40)
    atlas = MarcAtlasRegistry.from_directory(other).covers(36.50, -6.40)
    assert atlas is not None and atlas.source_label == "cmems_ibi_3000m"


def _meta(name: str, rank: int, resolution_m: int) -> dict:
    return {
        "atlas": name,
        "zone": name.lower(),
        "rank": rank,
        "resolution_m": resolution_m,
        "schema_version": 3,
    }


def test_a_coarse_atlas_passes_where_its_tide_is_weak(tmp_path: Path) -> None:
    """ATLNE off Brittany holds a 0.08 kt tide: under 0.2 kt the general
    current of the global model matters more, so the 2 km atlas passes, says
    why, and a stronger coarse atlas below it in the cascade answers."""
    _write_single_cell_atlas(
        tmp_path, "ATLNE", _meta("ATLNE", 1, 2000), 47.5, -9.0, u_amp=0.03, v_amp=0.01
    )
    _write_single_cell_atlas(tmp_path, "CMEMS_NWS", _meta("CMEMS_NWS", 0, 1500), 47.5, -9.0)
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    atlas = registry.covers(47.5, -9.0)
    assert atlas is not None and atlas.name == "CMEMS_NWS"
    declined = registry.declined_at(47.5, -9.0)
    assert [d.atlas.name for d in declined] == ["ATLNE"]
    assert declined[0].reason == "weak_tide"
    assert declined[0].max_tide_kt is not None and declined[0].max_tide_kt < 0.2


def test_alone_and_weak_a_coarse_atlas_leaves_the_point_to_the_global_model(tmp_path: Path) -> None:
    _write_single_cell_atlas(
        tmp_path, "ATLNE", _meta("ATLNE", 1, 2000), 47.0, -12.0, u_amp=0.03, v_amp=0.01
    )
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    assert registry.covers(47.0, -12.0) is None
    assert registry.cell_at(47.0, -12.0) is None
    assert [d.reason for d in registry.declined_at(47.0, -12.0)] == ["weak_tide"]


def test_a_fine_atlas_answers_even_where_its_tide_is_weak(tmp_path: Path) -> None:
    """A 250 m atlas in a sheltered bay: the weak tide is the information, and
    the 8 km global model does not see the bay at all."""
    _write_single_cell_atlas(
        tmp_path, "FINIS", _meta("FINIS", 2, 250), 48.35, -4.50, u_amp=0.03, v_amp=0.01
    )
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    atlas = registry.covers(48.35, -4.50)
    assert atlas is not None and atlas.name == "FINIS"
    assert registry.declined_at(48.35, -4.50) == []


def test_the_gibraltar_box_is_named_when_declined(tmp_path: Path) -> None:
    _write_single_cell_atlas(tmp_path, "CMEMS_IBI", _meta("CMEMS_IBI", 0, 3000), 35.95, -5.60)
    declined = MarcAtlasRegistry.from_directory(tmp_path).declined_at(35.95, -5.60)
    assert [(d.reason, d.box) for d in declined] == [("excluded", "gibraltar")]


def test_an_atlas_built_without_its_weak_cells_says_weak_tide_where_it_has_none(
    tmp_path: Path,
) -> None:
    """Copernicus NWS dropped its cells under 0.2 kt at build: off Brittany it
    has none, and that is the weak-tide rule applied earlier, not a hole."""
    meta = {**_meta("CMEMS_NWS", 0, 1500), "analysis": {"min_speed_kt": 0.2}}
    _write_single_cell_atlas(tmp_path, "CMEMS_NWS", meta, 47.5, -9.0)
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    assert registry.atlas_named("CMEMS_NWS").min_speed_kt == 0.2
    # Inside the 1-degree bbox, 60 km from the only cell.
    [declined] = registry.declined_at(47.0, -9.5)
    assert (declined.reason, declined.max_tide_kt) == ("weak_tide", None)


def test_a_shelf_atlas_passes_too_whatever_its_grid(tmp_path: Path) -> None:
    """MANGA is 700 m but a shelf atlas (rank 1): in the deep Bay of Biscay
    its 0.06 kt tide is no more worth than ATLNE's, the general current
    answers."""
    _write_single_cell_atlas(
        tmp_path, "MANGA", _meta("MANGA", 1, 700), 45.5, -4.0, u_amp=0.02, v_amp=0.01
    )
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    assert registry.covers(45.5, -4.0) is None
    assert [d.reason for d in registry.declined_at(45.5, -4.0)] == ["weak_tide"]


def _write_rows(root: Path, name: str, meta: dict, rows: list[dict]) -> None:
    """A coastal atlas whose cells all sit in one 0.5 degree tile."""
    atlas_dir = root / name
    atlas_dir.mkdir()
    (atlas_dir / "metadata.json").write_text(json.dumps(meta))
    lats = [r["lat"] for r in rows]
    lons = [r["lon"] for r in rows]
    ring = [
        [min(lons) - 0.1, min(lats) - 0.1],
        [max(lons) + 0.1, min(lats) - 0.1],
        [max(lons) + 0.1, max(lats) + 0.1],
        [min(lons) - 0.1, max(lats) + 0.1],
        [min(lons) - 0.1, min(lats) - 0.1],
    ]
    (atlas_dir / "coverage.geojson").write_text(
        json.dumps({"features": [{"geometry": {"type": "Polygon", "coordinates": [ring]}}]})
    )
    tile_dir = (
        atlas_dir
        / f"tile_lat={(lats[0] // 0.5) * 0.5:.1f}"
        / f"tile_lon={(lons[0] // 0.5) * 0.5:.1f}"
    )
    tile_dir.mkdir(parents=True)
    pl.DataFrame(
        {
            "lat": lats,
            "lon": lons,
            "M2_h_amp": [r["h"] for r in rows],
            "M2_h_g": [100.0] * len(rows),
            "M2_u_amp": [r["u"] for r in rows],
            "M2_u_g": [100.0] * len(rows),
            "M2_v_amp": [r["v"] for r in rows],
            "M2_v_g": [190.0] * len(rows),
        }
    ).write_parquet(tile_dir / "data.parquet")


_COASTAL = {
    "atlas": "MANE",
    "rank": 2,
    "resolution_m": 250,
    "constituents_u": ["M2"],
    "constituents_v": ["M2"],
    "schema_version": 3,
}


def test_a_dead_fringe_cell_gives_way_to_the_living_sea_cell_next_to_it(tmp_path: Path) -> None:
    """The nearest U face is a zero-flow land-fringe cell; a living sea cell
    sits 220 m away. The current comes from the living one, nothing is dead."""
    _write_rows(
        tmp_path,
        "MANE",
        _COASTAL,
        [
            {"lat": 49.300, "lon": 0.300, "h": 2.5, "u": 0.6, "v": 0.2},
            {"lat": 49.302, "lon": 0.300, "h": 2.5, "u": 0.0, "v": 0.0},
        ],
    )
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    cell = registry.cell_at(49.3021, 0.300)
    assert cell is not None and not cell.current_dead and not cell.height_dead
    assert cell.u_constants["M2"][0] == 0.6


def test_a_river_beyond_the_model_is_dead_water(tmp_path: Path) -> None:
    """Rouen in MARC MANE: zero current, zero range, and no living cell within
    three cells. Dead current and dead height, not a zero."""
    _write_rows(
        tmp_path,
        "MANE",
        _COASTAL,
        [
            {"lat": 49.300, "lon": 0.300, "h": 2.5, "u": 0.6, "v": 0.2},
            {"lat": 49.440, "lon": 0.400, "h": 0.0, "u": 0.0, "v": 0.0},
        ],
    )
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    cell = registry.cell_at(49.440, 0.400)
    assert cell is not None and cell.current_dead and cell.height_dead
    assert (
        registry.predict_current_series(49.440, 0.400, [datetime(2026, 1, 1, tzinfo=UTC)]) is None
    )


def test_explain_tells_the_decision_of_every_atlas_holding_the_point(tmp_path: Path) -> None:
    """Off Brittany: ATLNE passes on a weak tide, NWS answers. Same answer as
    covers(), with the reason of the one that passed."""
    _write_single_cell_atlas(
        tmp_path, "ATLNE", _meta("ATLNE", 1, 2000), 47.5, -9.0, u_amp=0.03, v_amp=0.01
    )
    _write_single_cell_atlas(tmp_path, "CMEMS_NWS", _meta("CMEMS_NWS", 0, 1500), 47.5, -9.0)
    registry = MarcAtlasRegistry.from_directory(tmp_path)
    verdicts = registry.explain(47.5, -9.0)
    assert [(v.atlas.name, v.decision) for v in verdicts] == [
        ("ATLNE", "weak_tide"),
        ("CMEMS_NWS", "used"),
    ]
    assert verdicts[0].max_tide_kt < 0.2 and verdicts[1].max_tide_kt > 0.2
    assert registry.covers(47.5, -9.0).name == "CMEMS_NWS"


def test_explain_says_dead_water_and_outside_validity(tmp_path: Path) -> None:
    _write_rows(
        tmp_path,
        "MANE",
        _COASTAL,
        [
            {"lat": 47.300, "lon": -2.300, "h": 2.5, "u": 0.6, "v": 0.2},
            {"lat": 47.440, "lon": -2.400, "h": 0.0, "u": 0.0, "v": 0.0},
        ],
    )
    meta = {**_meta("ATLNE", 1, 2000), "validity_bbox": [40.0, -20.0, 47.0, 3.0]}
    _write_single_cell_atlas(tmp_path, "ATLNE", meta, 47.44, -2.40)
    verdicts = MarcAtlasRegistry.from_directory(tmp_path).explain(47.44, -2.40)
    assert [(v.atlas.name, v.decision) for v in verdicts] == [
        ("MANE", "dead_water"),
        ("ATLNE", "outside_validity"),
    ]


def test_the_mediterranean_atlas_stays_in_the_mediterranean(tmp_path: Path) -> None:
    """Its model's domain reaches the Bay of Biscay; measured there at 1.7 to
    3.1 times the observed M2, it must not answer outside its own sea."""
    meta = {**_meta("CMEMS_MED", 0, 4200), "source": {"short": "cmems"}}
    for name, (lat, lon) in {
        "biscay": (43.6, -2.3),
        "cadiz": (36.6, -7.0),
        "lion": (43.0, 4.0),
    }.items():
        root = tmp_path / name
        root.mkdir()
        _write_single_cell_atlas(root, "CMEMS_MED", meta, lat, lon)
        registry = MarcAtlasRegistry.from_directory(root)
        if name == "lion":
            assert registry.covers(lat, lon) is not None
        else:
            assert registry.covers(lat, lon) is None
            assert [(d.reason, d.box) for d in registry.declined_at(lat, lon)] == [
                ("excluded", "atlantic")
            ]
