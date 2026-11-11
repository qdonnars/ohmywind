# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Legs over land, against a synthetic mask: a block of land in an empty sea."""

from __future__ import annotations

import math
import time
from itertools import pairwise

import numpy as np
import pytest

from openwind_data.currents.land_mask import LandMask
from openwind_data.routing.geometry import Point, haversine_distance, interpolate_great_circle
from openwind_data.routing.land_check import (
    STEP_NM,
    LandCrossing,
    land_crossings,
    waypoints_ashore,
)

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


def _walk_point_by_point(route: list[Point], mask: LandMask, step_nm: float = STEP_NM) -> list:
    """The walk ``land_crossings`` did before it was vectorised, kept as the reference."""
    out = []
    for i, (a, b) in enumerate(pairwise(route)):
        length = haversine_distance(a, b)
        n = max(2, math.ceil(length / step_nm))
        ashore = [
            p
            for p in (interpolate_great_circle(a, b, k / n) for k in range(1, n))
            if mask.is_land(p.lat, p.lon)
        ]
        if ashore:
            out.append(
                LandCrossing(i, round(len(ashore) * length / n, 1), ashore[0].lat, ashore[0].lon)
            )
    return out


def test_vectorised_walk_finds_what_the_point_by_point_walk_found(mask: LandMask) -> None:
    # Random legs over and around the island, plus legs laid exactly on pixel
    # edges (47.5 N, 4.6 W are edges of the 0.01 degree grid), where an ulp
    # of difference between numpy and math could flip a verdict.
    rng = np.random.default_rng(7)
    routes = [
        [Point(float(a), float(b)), Point(float(c), float(d))]
        for a, b, c, d in zip(
            rng.uniform(47.0, 48.0, 150),
            rng.uniform(-5.0, -4.0, 150),
            rng.uniform(47.0, 48.0, 150),
            rng.uniform(-5.0, -4.0, 150),
            strict=True,
        )
    ]
    routes += [
        [Point(47.5, -4.9), Point(47.5, -4.1)],
        [Point(47.2, -4.6), Point(47.8, -4.6)],
        [Point(47.4, -4.6), Point(47.6, -4.4)],
        [Point(47.3, -4.9), Point(47.5, -4.9), Point(47.5, -4.1), Point(47.7, -4.1)],
    ]
    found = 0
    for route in routes:
        expected = _walk_point_by_point(route, mask)
        assert land_crossings(route, mask) == expected, route
        found += bool(expected)
    assert 0 < found < len(routes)


def test_is_land_many_agrees_with_is_land(mask: LandMask) -> None:
    rng = np.random.default_rng(11)
    lats = np.concatenate([rng.uniform(46.5, 48.5, 2000), [47.4, 47.6, 46.99, 48.0, 47.5]])
    lons = np.concatenate([rng.uniform(-5.5, -3.5, 2000), [-4.6, -4.4, -4.5, -4.5, -5.0]])
    many = mask.is_land_many(lats, lons)
    assert many.tolist() == [mask.is_land(a, o) for a, o in zip(lats, lons, strict=True)]
    assert many.any() and not many.all()
    assert not LandMask.empty().is_land_many(lats, lons).any()


def test_a_leg_across_the_world_is_walked_quickly(mask: LandMask) -> None:
    # The audit's zigzag, 0 E to 179 E and back: 49 legs of 7 600 nm, 3.7
    # million samples. Point by point it took 4.5 to 8 s; vectorised, well
    # under a second. The route length cap refuses it upstream anyway, this
    # pins the walk itself.
    zigzag = [Point(45.0, 0.0 if i % 2 == 0 else 179.0) for i in range(50)]
    t = time.perf_counter()
    land_crossings(zigzag, mask)
    assert time.perf_counter() - t < 3.0
