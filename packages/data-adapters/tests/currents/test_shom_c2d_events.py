# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Which high water a SHOM C2D series is read against.

The 13 hourly frames run from 6 h before to 6 h after high water at the
reference port, so every instant needs *its* high water: the nearest one.
Taking the highest in a 14 h window picked the far tide on a day of diurnal
inequality, froze the stream at the +6 h frame around low water, then flipped
it: 1.8 kt at the Fromveur from 14:00 to 15:30, 5.3 kt the other way at 16:00.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl
import pytest

from openwind_data.currents.shom_c2d_registry import (
    _EVENT_STEPS,
    ShomC2dRegistry,
    _nearest_events,
)

STEP_MIN = 5  # the lattice step the windows are sampled on


def _window(*bumps: tuple[int, float], width: float = 30.0, base: float = 0.0) -> np.ndarray:
    """A sampled window around one query: Gaussian crests at the given steps."""
    x = _EVENT_STEPS.astype(float)
    row = np.full(x.shape, base)
    for step, height in bumps:
        row += height * np.exp(-(((x - step) / width) ** 2))
    return row


def _pick(*rows: np.ndarray, highest: bool = True) -> list[int]:
    return [int(v) for v in _nearest_events(np.vstack(rows), highest=highest)]


def test_the_nearer_high_water_wins_over_the_higher_one() -> None:
    # The morning high water is higher (2.4) but 6 h 40 away; the evening one
    # (2.2) is 6 h 15 ahead. The query belongs to the evening tide.
    row = _window((-80, 2.4), (75, 2.2))
    assert _pick(row) == [75]


def test_a_rising_edge_is_not_a_high_water() -> None:
    # The window starts on the slope of a high water that has already left
    # it: its first sample is the highest, but the event is the crest inside.
    row = _window((-100, 3.0), (60, 2.0))
    assert row[0] > row[np.searchsorted(_EVENT_STEPS, 60)]
    assert _pick(row) == [60]


def test_a_double_top_is_one_high_water_at_its_higher_crest() -> None:
    # Two crests 1 h 40 apart: one high water with a stand, read at the
    # higher crest even when the lower one is nearer the query.
    row = _window((10, 2.0), (30, 2.1), width=6.0)
    assert _pick(row) == [30]


def test_low_water_ports_read_the_nearest_trough() -> None:
    row = -_window((-80, 2.4), (75, 2.2))
    assert _pick(row, highest=False) == [75]


def test_each_row_is_its_own_query() -> None:
    near_before = _window((-40, 2.0), (110, 2.3))
    near_after = _window((-110, 2.3), (40, 2.0))
    assert _pick(near_before, near_after) == [-40, 40]


# --------------------------------------------------------------------------
# The whole registry, on a tide with a strong diurnal inequality.
# --------------------------------------------------------------------------


def _registry(tmp_path: Path) -> ShomC2dRegistry:
    hours = list(range(-6, 7))
    series = [float(h) for h in hours]
    pl.DataFrame(
        [
            {
                "atlas_id": 560,
                "zone": "TEST_ZONE",
                "ref_port_key": "BREST",
                "ref_tide": "PM",
                "lat": lat,
                "lon": lon,
                "u_ve_kn": series,
                "v_ve_kn": series,
                "u_me_kn": series,
                "v_me_kn": series,
            }
            for lat, lon in ((48.44, -5.03), (48.45, -5.02))
        ]
    ).with_columns(
        pl.col("atlas_id").cast(pl.Int16),
        pl.col("lat").cast(pl.Float32),
        pl.col("lon").cast(pl.Float32),
        *(
            pl.col(c).cast(pl.List(pl.Float32))
            for c in ("u_ve_kn", "v_ve_kn", "u_me_kn", "v_me_kn")
        ),
    ).write_parquet(tmp_path / "shom_c2d_points.parquet")
    (tmp_path / "shom_c2d_ref_ports.json").write_text(
        json.dumps(
            {
                "BREST": {
                    "display_name": "Brest",
                    "lat": 48.3833,
                    "lon": -4.4956,
                    "ref_tide": "PM",
                    # K1 and O1 far above Brest's own, so that one high water
                    # in two stands clearly above the other.
                    "constants": {
                        "M2": [2.0, 150.0],
                        "S2": [0.7, 200.0],
                        "K1": [0.4, 80.0],
                        "O1": [0.35, 320.0],
                    },
                }
            }
        )
    )
    return ShomC2dRegistry.from_directory(tmp_path)


def test_no_instant_is_read_more_than_half_a_tide_from_its_high_water(tmp_path: Path) -> None:
    registry = _registry(tmp_path)
    port = registry.ref_ports["BREST"]
    t0 = datetime(2026, 10, 12, tzinfo=UTC)
    times = [t0 + timedelta(minutes=10 * k) for k in range(3 * 24 * 6)]
    offsets = registry._event_offsets_h(port, times)
    # Half the longest interval between two high waters, with margin.
    assert float(np.max(np.abs(offsets))) <= 6.6
    # The offset climbs with time and drops by about one tide at each switch,
    # never in between: no frozen stretch, no backward jump.
    steps = np.diff(offsets)
    assert np.all((np.abs(steps - 10 / 60) < 1e-9) | (steps < -11.0))


@pytest.mark.parametrize("highest", [True, False])
def test_a_window_without_turning_point_falls_back_to_its_extreme(highest: bool) -> None:
    ramp = _EVENT_STEPS.astype(float) * (1.0 if highest else -1.0)
    assert _pick(ramp, highest=highest) == [int(_EVENT_STEPS[-1])]
