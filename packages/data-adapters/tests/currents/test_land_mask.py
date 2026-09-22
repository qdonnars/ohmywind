# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

from pathlib import Path

import numpy as np

from openwind_data.currents.land_mask import FILE_NAME, LandMask, pack


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
