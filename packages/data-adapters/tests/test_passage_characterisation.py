# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Recorded reports of both passage engines, forward and backward.

The forward engine and the backward engine were written as mirrors of each
other and drifted, which is what the 2026-09 audit filed as M1. Merging them
back into one sampling pass and one segment computation is a refactor with no
right to change a single number, and the 92 behaviour tests of
``test_passage.py`` assert properties, not values: they would not catch a
segment whose ``boat_speed_kn`` moved by a thousandth, nor a field silently
left at its default.

So this file records the whole ``PassageReport``, serialised exactly as the
REST and MCP shells serialise it (``views.passage_view``), for a table of
routes and configurations chosen to reach every branch the two engines share:
tacking geometry, wave derate, motor rule, current projection, the sampling
cap and its warning, the light-wind warning, the per-segment model fallback
(full route swap and mixed route), and an adapter carrying ``prewarm_batch``
next to one without it.

Weather comes from ``openwind_data.testing``, a closed-form function of
``(lat, lon, time)``, so the recorded numbers are reproducible without a
network, a file, or a clock. Departure and arrival instants are fixed dates:
the deterministic adapter has no horizon, so nothing here expires.

Regenerating is deliberate and visible::

    OPENWIND_REGENERATE_GOLDENS=1 uv run pytest tests/test_passage_characterisation.py

and a PR that moves one of these files without saying so in its description is
a change to the physics nobody agreed to.
"""

from __future__ import annotations

import asyncio
import dataclasses
import json
import os
import pathlib
from collections.abc import Callable
from datetime import UTC, datetime

import pytest

from openwind_data.adapters.base import ForecastBundle, WindSeries
from openwind_data.routing.archetypes import get_polar
from openwind_data.routing.geometry import Point
from openwind_data.routing.passage import (
    WIND_FETCH_WINDOW,
    NoModelCoveredError,
    PassageReport,
    estimate_passage,
    estimate_passage_for_arrival,
)
from openwind_data.testing import DeterministicMarineAdapter
from openwind_data.views import passage_view

GOLDEN_DIR = pathlib.Path(__file__).parent / "goldens"
REGENERATE = os.environ.get("OPENWIND_REGENERATE_GOLDENS") == "1"

# Fixed instants. The deterministic adapter answers whatever it is asked, so a
# hard-coded date stays valid; a "tomorrow" would make the recorded bytes
# depend on the day the suite runs.
DEPARTURE = datetime(2026, 5, 14, 6, 0, tzinfo=UTC)
ARRIVAL = datetime(2026, 5, 14, 18, 0, tzinfo=UTC)

MARSEILLE = Point(43.29, 5.37)
PORQUEROLLES = Point(43.00, 6.20)
CASSIS = Point(43.20, 5.54)
BANDOL = Point(43.12, 5.75)
# A north-westward leg out of Marseille, sailed in short 5 nm hops. The
# deterministic wind puts it on a reach, so this is the case that pins the
# plain ``polar_speed`` branch, while the Marseille to Porquerolles routes
# above run at 21 to 52 deg TWA and pin the tacking-geometry branch.
REACHING = [Point(43.29, 5.37), Point(43.55, 5.10)]
# Long enough to trip MAX_SAMPLED_SEGMENTS and raise the sampling warning.
LONG_ROUTE = [Point(43.29, 5.37), Point(42.60, 8.75)]

MED = [MARSEILLE, PORQUEROLLES]
COASTAL = [MARSEILLE, CASSIS, BANDOL, PORQUEROLLES]

AROME = "meteofrance_arome_france"
ICON = "icon_eu"
ECMWF = "ecmwf_ifs025"
GFS = "gfs_seamless"

# A boat that motors as soon as the sails drop under 5 kn, and a boat so slow
# under sail that it trips the light-wind warning. Both derive from a shipped
# polar so the grid stays realistic.
MOTOR_POLAR = dataclasses.replace(
    get_polar("cruiser_30ft"), motor_threshold_kn=5.0, motor_speed_kn=6.5
)
_BASE = get_polar("cruiser_30ft")
SLOW_POLAR = dataclasses.replace(
    _BASE,
    boat_speed_kn=tuple(tuple(v * 0.12 for v in row) for row in _BASE.boat_speed_kn),
)


class PrewarmingDeterministicAdapter(DeterministicMarineAdapter):
    """The deterministic adapter plus the batched prewarm hook.

    The engine probes for ``prewarm_batch`` before its per-segment gather, so
    that branch is only reached by adapters exposing it. Recording a report
    through this one proves the prewarm call does not perturb the numbers, and
    ``prewarm_calls`` lets the merged engine be checked for firing it exactly
    once per estimate, over the right window.
    """

    def __init__(self) -> None:
        super().__init__()
        self.prewarm_calls: list[tuple[int, datetime, datetime, tuple[str, ...]]] = []

    async def prewarm_batch(
        self,
        points: list[tuple[float, float]],
        start: datetime,
        end: datetime,
        models: list[str],
    ) -> None:
        self.prewarm_calls.append((len(points), start, end, tuple(models)))


class BlindModelAdapter(DeterministicMarineAdapter):
    """Deterministic weather, except some models see nothing at some points.

    ``blind`` maps a model slug to the indices of the route points where that
    model answers with an empty wind series, which is the shape of an
    off-coverage waypoint: AROME asked outside France answers 200 with nulls
    and ``_parse_wind`` drops those rows. ``blind_everywhere`` blinds a model
    on the whole route, which is how the full-route promotion branch is
    reached. Point indices follow the order the engine first asks for them,
    which is route order in both directions.
    """

    def __init__(
        self,
        blind: dict[str, set[int]] | None = None,
        blind_everywhere: tuple[str, ...] = (),
    ) -> None:
        super().__init__()
        self._blind = blind or {}
        self._blind_everywhere = blind_everywhere
        self._seen: list[tuple[float, float]] = []

    def _index_of(self, lat: float, lon: float) -> int:
        key = (round(lat, 6), round(lon, 6))
        if key not in self._seen:
            self._seen.append(key)
        return self._seen.index(key)

    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle:
        bundle = await super().fetch(lat, lon, start, end, models)
        idx = self._index_of(lat, lon)
        wind = dict(bundle.wind_by_model)
        for slug in list(wind):
            if slug in self._blind_everywhere or idx in self._blind.get(slug, set()):
                wind[slug] = WindSeries(model=slug, points=())
        return dataclasses.replace(bundle, wind_by_model=wind)


AdapterFactory = Callable[[], DeterministicMarineAdapter]


async def _forward(adapter_factory: AdapterFactory = DeterministicMarineAdapter, **kwargs):
    waypoints = kwargs.pop("waypoints")
    archetype = kwargs.pop("archetype")
    return await estimate_passage(
        waypoints, DEPARTURE, archetype, adapter=adapter_factory(), **kwargs
    )


async def _backward(adapter_factory: AdapterFactory = DeterministicMarineAdapter, **kwargs):
    waypoints = kwargs.pop("waypoints")
    archetype = kwargs.pop("archetype")
    plan = await estimate_passage_for_arrival(
        waypoints, ARRIVAL, archetype, adapter=adapter_factory(), **kwargs
    )
    assert plan.target_arrival == ARRIVAL
    assert plan.report.arrival_time == ARRIVAL
    return plan.report


# Each entry is (golden name, zero-argument coroutine factory). Every
# configuration runs in both directions so a merged engine cannot get one of
# the two right by luck.
CASES: list[tuple[str, Callable[[], object]]] = []


def _register(name: str, **kwargs) -> None:
    """Record the same configuration forward and backward."""
    frozen = dict(kwargs)
    CASES.append((f"{name}_forward", lambda: _forward(**frozen)))
    CASES.append((f"{name}_backward", lambda: _backward(**frozen)))


_register("med_cruiser30", waypoints=MED, archetype="cruiser_30ft")
_register("med_cruiser50", waypoints=MED, archetype="cruiser_50ft")
_register("med_catamaran", waypoints=MED, archetype="catamaran_40ft")
_register("med_racer", waypoints=MED, archetype="racer_cruiser")
_register("coastal_four_waypoints", waypoints=COASTAL, archetype="cruiser_40ft")
_register(
    "reaching_short_legs", waypoints=REACHING, archetype="cruiser_30ft", segment_length_nm=5.0
)
_register("wave_correction", waypoints=MED, archetype="cruiser_40ft", use_wave_correction=True)
_register(
    "motor_polar",
    waypoints=MED,
    archetype="cruiser_30ft",
    polar_override=MOTOR_POLAR,
    efficiency=0.55,
)
_register("light_wind_warning", waypoints=MED, archetype="cruiser_30ft", polar_override=SLOW_POLAR)
_register("sampling_cap_warning", waypoints=LONG_ROUTE, archetype="cruiser_40ft")
_register("pinned_layout_speed", waypoints=MED, archetype="cruiser_30ft", heuristic_speed_kn=4.0)
_register("efficiency_low", waypoints=MED, archetype="cruiser_30ft", efficiency=0.55)
_register(
    "prewarming_adapter",
    waypoints=COASTAL,
    archetype="cruiser_30ft",
    adapter_factory=PrewarmingDeterministicAdapter,
)
_register("auto_chain_arome", waypoints=MED, archetype="cruiser_30ft", model="auto")
_register(
    "fallback_full_route_swap",
    waypoints=COASTAL,
    archetype="cruiser_30ft",
    model="auto",
    adapter_factory=lambda: BlindModelAdapter(blind_everywhere=(AROME,)),
)
_register(
    "fallback_mixed_route",
    waypoints=COASTAL,
    archetype="cruiser_30ft",
    model="auto",
    adapter_factory=lambda: BlindModelAdapter(blind={AROME: {1, 2}}),
)
_register(
    "fallback_two_models_deep",
    waypoints=COASTAL,
    archetype="cruiser_30ft",
    model="auto",
    adapter_factory=lambda: BlindModelAdapter(blind_everywhere=(AROME,), blind={ICON: {0, 3}}),
)


def _serialise(report: PassageReport) -> bytes:
    """The bytes the shells would ship, plus a trailing newline for diffs."""
    body = json.dumps(passage_view(report), indent=2, ensure_ascii=False, sort_keys=False)
    return (body + "\n").encode()


def _first_field(want: dict, got: dict) -> str:
    for key in want:
        if key not in got:
            return f"{key} (missing)"
        if want[key] == got[key]:
            continue
        if key == "segments":
            for i, (a, b) in enumerate(zip(want[key], got[key], strict=False)):
                if a != b:
                    diff = {k: (a.get(k), b.get(k)) for k in a if a.get(k) != b.get(k)}
                    return f"segments[{i}] {diff}"
            return f"segments (length {len(want[key])} vs {len(got[key])})"
        return f"{key}: {want[key]!r} vs {got[key]!r}"
    return "none (extra keys only)"


def _assert_golden(name: str, payload: bytes) -> None:
    path = GOLDEN_DIR / name
    if REGENERATE:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        return
    if not path.is_file():
        raise AssertionError(
            f"missing golden {name}; run OPENWIND_REGENERATE_GOLDENS=1 pytest to record it"
        )
    recorded = path.read_bytes()
    if recorded == payload:
        return
    raise AssertionError(
        f"{name} differs from the recorded report.\n"
        f"  first differing field: {_first_field(json.loads(recorded), json.loads(payload))}\n"
        "The engine merge is a refactor: no number may move. If the change is "
        "intended, re-record with OPENWIND_REGENERATE_GOLDENS=1 and show the "
        "diff in the PR."
    )


@pytest.mark.parametrize("name,factory", CASES, ids=[c[0] for c in CASES])
def test_recorded_passage_report(name: str, factory) -> None:
    report = asyncio.run(factory())
    _assert_golden(f"passage_{name}.json", _serialise(report))


def test_forward_and_backward_agree_on_geometry() -> None:
    """The two directions sample the same route, so the geometry must match.

    Not a golden: an invariant the merge has to preserve by construction once
    both engines share one sampling pass. Durations legitimately differ (the
    two hit different weather), the route does not.
    """
    fwd = asyncio.run(_forward(waypoints=COASTAL, archetype="cruiser_40ft"))
    bwd = asyncio.run(_backward(waypoints=COASTAL, archetype="cruiser_40ft"))
    assert fwd.distance_nm == bwd.distance_nm
    assert [s.distance_nm for s in fwd.segments] == [s.distance_nm for s in bwd.segments]
    assert [s.bearing_deg for s in fwd.segments] == [s.bearing_deg for s in bwd.segments]
    assert [(s.start, s.end) for s in fwd.segments] == [(s.start, s.end) for s in bwd.segments]


def test_prewarm_fires_once_per_estimate_in_both_directions() -> None:
    """The batched prewarm is the whole point of the cache warm-up.

    A recorded report would not notice it disappearing (the deterministic
    adapter answers the same either way), so the call itself is asserted here,
    including the window it covers: forward it starts at the departure minus
    half the fetch window, backward it ends at the arrival plus half of it.
    """
    fwd_adapter = PrewarmingDeterministicAdapter()
    asyncio.run(
        _forward(waypoints=COASTAL, archetype="cruiser_30ft", adapter_factory=lambda: fwd_adapter)
    )
    assert len(fwd_adapter.prewarm_calls) == 1
    n_points, start, end, models = fwd_adapter.prewarm_calls[0]
    assert n_points >= 3
    assert models == (AROME,)
    assert start > DEPARTURE - WIND_FETCH_WINDOW
    assert start < end

    bwd_adapter = PrewarmingDeterministicAdapter()
    asyncio.run(
        _backward(waypoints=COASTAL, archetype="cruiser_30ft", adapter_factory=lambda: bwd_adapter)
    )
    assert len(bwd_adapter.prewarm_calls) == 1
    back_points, back_start, back_end, back_models = bwd_adapter.prewarm_calls[0]
    assert back_points == n_points
    assert back_models == (AROME,)
    assert back_start < back_end
    assert back_end < ARRIVAL + WIND_FETCH_WINDOW


def test_every_model_blind_raises_no_model_covered_in_both_directions() -> None:
    """Chain exhausted by null data, not by horizon: a 422, never a 500."""
    blind_all = (AROME, ICON, ECMWF, GFS)
    with pytest.raises(NoModelCoveredError):
        asyncio.run(
            _forward(
                waypoints=MED,
                archetype="cruiser_30ft",
                model="auto",
                adapter_factory=lambda: BlindModelAdapter(blind_everywhere=blind_all),
            )
        )
    with pytest.raises(NoModelCoveredError):
        asyncio.run(
            _backward(
                waypoints=MED,
                archetype="cruiser_30ft",
                model="auto",
                adapter_factory=lambda: BlindModelAdapter(blind_everywhere=blind_all),
            )
        )
