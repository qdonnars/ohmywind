# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The three OPENWIND_ROUTE_REPAIR modes of plan_passage's land gate (prototype)."""

from __future__ import annotations

import math

import numpy as np
import pytest
from openwind_data.currents.land_mask import LandMask
from openwind_data.routing.auto_route import NavGrid
from openwind_data.routing.auto_route.repair import FineLand, repair_route
from openwind_data.routing.geometry import Point

from openwind_mcp_core.server import (
    ROUTE_NOTICE,
    ROUTE_NOTICE_ADJUSTED,
    SERVER_INSTRUCTIONS,
    _closing,
    _land_gate,
    _route_notice,
    _route_view,
)

PITCH = 0.0005


def _fine() -> tuple[FineLand, NavGrid]:
    land = np.zeros((200, 300), dtype=bool)
    land[80:120, 130:170] = True  # an island the coarse mask does not see
    g = NavGrid(47.0, -3.0, PITCH, PITCH / math.cos(math.radians(47.0)), land)
    return FineLand.from_grid(g), g


def _route(g: NavGrid) -> list[Point]:
    return [Point(*g.latlon(100, 20)), Point(*g.latlon(100, 280))]


def test_off_plans_the_route_as_drawn():
    _, g = _fine()
    out, added, changes = _land_gate([(None, _route(g))], LandMask.empty(), [None], "off")
    assert out == [_route(g)] and added == [[]] and changes == []


def test_compute_plans_the_retraced_route_and_says_so():
    fine, g = _fine()
    out, added, changes = _land_gate(
        [(None, _route(g))], LandMask.empty(), [repair_route(fine, _route(g))], "compute"
    )
    assert len(out[0]) > 2 and added[0] == list(range(1, len(out[0]) - 1))
    assert "crossed land" in changes[0]
    view = _route_view(out[0], added[0])
    assert "by_server" not in view[0] and view[1]["by_server"] is True


def test_suggest_refuses_with_waypoints_ready_to_send_back():
    fine, g = _fine()
    with pytest.raises(ValueError, match=r"Send this route as waypoints to plan it: \[\{"):
        _land_gate(
            [(None, _route(g))], LandMask.empty(), [repair_route(fine, _route(g))], "suggest"
        )


def test_an_adjusted_route_names_both_authors_and_asks_for_a_check():
    assert _route_notice([]) == ROUTE_NOTICE
    text = _route_notice(["Leg 1 (waypoint 1 to 2) crossed land: ..."])
    assert text == ROUTE_NOTICE_ADJUSTED
    assert "assistant" in text and "automatic router" in text and "Study it on the map" in text


def test_the_closing_instruction_is_the_last_thing_the_model_reads():
    assert list(_closing([]))[-1] == "end_your_answer_with"
    assert "study the route on the map" in " ".join(SERVER_INSTRUCTIONS.split())
