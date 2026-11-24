# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""``plan_passage`` gives the tide at both ends of the passage, as facts.

A sailor reads an arrival against the water: the forum test that sent a
boat into the Île de Batz at low water had the wind right and the tide
nowhere in the answer. These tests hold that every window, and a single
passage, carry the height (chart datum where the atlas knows it), the trend,
the high and low water around it and the day's range, and that an end no
atlas covers carries nothing rather than a guess.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from mcp.types import CallToolResult
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.router import CompositeMarineAdapter
from openwind_data.testing import DeterministicMarineAdapter
from test_tidal_stream import _write_atlas

from openwind_mcp_core import build_server

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
# Two points around the single FINIS-like cell of the fixture atlas.
IN_ATLAS = [{"lat": 48.355, "lon": -4.795}, {"lat": 48.33, "lon": -4.75}]
IN_THE_MED = [{"lat": 43.29, "lon": 5.37}, {"lat": 43.00, "lon": 6.20}]
READING_KEYS = {
    "height_m",
    "datum",
    "trend",
    "previous",
    "next",
    "cycle_range_m",
    "day_max_range_m",
    "source",
}


@pytest.fixture
def server(tmp_path: Path):
    square = [[-5.5, 47.5], [-4.5, 47.5], [-4.5, 49.0], [-5.5, 49.0], [-5.5, 47.5]]
    atlas_dir = _write_atlas(tmp_path, "FINIS", 250, square, (48.35, -4.80))
    adapter = CompositeMarineAdapter(
        upstream=DeterministicMarineAdapter(), marc=MarcAtlasRegistry.from_directory(atlas_dir)
    )
    return build_server(adapter=adapter)


async def _plan(server, **args) -> dict:
    result = await server.call_tool(
        "plan_passage",
        {"departure": DEPARTURE.isoformat(), "archetype": "cruiser_30ft", **args},
    )
    if isinstance(result, CallToolResult):
        return result.structuredContent
    return result[1] if isinstance(result, tuple) else result


async def test_each_window_has_the_tide_at_both_ends(server) -> None:
    out = await _plan(
        server,
        waypoints=IN_ATLAS,
        latest_departure=(DEPARTURE + timedelta(hours=12)).isoformat(),
        sweep_interval_hours=6,
    )
    assert out["windows"]
    for w in out["windows"]:
        for key in ("departure_tide", "arrival_tide"):
            reading = w[key]
            assert READING_KEYS <= reading.keys()
            # The fixture cell carries z0_hydro_m: heights above chart datum.
            assert reading["datum"] == "ZH"
            assert reading["height_m"] >= 0
            assert reading["trend"] in {"rising", "falling"}
            assert {reading["previous"]["type"], reading["next"]["type"]} == {"high", "low"}
            # An M2 of 2.05 m amplitude, times its nodal factor (about 0.97
            # in 2026): about 4 m between high and low water.
            assert reading["cycle_range_m"] == pytest.approx(4.0, abs=0.15)
            assert reading["source"] == "marc_finis_250m"


async def test_a_single_passage_has_the_tide_at_both_ends(server) -> None:
    out = await _plan(server, waypoints=IN_ATLAS)
    assert READING_KEYS <= out["departure_tide"].keys()
    assert READING_KEYS <= out["arrival_tide"].keys()


async def test_times_are_in_the_callers_offset(server) -> None:
    paris = DEPARTURE.astimezone(datetime.fromisoformat("2026-05-01T00:00+02:00").tzinfo)
    out = await _plan(server, waypoints=IN_ATLAS, departure=paris.isoformat())
    assert out["arrival_tide"]["next"]["time"].endswith("+02:00")


async def test_no_atlas_no_tide_key(server) -> None:
    out = await _plan(server, waypoints=IN_THE_MED)
    assert "departure_tide" not in out
    assert "arrival_tide" not in out
