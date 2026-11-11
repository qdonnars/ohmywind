# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The flood and the ebb the right way round at the French passes, on the served atlases.

SHOM C2D and MARC PREVIMER answer at the Raz de Sein, the Fromveur, the
Goulet de Brest, the Chenal du Four, the Raz Blanchard and the Golfe du
Morbihan. Neither may be redistributed, so nothing of them is committed: this
suite reads the private dataset from ``MARC_ATLAS_DIR`` (and ``SHOM_C2D_DIR``,
defaulting to it), the variables the server reads, and skips without them
(see ``real_atlas``). The CI job that downloads the files listed in
``fixtures/real_atlas_patterns.txt`` runs it with the skip turned into a
failure.

The cascade is composed exactly as the server composes it
(``compose_marine_adapter``, default serving policy) and read through the
three doors of ``test_direction_open``. Truth, timing and tolerance:
``tidal_truth``.
"""

from __future__ import annotations

import pytest

from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.router import CompositeMarineAdapter, compose_marine_adapter
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry
from tests.currents import real_atlas
from tests.currents.tidal_truth import (
    REAL_ATLAS_PASSES,
    Pass,
    Phase,
    StubUpstream,
    angular_distance,
    engine_along_track,
    stream_by_apply_atlases,
    stream_by_fetch,
)

pytestmark = pytest.mark.real_atlas

_CASES = [
    pytest.param(p, ph, id=f"{p.key}-{ph.label}") for p in REAL_ATLAS_PASSES for ph in p.phases
]


@pytest.fixture(scope="module")
def registries() -> tuple[MarcAtlasRegistry, ShomC2dRegistry]:
    marc = MarcAtlasRegistry.from_directory(real_atlas.marc_dir())
    shom = ShomC2dRegistry.from_directory(real_atlas.shom_dir())
    if not marc.atlases:
        message = "no atlas under MARC_ATLAS_DIR"
        if real_atlas.required():
            pytest.fail(message)
        pytest.skip(message)
    return marc, shom


def _adapter(registries, wind_from_deg: float = 0.0) -> CompositeMarineAdapter:
    marc, shom = registries
    adapter = compose_marine_adapter(StubUpstream(wind_from_deg=wind_from_deg), marc, shom)
    assert isinstance(adapter, CompositeMarineAdapter)
    return adapter


@pytest.mark.parametrize(("pass_", "phase"), _CASES)
def test_direction_through_apply_atlases(registries, pass_: Pass, phase: Phase) -> None:
    result = stream_by_apply_atlases(_adapter(registries), pass_, phase)
    print(result.summary())
    failures = result.failures(pass_.tolerance_deg, pass_.min_speed_kn)
    assert not failures, (
        f"{pass_.name}, {phase.label}: the stream does not set the expected way.\n"
        f"{result.summary()}\nTruth: {pass_.truth}\n  " + "\n  ".join(failures)
    )


@pytest.mark.parametrize(("pass_", "phase"), _CASES)
async def test_direction_through_fetch(registries, pass_: Pass, phase: Phase) -> None:
    result = await stream_by_fetch(_adapter(registries), pass_, phase)
    failures = result.failures(pass_.tolerance_deg, pass_.min_speed_kn)
    assert not failures, f"{result.summary()}\nTruth: {pass_.truth}\n  " + "\n  ".join(failures)


@pytest.mark.parametrize(("pass_", "phase"), _CASES)
async def test_engine_carries_the_boat_with_the_flood(
    registries, pass_: Pass, phase: Phase
) -> None:
    course = pass_.flood.expected_to_deg
    adapter = _adapter(registries, wind_from_deg=(course + 90.0) % 360.0)
    samples = await engine_along_track(adapter, pass_, phase, course)
    helped = phase is pass_.flood
    for s in samples:
        assert s.along_kn is not None, f"{pass_.name} {s.time}: no current in the plan ({s.source})"
        assert s.direction_to_deg is not None
        assert angular_distance(s.direction_to_deg, phase.expected_to_deg) <= pass_.tolerance_deg, s
        if helped:
            assert s.along_kn > 0, f"{pass_.name} {s.time}: flood against the boat ({s})"
        else:
            assert s.along_kn < 0, f"{pass_.name} {s.time}: ebb with the boat ({s})"
