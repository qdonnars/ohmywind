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
