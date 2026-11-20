# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Auto-route spike (#540) on synthetic grids: around an island, through a gate, flags."""

from __future__ import annotations

import math
from itertools import pairwise

import numpy as np

from openwind_data.routing.auto_route import NavGrid, RouteParams, suggest_route
from openwind_data.routing.geometry import Point

PITCH_DEG = 0.0005  # ~55 m


def _grid(land: np.ndarray, depth: np.ndarray | None = None) -> NavGrid:
    return NavGrid(
        lat0=47.0,
        lon0=-3.0,
        dlat=PITCH_DEG,
        dlon=PITCH_DEG / math.cos(math.radians(47.0)),
        land=land,
        depth=depth,
        depth_pitch_m=115.0,
    )


def _pt(g: NavGrid, r: float, c: float) -> Point:
    return Point(*g.latlon(r, c))


def _crosses_land(g: NavGrid, wps: list[Point]) -> bool:
    for a, b in pairwise(wps):
        t = np.linspace(0, 1, 400)
        r, c = g.rc_float(a.lat + t * (b.lat - a.lat), a.lon + t * (b.lon - a.lon))
        if g.land[np.floor(r).astype(int), np.floor(c).astype(int)].any():
            return True
    return False


def test_goes_around_an_island_without_touching_it():
    land = np.zeros((200, 300), dtype=bool)
    land[60:140, 120:180] = True
    g = _grid(land)
    route = suggest_route(g, _pt(g, 100, 20), _pt(g, 100, 280), params=RouteParams(use_depth=False))
    assert route is not None
    assert not _crosses_land(g, route.waypoints)
    assert route.distance_nm > route.straight_nm
    assert 2 <= len(route.waypoints) <= 50


def test_open_water_is_a_straight_line():
    g = _grid(np.zeros((100, 200), dtype=bool))
    route = suggest_route(g, _pt(g, 50, 10), _pt(g, 50, 190))
    assert route is not None
    assert len(route.waypoints) == 2
    assert route.legs[0].quality == "unknown"  # no bathymetry loaded


def test_shallow_bank_is_avoided_when_a_deep_way_exists_and_flagged_otherwise():
    land = np.zeros((200, 300), dtype=bool)
    depth = np.full(land.shape, 30.0, dtype=np.float32)
    depth[40:200, 140:160] = 1.0  # a bank from the south edge, open to the north
    g = _grid(land, depth)
    route = suggest_route(g, _pt(g, 100, 20), _pt(g, 100, 280))
    assert route is not None and not route.depth_relaxed
    assert not any(leg.below_draft for leg in route.legs)
    # Close the gap: the only way is over the bank, said, not hidden.
    depth[:, 140:160] = 1.0
    g = _grid(land, depth)
    route = suggest_route(g, _pt(g, 100, 20), _pt(g, 100, 280))
    assert route is not None and route.depth_relaxed
    assert any(leg.below_draft for leg in route.legs)


def test_intent_point_is_kept():
    land = np.zeros((200, 300), dtype=bool)
    land[60:140, 120:180] = True
    g = _grid(land)
    via = _pt(g, 30, 150)  # "par le sud" of the island
    route = suggest_route(
        g, _pt(g, 100, 20), _pt(g, 100, 280), [via], params=RouteParams(use_depth=False)
    )
    assert route is not None
    assert min(abs(w.lat - via.lat) + abs(w.lon - via.lon) for w in route.waypoints) < 1e-3
    assert not _crosses_land(g, route.waypoints)
