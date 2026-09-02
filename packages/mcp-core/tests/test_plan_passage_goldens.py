# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Recorded ``plan_passage`` results, compared byte for byte.

The MCP half of the safety net under the API extraction (plan lot 2). The REST
shell and this one build their payloads from the same report with two separate
serialisers, and PR 2.1 replaces both with one shared view; these goldens are
what says the replacement changed nothing an LLM host can observe.

Driven by the same ``DeterministicMarineAdapter`` as
``api/tests/test_rest_goldens.py``, over the same route and departure, so
the ``passage`` block of a golden here and of a golden there describe the same
sailing. They are not identical files: each shell adds its own fields, REST
``forecast_updated_at`` and MCP ``openwind_url`` / ``disclaimer``, and that
difference is exactly what PR 2.1 has to preserve.

Regenerate deliberately::

    OPENWIND_REGENERATE_GOLDENS=1 uv run pytest tests/test_plan_passage_goldens.py
"""

from __future__ import annotations

import json
import os
import pathlib
from datetime import UTC, datetime, timedelta

import pytest
from openwind_data.testing import DeterministicMarineAdapter

from openwind_mcp_core import build_server
from openwind_mcp_core import render as render_module

GOLDEN_DIR = pathlib.Path(__file__).parent / "goldens"
REGENERATE = os.environ.get("OPENWIND_REGENERATE_GOLDENS") == "1"

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
WAYPOINTS = [{"lat": 43.29, "lon": 5.37}, {"lat": 43.00, "lon": 6.20}]


def _render(payload: dict) -> bytes:
    """Serialise the way Starlette's ``JSONResponse`` does.

    Same separators, same ``ensure_ascii=False``, same refusal of NaN. The
    point is that a golden recorded here can be compared with a REST golden
    without a formatting difference standing in for a contract difference.
    """
    return json.dumps(
        payload, ensure_ascii=False, allow_nan=False, indent=None, separators=(",", ":")
    ).encode("utf-8")


def _assert_golden(name: str, payload: bytes) -> None:
    path = GOLDEN_DIR / name
    if REGENERATE:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    if not path.is_file():
        raise AssertionError(
            f"missing golden {name}; run OPENWIND_REGENERATE_GOLDENS=1 pytest to record it"
        )
    recorded = path.read_bytes()
    assert recorded == payload, (
        f"{name} differs from the recorded tool result "
        f"({len(recorded)} bytes recorded, {len(payload)} produced). "
        "If the change is intended, re-record with OPENWIND_REGENERATE_GOLDENS=1 "
        "and show the diff in the PR."
    )


@pytest.fixture(autouse=True)
def production_web_base(monkeypatch):
    """Pin the deep-link host.

    ``OHMYWIND_WEB_BASE`` is set on the dev Space and may well be exported in
    a developer's shell; without this the goldens would record whatever the
    machine happens to be pointing at.
    """
    monkeypatch.setattr(render_module, "WEB_BASE", render_module.DEFAULT_WEB_BASE)


@pytest.fixture
def server():
    return build_server(adapter=DeterministicMarineAdapter())


async def _structured(server, args: dict) -> dict:
    result = await server.call_tool("plan_passage", args)
    return result[1] if isinstance(result, tuple) else result


async def test_single_mode(server) -> None:
    payload = await _structured(
        server,
        {
            "waypoints": WAYPOINTS,
            "departure": DEPARTURE.isoformat(),
            "archetype": "cruiser_30ft",
        },
    )
    _assert_golden("plan_passage_single.json", _render(payload))


async def test_sweep_mode(server) -> None:
    payload = await _structured(
        server,
        {
            "waypoints": WAYPOINTS,
            "departure": DEPARTURE.isoformat(),
            "latest_departure": (DEPARTURE + timedelta(hours=5)).isoformat(),
            "sweep_interval_hours": 1,
            "archetype": "cruiser_30ft",
        },
    )
    assert payload["sweep"]["window_count"] == 6
    _assert_golden("plan_passage_sweep.json", _render(payload))


async def test_sweep_mode_filtered_by_target_eta(server) -> None:
    """Same filter as REST, same tolerance, same wording of its warning."""
    payload = await _structured(
        server,
        {
            "waypoints": WAYPOINTS,
            "departure": DEPARTURE.isoformat(),
            "latest_departure": (DEPARTURE + timedelta(hours=5)).isoformat(),
            "sweep_interval_hours": 1,
            "target_eta": datetime(2026, 5, 1, 16, 30, tzinfo=UTC).isoformat(),
            "archetype": "cruiser_30ft",
        },
    )
    assert 0 < payload["sweep"]["window_count"] < 6
    assert payload["meta_warnings"] == []
    _assert_golden("plan_passage_sweep_target_eta.json", _render(payload))


async def test_the_two_shells_describe_the_same_passage(server) -> None:
    """The MCP report and the REST report agree, field by field.

    Not a byte comparison: the two serialisers reach the same values by
    different routes (``asdict`` here, a hand-written walk there) and the REST
    shell adds fields of its own. What must hold is that the passage itself is
    the same object seen twice, which is the premise of merging the two into
    one view in PR 2.1.
    """
    payload = await _structured(
        server,
        {
            "waypoints": WAYPOINTS,
            "departure": DEPARTURE.isoformat(),
            "archetype": "cruiser_30ft",
        },
    )
    rest = json.loads(
        (
            pathlib.Path(__file__).parents[2] / "api" / "tests" / "goldens" / "passage_single.json"
        ).read_bytes()
    )
    assert payload["passage"] == rest["passage"]
    assert payload["complexity"] == rest["complexity"]
