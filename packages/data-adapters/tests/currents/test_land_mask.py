# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

import json
from pathlib import Path

import numpy as np
import polars as pl

from openwind_data.currents.land_mask import FILE_NAME, LandMask, load_land_mask, pack
from openwind_data.currents.marc_atlas import MarcAtlasRegistry


def _write(tmp_path: Path) -> Path:
    # 4 rows x 10 columns at 0.5 degree, from (48 N, -5 E): the eastern half is land.
    land = np.zeros((4, 10), dtype=bool)
    land[:, 5:] = True
    np.savez_compressed(
        tmp_path / FILE_NAME, **pack(land, lat0=48.0, lon0=-5.0, pitch_deg=0.5, source="test")
    )
    return tmp_path


def test_round_trip_and_lookup(tmp_path: Path) -> None:
    mask = LandMask.from_directory(_write(tmp_path))
    assert mask.loaded and mask.source == "test"
    assert mask.is_land(48.2, -4.9) is False  # column 0, sea
    assert mask.is_land(48.2, -2.4) is True  # column 5, land
    assert mask.is_land(49.9, -0.1) is True  # last row and column
    # Column 9 ends at 0 E: 0.0 falls in column 10, outside, never land.
    assert mask.is_land(48.2, 0.0) is False
    assert mask.is_land(47.9, -2.4) is False  # south of the grid
    assert mask.is_land(48.2, 10.0) is False  # east of the grid


def test_missing_file_is_an_empty_mask(tmp_path: Path) -> None:
    mask = LandMask.from_directory(tmp_path)
    assert mask.loaded is False
    assert mask.is_land(48.2, -2.4) is False
    assert LandMask.from_directory(None).is_land(0.0, 0.0) is False


def _write_atlas(root: Path, name: str, *, resolution_m: int, origin: str, cells: list) -> None:
    atlas_dir = root / name
    tile = atlas_dir / "tile_lat=48.0" / "tile_lon=-5.0"
    tile.mkdir(parents=True)
    (atlas_dir / "metadata.json").write_text(
        json.dumps(
            {
                "atlas": name,
                "rank": 3,
                "resolution_m": resolution_m,
                "grid": {"type": "regular_ll", "origin": origin},
            }
        )
    )
    pl.DataFrame({"lat": [c[0] for c in cells], "lon": [c[1] for c in cells]}).write_parquet(
        tile / "data.parquet"
    )


def test_with_water_clears_only_the_pixels_holding_a_point(tmp_path: Path) -> None:
    mask = LandMask.from_directory(_write(tmp_path))
    wet = mask.with_water(np.array([48.2, 60.0]), np.array([-2.4, -2.4]))  # 2nd: off the grid
    assert wet.is_land(48.2, -2.4) is False  # the pixel holding the point
    assert wet.is_land(48.2, -1.9) is True  # its neighbour
    assert wet.is_land(48.7, -2.4) is True  # the row above
    assert mask.is_land(48.2, -2.4) is True  # the original is untouched
    assert LandMask.empty().with_water(np.array([48.2]), np.array([-2.4])).loaded is False


def test_only_fine_native_atlases_prove_water(tmp_path: Path) -> None:
    atlases = tmp_path / "atlases"
    _write_atlas(atlases, "FINE", resolution_m=90, origin="native", cells=[(48.2, -2.4)])
    _write_atlas(atlases, "REGRID", resolution_m=90, origin="regrid", cells=[(48.2, -1.4)])
    _write_atlas(atlases, "COARSE", resolution_m=926, origin="native", cells=[(48.7, -1.4)])
    marc = MarcAtlasRegistry.from_directory(atlases)
    assert [a.grid_origin for a in marc.atlases] == ["native", "native", "regrid"]
    lats, lons = marc.water_cells()
    assert lats.tolist() == [48.2] and lons.tolist() == [-2.4]


def test_load_land_mask_lets_the_atlases_water_win(tmp_path: Path) -> None:
    atlases = tmp_path / "atlases"
    _write_atlas(atlases, "FINE", resolution_m=90, origin="native", cells=[(48.2, -2.4)])
    marc = MarcAtlasRegistry.from_directory(atlases)
    mask = load_land_mask(_write(tmp_path), marc=marc, shom=None)
    assert mask.is_land(48.2, -2.4) is False
    assert mask.is_land(48.2, -1.9) is True
    # Without registries it is the shipped bitmap, as before.
    assert load_land_mask(tmp_path).is_land(48.2, -2.4) is True
