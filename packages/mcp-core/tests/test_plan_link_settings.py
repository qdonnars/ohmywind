# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The ``/plan`` deep-link carries the engine settings of the plan (issue #534).

A plan computed with the engine, or at another efficiency, used to open on the
site under the visitor's saved boat: a sailor arriving from an assistant, who
had never set a boat there, got a plan under sail alone with another ETA. The
link now carries ``motor=<threshold>,<speed>`` and ``eff=<efficiency>``, read
by the web's ``parsePlanUrl``.

Contract with the web app:

- ``motor`` only when both values are set and valid, ``eff`` only away from
  the tool's default;
- both after the historical ``wpts``, ``departure``, ``archetype``, in that
  order, numbers in their short form (``4``, ``5.5``, ``0.85``);
- a call without them yields byte for byte the link it always did.
"""

from __future__ import annotations

from urllib.parse import parse_qsl, urlsplit

import pytest
from test_server import _BASE_PLAN_ARGS, _SOUTH_OF_THE_ISLAND, _SWEEP_ARGS, StubAdapter, _call

from openwind_mcp_core import build_server
from openwind_mcp_core import render as render_module
from openwind_mcp_core.render import DEFAULT_EFFICIENCY, build_ohmywind_url

_WPTS = [{"lat": 43.3, "lon": 5.36}, {"lat": 43.0, "lon": 6.2}]
_DEP = "2026-08-02T08:00:00+02:00"


def _legacy() -> str:
    """The link as it was built before #534, the reference for the default case."""
    return (
        f"{render_module.WEB_BASE}/plan?wpts=43.300,5.360;43.000,6.200"
        "&departure=2026-08-02T08%3A00%3A00%2B02%3A00&archetype=cruiser_30ft"
    )


def _url(**kw) -> str:
    return build_ohmywind_url(_WPTS, _DEP, "cruiser_30ft", **kw)


def _keys(url: str) -> list[str]:
    return [k for k, _ in parse_qsl(urlsplit(url).query)]


def _params(url: str) -> dict[str, str]:
    return dict(parse_qsl(urlsplit(url).query))


class TestBuilder:
    def test_without_settings_the_link_is_unchanged(self) -> None:
        assert _url() == _legacy()

    def test_default_efficiency_adds_nothing(self) -> None:
        assert _url(efficiency=DEFAULT_EFFICIENCY) == _legacy()
        assert _url(efficiency=0.75) == _legacy()

    def test_motor_with_both_values(self) -> None:
        url = _url(motor_threshold_kn=4.0, motor_speed_kn=5.5)
        assert url == _legacy() + "&motor=4,5.5"

    def test_motor_numbers_in_short_form(self) -> None:
        assert _params(_url(motor_threshold_kn=4, motor_speed_kn=6))["motor"] == "4,6"
        assert _params(_url(motor_threshold_kn=3.5, motor_speed_kn=6.0))["motor"] == "3.5,6"

    @pytest.mark.parametrize(
        "kw", [{"motor_threshold_kn": 4.0}, {"motor_speed_kn": 5.5}], ids=["threshold", "speed"]
    )
    def test_one_motor_value_alone_adds_nothing(self, kw) -> None:
        """Same rule as the engine: either alone is ignored."""
        assert _url(**kw) == _legacy()

    @pytest.mark.parametrize(
        ("threshold", "speed"),
        [(4.0, 0.0), (0.0, 5.5), (-1.0, 5.5), (4.0, float("nan")), (31.0, 5.5)],
    )
    def test_an_invalid_motor_adds_nothing(self, threshold, speed) -> None:
        """``validate_motor``'s ranges: the web would refuse it anyway."""
        assert "motor=" not in _url(motor_threshold_kn=threshold, motor_speed_kn=speed)

    def test_efficiency_away_from_default(self) -> None:
        assert _url(efficiency=0.85) == _legacy() + "&eff=0.85"
        assert _params(_url(efficiency=1.0))["eff"] == "1"

    @pytest.mark.parametrize("eff", [0.0, -0.5, 1.2, float("nan"), float("inf")])
    def test_an_efficiency_out_of_range_adds_nothing(self, eff) -> None:
        assert "eff=" not in _url(efficiency=eff)

    def test_new_parameters_come_last_in_order(self) -> None:
        url = _url(motor_threshold_kn=4.0, motor_speed_kn=5.5, efficiency=0.85)
        assert url == _legacy() + "&motor=4,5.5&eff=0.85"
        assert _keys(url) == ["wpts", "departure", "archetype", "motor", "eff"]


_SETTINGS = {"motor_threshold_kn": 4, "motor_speed_kn": 5.5, "efficiency": 0.85}


def _carries_settings(url: str) -> bool:
    p = _params(url)
    return p.get("motor") == "4,5.5" and p.get("eff") == "0.85"


def _plain(url: str) -> bool:
    return _keys(url) == ["wpts", "departure", "archetype"]


class TestPlanPassageLinks:
    async def test_single_mode_link(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", {**_BASE_PLAN_ARGS, **_SETTINGS})
        assert _carries_settings(out["openwind_url"])

    async def test_single_mode_without_settings_is_unchanged(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _BASE_PLAN_ARGS)
        assert out["openwind_url"] == build_ohmywind_url(
            _BASE_PLAN_ARGS["waypoints"], _BASE_PLAN_ARGS["departure"], "cruiser_40ft"
        )
        assert _plain(out["openwind_url"])

    async def test_one_motor_value_alone_leaves_the_link_plain(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", {**_BASE_PLAN_ARGS, "motor_speed_kn": 5.5})
        assert _plain(out["openwind_url"])

    async def test_min_upwind_angle_alone_adds_no_motor(self) -> None:
        """The polar override also carries the tacking angle: not a motor."""
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", {**_BASE_PLAN_ARGS, "min_upwind_twa_deg": 40})
        assert _plain(out["openwind_url"])

    async def test_single_mode_alternatives_carry_the_settings(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(
            server,
            "plan_passage",
            {
                **_BASE_PLAN_ARGS,
                **_SETTINGS,
                "alternatives": [{"waypoints": _SOUTH_OF_THE_ISLAND}],
            },
        )
        [alt] = out["alternatives"]
        assert _carries_settings(alt["openwind_url"])

    async def test_every_window_link_carries_the_settings(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", {**_SWEEP_ARGS, **_SETTINGS})
        assert out["windows"]
        assert all(_carries_settings(w["openwind_url"]) for w in out["windows"])

    async def test_window_links_without_settings_are_unchanged(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(server, "plan_passage", _SWEEP_ARGS)
        assert all(_plain(w["openwind_url"]) for w in out["windows"])

    async def test_sweep_alternatives_carry_the_settings(self) -> None:
        server = build_server(adapter=StubAdapter())
        out = await _call(
            server,
            "plan_passage",
            {**_SWEEP_ARGS, **_SETTINGS, "alternatives": [{"waypoints": _SOUTH_OF_THE_ISLAND}]},
        )
        [alt] = out["alternatives"]
        assert alt["windows"]
        assert all(_carries_settings(w["openwind_url"]) for w in alt["windows"])
