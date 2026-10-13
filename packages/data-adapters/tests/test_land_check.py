# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Legs over land, against a synthetic mask: a block of land in an empty sea."""

from __future__ import annotations

import numpy as np
import pytest

from openwind_data.currents.land_mask import LandMask
from openwind_data.routing.geometry import Point
from openwind_data.routing.land_check import land_crossings, waypoints_ashore

PITCH = 0.01


@pytest.fixture
def mask() -> LandMask:
    # Sea from 47 N to 48 N and 5 W to 4 W, with an island from 47.4 N to
    # 47.6 N and 4.6 W to 4.4 W: 0.2 degrees of longitude, about 8.1 nm at
    # 47.5 N.
    land = np.zeros((100, 100), dtype=bool)
    land[40:60, 40:60] = True
    return LandMask(
        bits=np.packbits(land, axis=1), n_lat=100, n_lon=100, lat0=47.0, lon0=-5.0, pitch_deg=PITCH
    )


def test_a_leg_across_the_island_is_named_with_its_length_ashore(mask: LandMask) -> None:
    route = [Point(47.3, -4.9), Point(47.5, -4.9), Point(47.5, -4.1), Point(47.7, -4.1)]
    crossings = land_crossings(route, mask)
    assert [c.leg for c in crossings] == [1]
    assert crossings[0].land_nm == pytest.approx(8.1, abs=0.3)
    # Where the leg leaves the sea: the west shore of the island.
    assert crossings[0].lon == pytest.approx(-4.6, abs=0.01)
    assert crossings[0].lat == pytest.approx(47.5, abs=0.01)


def test_a_route_round_the_island_is_clear(mask: LandMask) -> None:
    route = [Point(47.5, -4.9), Point(47.3, -4.5), Point(47.5, -4.1)]
    assert land_crossings(route, mask) == []
    assert waypoints_ashore(route, mask) == []


def test_a_waypoint_inland_is_one_misplaced_point_not_two_crossings(mask: LandMask) -> None:
    # The leg from the shore to the inland point still crosses land on its
    # way in; the point itself is reported apart.
    route = [Point(47.5, -4.9), Point(47.5, -4.5), Point(47.8, -4.5)]
    assert waypoints_ashore(route, mask) == [1]
    assert [c.leg for c in land_crossings(route, mask)] == [0, 1]


def test_an_empty_mask_finds_nothing() -> None:
    route = [Point(47.5, -4.9), Point(47.5, -4.1)]
    assert land_crossings(route, LandMask.empty()) == []
    assert waypoints_ashore(route, LandMask.empty()) == []
