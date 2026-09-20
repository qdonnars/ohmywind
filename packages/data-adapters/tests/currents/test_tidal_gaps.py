# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tests for the tidal-gap lookup and the notice the engine raises from it."""

from __future__ import annotations

import numpy as np

from openwind_data.currents import tidal_gaps
from openwind_data.currents.tidal_gaps import _in_polygon, tidal_gap_at


def test_dataset_loads_with_passes_and_at_least_one_mask() -> None:
    gaps = tidal_gaps._load()
    assert len(gaps.passes) >= 20
    assert len(gaps.rings) >= 1
    assert all(p.name for p in gaps.passes)


def test_ray_casting_honours_holes() -> None:
    outer = np.array([[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], dtype=float)
    hole = np.array([[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]], dtype=float)
    assert _in_polygon(0.5, 0.5, outer, (hole,))
    assert not _in_polygon(2.0, 2.0, outer, (hole,))
    assert not _in_polygon(5.0, 5.0, outer, (hole,))


def test_known_passes_are_hits_and_open_water_is_not() -> None:
    # Cuxhaven roads: the Elbe entry, a gap while no German atlas is served.
    hit = tidal_gap_at(53.87, 8.70)
    assert hit is not None and hit.kind == "pass"
    assert "Elbe" in hit.zone or "Cuxhaven" in hit.zone
    assert hit.distance_km < 15
    # Pentland Firth: a famous race, only a 2 km atlas at best.
    hit = tidal_gap_at(58.70, -3.15)
    assert hit is not None and "Pentland" in hit.zone
    # Mid Bay of Biscay: nothing.
    assert tidal_gap_at(46.0, -5.0) is None
    # Mediterranean open water: nothing.
    assert tidal_gap_at(42.5, 5.5) is None


def test_pass_radius_is_a_parameter() -> None:
    assert (
        tidal_gap_at(53.87, 8.70, pass_radius_km=0.1) is None
        or tidal_gap_at(53.87, 8.70, pass_radius_km=0.1).kind == "mask"
    )
