# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The flood and the ebb the right way round, on open atlases, in every CI run.

A few real cells of four atlases built by our own builders, committed under
``fixtures/atlas_open`` (licences and attributions in its README):

- BSH, the Elbe off the Kugelbake and off Otterndorf (CC BY 4.0, served);
- NorKyst, the entrance of the Trondheimsfjord at Agdenes (CC BY 4.0, in the
  dataset but withheld by the serving policy: checked for its builder, the
  one that regrids a polar stereographic model);
- NOAA GoMOFS, Minas Passage in the Bay of Fundy (public domain, not in the
  dataset: checked for its builder, the one that rotates ROMS grid velocities
  to east and north).

Each pass is read through the three doors a skipper's answer goes through:
``apply_atlases`` (``get_tidal_stream``), ``fetch`` on the composed adapter
(what ``plan_passage`` samples), and ``estimate_passage`` itself, where the
current is projected on the course and a sign error would turn a fair tide
into a foul one. Truth, timing and tolerance: ``tidal_truth``.
"""

from __future__ import annotations

import pytest

from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.router import CompositeMarineAdapter, compose_marine_adapter
from openwind_data.currents.serving_policy import WITHHELD_ATLASES
from tests.currents.tidal_truth import (
    OPEN_FIXTURE_DIR,
    OPEN_FIXTURE_PASSES,
    Pass,
    Phase,
    StubUpstream,
    angular_distance,
    engine_along_track,
    stream_by_apply_atlases,
    stream_by_fetch,
)

_CASES = [
    pytest.param(p, ph, id=f"{p.key}-{ph.label}") for p in OPEN_FIXTURE_PASSES for ph in p.phases
]


def _adapter(wind_from_deg: float = 0.0) -> CompositeMarineAdapter:
    # Every fixture atlas, NorKyst included: the serving policy is checked
    # on its own below, the builders here.
    marc = MarcAtlasRegistry.from_directory(OPEN_FIXTURE_DIR, withheld=frozenset())
    adapter = compose_marine_adapter(StubUpstream(wind_from_deg=wind_from_deg), marc, None)
    assert isinstance(adapter, CompositeMarineAdapter)
    return adapter


def _label_of(pass_: Pass) -> str:
    marc = MarcAtlasRegistry.from_directory(OPEN_FIXTURE_DIR, withheld=frozenset())
    atlas = marc.atlas_named(pass_.fixture_atlas or "")
    assert atlas is not None, f"fixture atlas {pass_.fixture_atlas} missing"
    return atlas.source_label


def test_every_fixture_atlas_is_on_disk() -> None:
    marc = MarcAtlasRegistry.from_directory(OPEN_FIXTURE_DIR, withheld=frozenset())
    assert {a.name for a in marc.atlases} == {p.fixture_atlas for p in OPEN_FIXTURE_PASSES}


def test_norkyst_is_withheld_by_the_serving_policy() -> None:
    """The Agdenes case tests a builder, not something the cascade serves today.

    If NorKyst comes back into the cascade, this fails on purpose: the case
    then becomes a served pass and its docstring above must say so.
    """
    assert "NORKYST_TRONDELAG" in WITHHELD_ATLASES
    served = MarcAtlasRegistry.from_directory(OPEN_FIXTURE_DIR)
    assert "NORKYST_TRONDELAG" not in {a.name for a in served.atlases}


@pytest.mark.parametrize(("pass_", "phase"), _CASES)
def test_direction_through_apply_atlases(pass_: Pass, phase: Phase) -> None:
    result = stream_by_apply_atlases(_adapter(), pass_, phase)
    assert set(result.sources) == {_label_of(pass_)}, result.summary()
    failures = result.failures(pass_.tolerance_deg, pass_.min_speed_kn)
    assert not failures, (
        f"{pass_.name}, {phase.label}: the stream does not set the expected way.\n"
        f"{result.summary()}\nTruth: {pass_.truth}\n  " + "\n  ".join(failures)
    )


@pytest.mark.parametrize(("pass_", "phase"), _CASES)
async def test_direction_through_fetch(pass_: Pass, phase: Phase) -> None:
    result = await stream_by_fetch(_adapter(), pass_, phase)
    failures = result.failures(pass_.tolerance_deg, pass_.min_speed_kn)
    assert not failures, f"{result.summary()}\nTruth: {pass_.truth}\n  " + "\n  ".join(failures)


@pytest.mark.parametrize(("pass_", "phase"), _CASES)
async def test_engine_carries_the_boat_with_the_flood(pass_: Pass, phase: Phase) -> None:
    """A leg laid along the flood is helped at mid-flood and set back at mid-ebb."""
    course = pass_.flood.expected_to_deg
    adapter = _adapter(wind_from_deg=(course + 90.0) % 360.0)
    samples = await engine_along_track(adapter, pass_, phase, course)
    helped = phase is pass_.flood
    for s in samples:
        assert s.along_kn is not None, f"{pass_.name} {s.time}: no current in the plan ({s.source})"
        assert s.direction_to_deg is not None
        assert angular_distance(s.direction_to_deg, phase.expected_to_deg) <= pass_.tolerance_deg
        if helped:
            assert s.along_kn > 0, f"{pass_.name} {s.time}: flood against the boat ({s})"
        else:
            assert s.along_kn < 0, f"{pass_.name} {s.time}: ebb with the boat ({s})"
