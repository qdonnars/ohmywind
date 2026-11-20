# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The three OPENWIND_ROUTE_REPAIR modes of plan_passage's land gate (prototype)."""

from __future__ import annotations

import math

import numpy as np
import pytest
from openwind_data.currents.land_mask import LandMask
from openwind_data.routing.auto_route import NavGrid
from openwind_data.routing.auto_route.repair import FineLand
from openwind_data.routing.geometry import Point

from openwind_mcp_core.server import _land_gate, _route_view

PITCH = 0.0005


def _fine() -> tuple[FineLand, NavGrid]:
    land = np.zeros((200, 300), dtype=bool)
    land[80:120, 130:170] = True  # an island the coarse mask does not see
    g = NavGrid(47.0, -3.0, PITCH, PITCH / math.cos(math.radians(47.0)), land)
    return FineLand.from_grid(g), g


def _route(g: NavGrid) -> list[Point]:
    return [Point(*g.latlon(100, 20)), Point(*g.latlon(100, 280))]


def test_off_plans_the_route_as_drawn():
    fine, g = _fine()
    out, added, changes = _land_gate([(None, _route(g))], LandMask.empty(), fine, "off")
    assert out == [_route(g)] and added == [[]] and changes == []


def test_compute_plans_the_retraced_route_and_says_so():
    fine, g = _fine()
    out, added, changes = _land_gate([(None, _route(g))], LandMask.empty(), fine, "compute")
    assert len(out[0]) > 2 and added[0] == list(range(1, len(out[0]) - 1))
    assert "crossed land" in changes[0]
    view = _route_view(out[0], added[0])
    assert "by_server" not in view[0] and view[1]["by_server"] is True


def test_suggest_refuses_with_waypoints_ready_to_send_back():
    fine, g = _fine()
    with pytest.raises(ValueError, match=r"Send this route as waypoints to plan it: \[\{"):
        _land_gate([(None, _route(g))], LandMask.empty(), fine, "suggest")
