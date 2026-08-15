# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Coverage for the sweep response assembly in ``_api_passage``.

Written because the ``target_eta`` filtering branch had no test at all: a stray
``timedelta`` reference in it survived the whole suite and would only have
raised NameError in production, on the one request that sets ``target_eta``.
The engine itself is stubbed out — what is under test here is the shell.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
from datetime import UTC, datetime, timedelta

import pytest

_APP_PATH = (pathlib.Path(__file__).parents[1] / "app.py").resolve()
_spec = importlib.util.spec_from_file_location("hf_app_sweep", _APP_PATH)
app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(app)

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
MARSEILLE = [43.30, 5.35]
PORQUEROLLES = [43.00, 6.20]


class _FakeRequest:
    def __init__(self, body: dict) -> None:
        self._body = body

    async def json(self) -> dict:
        return self._body


def _sweep_body(**extra) -> dict:
    body = {
        "waypoints": [MARSEILLE, PORQUEROLLES],
        "departure": DEPARTURE.isoformat(),
        "latest_departure": (DEPARTURE + timedelta(hours=6)).isoformat(),
        "sweep_interval_hours": 3,
        "archetype": "cruiser_40ft",
    }
    body.update(extra)
    return body


def _payload(resp) -> dict:
    return json.loads(bytes(resp.body))


@pytest.fixture
def no_windows(monkeypatch):
    """Engine returns nothing, so the response assembly runs on its own."""

    async def _stub(*args, **kwargs):
        return []

    monkeypatch.setattr(app, "estimate_passage_windows", _stub)


@pytest.mark.asyncio
async def test_sweep_without_target_eta_returns_multi_window(no_windows) -> None:
    resp = await app._api_passage(_FakeRequest(_sweep_body()))
    assert resp.status_code == 200
    body = _payload(resp)
    assert body["mode"] == "multi_window"
    assert body["sweep"]["interval_hours"] == 3


@pytest.mark.asyncio
async def test_sweep_with_target_eta_reaches_the_filter(no_windows) -> None:
    # The regression: this branch is the only one that touches timedelta.
    target = (DEPARTURE + timedelta(hours=10)).isoformat()
    resp = await app._api_passage(_FakeRequest(_sweep_body(target_eta=target)))
    assert resp.status_code == 200
    body = _payload(resp)
    assert any("target_eta" in w for w in body["meta_warnings"])


@pytest.mark.asyncio
async def test_invalid_target_eta_returns_422() -> None:
    resp = await app._api_passage(_FakeRequest(_sweep_body(target_eta="not-a-date")))
    assert resp.status_code == 422
    assert "target_eta" in _payload(resp)["error"]


@pytest.mark.asyncio
async def test_skipped_windows_surface_a_meta_warning(monkeypatch) -> None:
    # estimate_passage_windows is partial-tolerant: it drops windows past the
    # forecast horizon. The shell must tell the user some were dropped.
    async def _stub(*args, **kwargs):
        return []

    monkeypatch.setattr(app, "estimate_passage_windows", _stub)
    resp = await app._api_passage(_FakeRequest(_sweep_body()))
    warnings = _payload(resp)["meta_warnings"]
    assert any("ignorée" in w for w in warnings)
