# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Route repair prototype on synthetic grids: the five rules, one test each, and the edges."""

from __future__ import annotations

import math
from itertools import pairwise

import numpy as np

from openwind_data.routing.auto_route import NavGrid
from openwind_data.routing.auto_route.repair import (
    FineLand,
    RepairParams,
    leg_crosses_land,
    repair_route,
)
from openwind_data.routing.geometry import Point

PITCH_DEG = 0.0005  # ~55 m


def _fine(land: np.ndarray) -> tuple[FineLand, NavGrid]:
    g = NavGrid(
        lat0=47.0,
        lon0=-3.0,
        dlat=PITCH_DEG,
        dlon=PITCH_DEG / math.cos(math.radians(47.0)),
        land=land,
    )
    return FineLand.from_grid(g), g


def _pt(g: NavGrid, r: float, c: float) -> Point:
    return Point(*g.latlon(r, c))


def _at_sea(fine: FineLand, pts: list[Point]) -> bool:
    region = fine.region_for(pts)
    assert region is not None
    return not any(region.is_land(p) for p in pts) and not any(
        leg_crosses_land(region, a, b) for a, b in pairwise(pts)
    )


def test_departure_ashore_near_the_sea_is_moved_and_said():
    land = np.zeros((200, 300), dtype=bool)
    land[:, :60] = True  # the coast runs north-south at column 60
    fine, g = _fine(land)
    route = [_pt(g, 100, 50), _pt(g, 100, 250)]  # ten pixels inland, ~550 m
    rep = repair_route(fine, route)
    assert rep is not None and rep.refusal is None
    assert rep.points[0] != route[0] and rep.points[-1] == route[-1]
    assert _at_sea(fine, rep.points)
    assert "departure was on land: moved" in rep.changes[0]
    assert rep.retraced == []


def test_departure_far_inland_is_refused_with_the_distance():
    land = np.zeros((200, 300), dtype=bool)
    land[:, :150] = True
    fine, g = _fine(land)
    route = [_pt(g, 100, 40), _pt(g, 100, 250)]  # ~110 px, ~6 km inland
    rep = repair_route(fine, route, RepairParams(max_snap_m=3000.0))
    assert rep is not None
    assert rep.refusal is not None and "departure" in rep.refusal
    assert "from the sea" in rep.refusal


def test_intermediate_waypoint_ashore_is_refused_with_a_route_without_it():
    land = np.zeros((200, 300), dtype=bool)
    land[80:120, 130:170] = True  # an island
    fine, g = _fine(land)
    route = [_pt(g, 100, 20), _pt(g, 100, 150), _pt(g, 100, 280)]
    rep = repair_route(fine, route)
    assert rep is not None and rep.refusal is not None
    assert "waypoint 2" in rep.refusal and "nearest open water" in rep.refusal
    assert "Without it, a route at sea" in rep.refusal


def test_a_leg_across_an_island_is_retraced_alone():
    land = np.zeros((200, 300), dtype=bool)
    land[80:120, 130:170] = True
    fine, g = _fine(land)
    route = [_pt(g, 30, 20), _pt(g, 100, 40), _pt(g, 100, 260), _pt(g, 170, 280)]
    rep = repair_route(fine, route)
    assert rep is not None and rep.refusal is None
    assert _at_sea(fine, rep.points)
    assert [r["leg"] for r in rep.retraced] == [1]
    # The legs the caller drew are kept as drawn, the server's points sit between.
    assert rep.points[:2] == route[:2] and rep.points[-2:] == route[-2:]
    assert rep.added == list(range(2, len(rep.points) - 2))
    assert rep.retraced[0]["retraced_nm"] > rep.retraced[0]["straight_nm"]
    assert "Leg 2 (waypoint 2 to 3) crossed land" in rep.changes[0]


def test_no_passage_or_an_absurd_one_is_refused():
    land = np.zeros((200, 300), dtype=bool)
    land[:, 140:160] = True  # a wall from edge to edge
    fine, g = _fine(land)
    rep = repair_route(fine, [_pt(g, 100, 20), _pt(g, 100, 280)])
    assert rep is not None and rep.refusal is not None
    assert "no passage at sea" in rep.refusal

    land = np.zeros((200, 300), dtype=bool)
    land[110:, 140:160] = True  # a long spit, the way round is at its far end
    fine, g = _fine(land)
    rep = repair_route(fine, [_pt(g, 190, 120), _pt(g, 190, 180)], RepairParams(max_ratio=3.0))
    assert rep is not None and rep.refusal is not None
    assert "way round at sea" in rep.refusal


def test_an_enclosed_basin_counts_as_land_for_the_departure():
    land = np.zeros((200, 300), dtype=bool)
    land[:, :60] = True
    land[90:110, 30:50] = False  # a basin the pixels close
    fine, g = _fine(land)
    route = [_pt(g, 100, 40), _pt(g, 100, 250)]
    rep = repair_route(fine, route)
    assert rep is not None and rep.refusal is None
    assert rep.points[0] != route[0]
    assert _at_sea(fine, rep.points)


def test_a_route_at_sea_is_unchanged_and_no_grid_means_none():
    fine, g = _fine(np.zeros((100, 200), dtype=bool))
    route = [_pt(g, 50, 10), _pt(g, 50, 190)]
    rep = repair_route(fine, route)
    assert rep is not None and rep.points == route and rep.changes == []
    assert repair_route(fine, [Point(10.0, 10.0), Point(10.1, 10.1)]) is None
    assert repair_route(FineLand(), route) is None


def test_marseille_to_porquerolles_on_the_bundled_tiles_says_each_change_twice():
    """The real shoreline: each change once in English, once as a coded notice."""
    from openwind_data.routing.auto_route.repair import BUNDLED_GRIDS_DIR

    fine = FineLand.from_directory(BUNDLED_GRIDS_DIR)
    rep = repair_route(fine, [Point(43.295, 5.361), Point(43.000, 6.242)])
    assert rep is not None and rep.refusal is None
    assert [n.code for n in rep.notices] == ["route.arrival_moved", "route.leg_retraced"]
    assert len(rep.notices) == len(rep.changes)
    moved, retraced = rep.notices
    assert f"moved {moved.params['distance_m']} m" in rep.changes[0]
    assert f"{retraced.params['retraced_nm']} nm instead of" in rep.changes[1]
    assert rep.added == list(range(1, len(rep.points) - 1))
    assert _at_sea(fine, rep.points)
    # Sent back, the repaired route is at sea and comes back unchanged.
    again = repair_route(fine, rep.points)
    assert again is not None and again.points == rep.points and not again.changes
