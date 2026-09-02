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
