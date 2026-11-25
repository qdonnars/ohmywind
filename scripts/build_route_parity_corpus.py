#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
"""Write the corpus that keeps the two route repairs in step.

The route repair exists twice: in Python for the MCP server and the REST
API (``openwind_data.routing.auto_route``), in TypeScript for the web app
(``packages/web/src/plan/repair``). Both must return the same route. This
script runs the Python one over a set of drawn routes, on the land tiles
shipped in the package, and writes what it answers to
``packages/web/tests/fixtures/route-repair/parity.json``.

Two tests read that file: ``tests/route-repair-parity.test.ts`` asks the TypeScript
repair for the same answers, and ``test_route_repair_parity_corpus.py``
checks that the Python repair still gives them. Change the engine on one
side and its own test passes while the other's fails; change the tiles and
both fail until this script is run again:

    cd packages/data-adapters && uv run python ../../scripts/build_route_parity_corpus.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from openwind_data.routing.auto_route.repair import (
    BUNDLED_GRIDS_DIR,
    FineLand,
    Repair,
    repair_route,
)
from openwind_data.routing.geometry import Point

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "packages/web/tests/fixtures/route-repair/parity.json"
ROUTES = ROOT / "packages/web/tests/fixtures/route-repair/routes.json"


def outcome(rep: Repair | None) -> dict:
    """What a caller sees of a repair, in the web app's terms."""
    if rep is None:
        return {"kind": "uncovered"}
    if rep.refusal:
        return {"kind": "refused"}
    if not rep.changes:
        return {"kind": "unchanged"}
    return {
        "kind": "repaired",
        "points": [[p.lat, p.lon] for p in rep.points],
        "added": rep.added,
        "notices": [{"code": n.code, "params": n.params} for n in rep.notices],
    }


def compute(routes: dict[str, list[list[float]]]) -> dict:
    fine = FineLand.from_directory(BUNDLED_GRIDS_DIR)
    assert fine.world is not None
    cases = {}
    for name, raw in routes.items():
        rep = repair_route(fine, [Point(lat, lon) for lat, lon in raw])
        cases[name] = {"drawn": raw, "outcome": outcome(rep)}
    return {"archive": fine.world.tiles.id, "cases": cases}


def main() -> int:
    corpus = compute(json.loads(ROUTES.read_text()))
    OUT.write_text(json.dumps(corpus, indent=1) + "\n")
    kinds: dict[str, int] = {}
    for case in corpus["cases"].values():
        kinds[case["outcome"]["kind"]] = kinds.get(case["outcome"]["kind"], 0) + 1
    print(
        f"{OUT}: {len(corpus['cases'])} routes on archive {corpus['archive']}, {kinds}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
