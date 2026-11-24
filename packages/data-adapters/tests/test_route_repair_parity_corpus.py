# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The corpus that keeps the Python and the TypeScript route repairs in step.

``packages/web/tests/fixtures/route-repair/parity.json`` holds what this
package answers for a set of drawn routes; the web app's own test asks its
TypeScript repair for the same answers. Here: the file is still what Python
answers. A change of the engine or of the shipped tiles fails this test
until ``scripts/build_route_parity_corpus.py`` is run again, and then the
web test says whether the TypeScript side still follows.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "packages/web/tests/fixtures/route-repair"

_spec = importlib.util.spec_from_file_location(
    "build_route_parity_corpus", ROOT / "scripts/build_route_parity_corpus.py"
)
assert _spec is not None and _spec.loader is not None
builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(builder)

# A sample: every kind of answer, short and long legs, a coarsened one. The
# whole corpus takes forty seconds, and the web test runs all of it.
SAMPLE = (
    "bench_r01",
    "bench_r06",
    "bench_r07",
    "bench_r20",
    "bench_r41",
    "brest_ouessant",
    "brest_stmalo",
    "bonifacio_portovecchio",
    "at_sea_unchanged",
    "departure_far_inland",
    "waypoint_ashore",
    "three_legs_one_retraced",
    "outside_the_archive",
)


@pytest.fixture(scope="module")
def corpus() -> dict:
    return json.loads((FIXTURES / "parity.json").read_text())


def test_the_corpus_covers_every_drawn_route(corpus):
    routes = json.loads((FIXTURES / "routes.json").read_text())
    assert {name: case["drawn"] for name, case in corpus["cases"].items()} == routes
    kinds = {case["outcome"]["kind"] for case in corpus["cases"].values()}
    assert kinds == {"repaired", "refused", "unchanged", "uncovered"}


def test_python_still_answers_what_the_corpus_says(corpus):
    routes = {name: corpus["cases"][name]["drawn"] for name in SAMPLE}
    fresh = builder.compute(routes)
    assert fresh["archive"] == corpus["archive"], (
        "the shipped land tiles changed: run scripts/build_route_parity_corpus.py"
    )
    for name in SAMPLE:
        assert fresh["cases"][name]["outcome"] == corpus["cases"][name]["outcome"], name
