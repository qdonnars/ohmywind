# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""``plan_passage(polar=...)``: the caller's own polar (issue #514).

The grid replaces the archetype's for every route and every window, the
separate knobs still apply on top of it, the link says it cannot carry it, and
a bad grid is refused with REST's wording before any forecast request.
"""

from __future__ import annotations

import pytest
from openwind_data.routing.custom_polar import POLAR_MAX_TWA_ENTRIES, POLAR_MAX_TWS_ENTRIES
from test_server import _BASE_PLAN_ARGS, StubAdapter, _call

from openwind_mcp_core import build_server

# The stub blows 12 kn from the north all day; the route heads ESE, a beam
# reach. A flat grid makes the expected speed exact whatever the angle.
TWA = [30, 60, 90, 120, 150, 180]


def _flat_polar(speed_kn: float, **extra) -> dict:
    return {
        "tws_kn": [4, 12, 25],
        "twa_deg": TWA,
        "boat_speed_kn": [[speed_kn] * len(TWA) for _ in range(3)],
        **extra,
    }


def _args(**overrides) -> dict:
    return {**_BASE_PLAN_ARGS, **overrides}


def _speeds(passage: dict) -> set[float]:
    return {round(s["boat_speed_kn"], 3) for s in passage["segments"]}


class TestSimulatesWithTheGrid:
    async def test_a_faster_polar_shortens_the_passage(self) -> None:
        server = build_server(adapter=StubAdapter())
        archetype = await _call(server, "plan_passage", _args())
        custom = await _call(server, "plan_passage", _args(polar=_flat_polar(20.0)))
        assert custom["passage"]["duration_h"] < archetype["passage"]["duration_h"]
        assert custom["passage"]["distance_nm"] == archetype["passage"]["distance_nm"]

    async def test_efficiency_still_multiplies_the_grid(self) -> None:
        server = build_server(adapter=StubAdapter())
        default = await _call(server, "plan_passage", _args(polar=_flat_polar(8.0)))
        full = await _call(server, "plan_passage", _args(polar=_flat_polar(8.0), efficiency=1.0))
        assert _speeds(default["passage"]) == {6.0}  # 8 kn x 0.75, the default
        assert _speeds(full["passage"]) == {8.0}

    async def test_deterministic(self) -> None:
        server = build_server(adapter=StubAdapter())
        args = _args(polar=_flat_polar(9.0))
        first = await _call(server, "plan_passage", args)
        second = await _call(server, "plan_passage", args)
        assert first["passage"] == second["passage"]

    async def test_alternatives_use_the_same_polar(self) -> None:
        server = build_server(adapter=StubAdapter())
        alt = {
            "label": "Par le large",
            "waypoints": [
                {"lat": 43.30, "lon": 5.35},
                {"lat": 43.10, "lon": 5.60},
                {"lat": 43.00, "lon": 6.20},
            ],
        }
        out = await _call(
            server,
            "plan_passage",
            _args(polar=_flat_polar(8.0), efficiency=1.0, alternatives=[alt]),
        )
        assert _speeds(out["alternatives"][0]["passage"]) == {8.0}

    async def test_compare_windows_use_the_same_polar(self) -> None:
        server = build_server(adapter=StubAdapter())
        sweep = _args(latest_departure="2026-05-01T09:00:00+00:00", sweep_interval_hours=3)
        archetype = await _call(server, "plan_passage", sweep)
        custom = await _call(server, "plan_passage", sweep | {"polar": _flat_polar(20.0)})
        assert len(custom["windows"]) == len(archetype["windows"]) == 2
        for a, c in zip(archetype["windows"], custom["windows"], strict=True):
            assert c["duration_h"] < a["duration_h"]
        assert "polar_notice" in custom


class TestTheSeparateKnobsWin:
    async def test_min_upwind_param_overrides_the_polar_s_own(self) -> None:
        # Dead upwind: a route due north into the stub's northerly. The
        # passage tacks at the no-go floor, so the floor sets the duration.
        north = [{"lat": 43.0, "lon": 5.5}, {"lat": 43.3, "lon": 5.5}]
        server = build_server(adapter=StubAdapter())
        polar = _flat_polar(6.0, min_upwind_twa_deg=60)
        own = await _call(server, "plan_passage", _args(waypoints=north, polar=polar))
        tighter = await _call(
            server,
            "plan_passage",
            _args(waypoints=north, polar=polar, min_upwind_twa_deg=35),
        )
        assert tighter["passage"]["duration_h"] < own["passage"]["duration_h"]


class TestTheLink:
    async def test_polar_notice_names_the_archetype_the_link_opens(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _args(polar=_flat_polar(8.0)))
        assert "archetype=cruiser_40ft" in out["openwind_url"]
        assert "'cruiser_40ft'" in out["polar_notice"]
        assert "cannot carry a polar" in out["polar_notice"]

    async def test_no_notice_without_a_polar(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _args())
        assert "polar_notice" not in out


def _rows(n_tws: int, n_twa: int, v: float = 5.0) -> list[list[float]]:
    return [[v] * n_twa for _ in range(n_tws)]


class TestRefusedBeforeAnyFetch:
    @pytest.mark.parametrize(
        ("polar", "needle"),
        [
            # Refused by the schema itself (an object), before the reader.
            ("12 kn everywhere", "Input should be a valid dictionary"),
            ({"tws_kn": [6, 12], "twa_deg": [40, 90]}, "polar fields missing or non-numeric"),
            (
                _flat_polar(6.0) | {"tws_kn": [12, 4, 25]},
                "invalid polar: polar tws_kn must be strictly ascending",
            ),
            (
                _flat_polar(6.0) | {"twa_deg": [30, 60, 60, 120, 150, 180]},
                "polar twa_deg must be strictly ascending",
            ),
            (
                _flat_polar(6.0) | {"twa_deg": [30, 60, 90, 120, 150, 200]},
                "polar twa_deg must lie in [0, 180]",
            ),
            (
                _flat_polar(6.0) | {"boat_speed_kn": _rows(2, len(TWA))},
                "polar boat_speed_kn has 2 rows, expected 3 (one per TWS)",
            ),
            (
                _flat_polar(6.0) | {"boat_speed_kn": _rows(3, 5)},
                "polar boat_speed_kn row 0 has 5 cols, expected 6",
            ),
            (_flat_polar(31.0), "polar boat_speed_kn[0][0]=31.0 out of range [0, 30]"),
            (
                _flat_polar(6.0) | {"boat_speed_kn": [[6.0] * 6, [6.0] * 6, [6.0] * 5 + ["nan"]]},
                "polar boat_speed_kn[2][5]=nan is not a finite number",
            ),
            (
                {
                    "tws_kn": list(range(POLAR_MAX_TWS_ENTRIES + 1)),
                    "twa_deg": TWA,
                    "boat_speed_kn": _rows(POLAR_MAX_TWS_ENTRIES + 1, len(TWA)),
                },
                f"polar grid too large: {POLAR_MAX_TWS_ENTRIES + 1} TWS x 6 TWA entries, "
                f"at most {POLAR_MAX_TWS_ENTRIES} x {POLAR_MAX_TWA_ENTRIES}",
            ),
            (
                _flat_polar(6.0, min_upwind_twa_deg=95),
                "polar min_upwind_twa_deg must be a number in (0, 90)",
            ),
            (
                _flat_polar(6.0, motor_threshold_kn=4, motor_speed_kn=0),
                "invalid polar: polar motor_speed_kn must be in [0.5, 30] kn, got 0.0",
            ),
        ],
    )
    async def test_refused_with_a_readable_message(self, polar, needle) -> None:
        adapter = StubAdapter()
        server = build_server(adapter=adapter)
        with pytest.raises(Exception) as excinfo:
            await server.call_tool("plan_passage", _args(polar=polar))
        assert needle in str(excinfo.value)
        assert adapter.fetch_calls == 0

    async def test_the_largest_grid_plans(self) -> None:
        tws = [float(v) for v in range(POLAR_MAX_TWS_ENTRIES)]
        twa = [float(v) for v in range(POLAR_MAX_TWA_ENTRIES)]
        polar = {
            "tws_kn": tws,
            "twa_deg": twa,
            "boat_speed_kn": _rows(len(tws), len(twa), 7.0),
        }
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _args(polar=polar, efficiency=1.0))
        assert _speeds(out["passage"]) == {7.0}


async def test_the_description_quotes_the_grid_ceiling() -> None:
    tools = await build_server(adapter=StubAdapter()).list_tools()
    tool = next(t for t in tools if t.name == "plan_passage")
    assert f"{POLAR_MAX_TWS_ENTRIES} TWS x {POLAR_MAX_TWA_ENTRIES} TWA" in tool.description
    assert "{polar_max}" not in tool.description
    assert "polar" in tool.inputSchema["properties"]
    assert "polar" not in tool.inputSchema.get("required", [])
