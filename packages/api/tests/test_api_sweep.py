# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Coverage for the sweep response assembly in ``_api_passage``.

Written because the ``target_eta`` filtering branch had no test at all: a stray
``timedelta`` reference in it survived the whole suite and would only have
raised NameError in production, on the one request that sets ``target_eta``.
The engine itself is stubbed out — what is under test here is the shell.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from openwind_data import views

from openwind_api.routes import passage as passage_routes

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

    monkeypatch.setattr(passage_routes, "estimate_passage_windows", _stub)


@pytest.mark.asyncio
async def test_sweep_without_target_eta_returns_multi_window(no_windows) -> None:
    resp = await passage_routes.api_passage(_FakeRequest(_sweep_body()))
    assert resp.status_code == 200
    body = _payload(resp)
    assert body["mode"] == "multi_window"
    assert body["sweep"]["interval_hours"] == 3


@pytest.mark.asyncio
async def test_sweep_with_target_eta_reaches_the_filter(no_windows) -> None:
    # The regression: this branch is the only one that touches timedelta.
    target = (DEPARTURE + timedelta(hours=10)).isoformat()
    resp = await passage_routes.api_passage(_FakeRequest(_sweep_body(target_eta=target)))
    assert resp.status_code == 200
    body = _payload(resp)
    assert any("target_eta" in w for w in body["meta_warnings"])


@pytest.mark.asyncio
async def test_invalid_target_eta_returns_422() -> None:
    resp = await passage_routes.api_passage(_FakeRequest(_sweep_body(target_eta="not-a-date")))
    assert resp.status_code == 422
    assert "target_eta" in _payload(resp)["error"]


@pytest.mark.asyncio
async def test_skipped_windows_surface_a_meta_warning(monkeypatch) -> None:
    # estimate_passage_windows is partial-tolerant: it drops windows past the
    # forecast horizon. The shell must tell the user some were dropped.
    async def _stub(*args, **kwargs):
        return []

    monkeypatch.setattr(passage_routes, "estimate_passage_windows", _stub)
    resp = await passage_routes.api_passage(_FakeRequest(_sweep_body()))
    warnings = _payload(resp)["meta_warnings"]
    assert any("ignorée" in w for w in warnings)


@pytest.fixture
def widened_sweep(monkeypatch):
    """Engine returns a sweep it deliberately ran coarser than requested.

    29 segments over 13 days at 1 h would be ~9100 simulations, past the
    budget, so the engine widens to 2 h and returns half as many windows. The
    shell must read that back instead of counting against the request.
    """
    n_segments, interval_h = 29, 2
    span_h = 13 * 24
    reports = [
        SimpleNamespace(
            departure_time=DEPARTURE + timedelta(hours=i * interval_h),
            arrival_time=DEPARTURE + timedelta(hours=i * interval_h + 8),
            duration_h=8.0,
            distance_nm=41.4,
            warnings=[],
            segments=[object()] * n_segments,
        )
        for i in range(int(span_h / interval_h) + 1)
    ]

    async def _stub(*args, **kwargs):
        return reports

    monkeypatch.setattr(passage_routes, "estimate_passage_windows", _stub)
    monkeypatch.setattr(
        passage_routes,
        "score_complexity",
        lambda r, **k: SimpleNamespace(
            level=2, label="modéré", tws_max_kn=14.0, rationale="stub", warnings=[]
        ),
    )
    # The serialisers now live in ``openwind_data.views``, shared with the MCP
    # shell; the stub reports here are namespaces the real ones cannot walk.
    monkeypatch.setattr(views, "build_conditions_summary", lambda r: {})
    monkeypatch.setattr(views, "to_json", lambda o: {})
    return reports


@pytest.mark.asyncio
async def test_widened_sweep_advertises_the_interval_it_ran(widened_sweep) -> None:
    body = _payload(
        await passage_routes.api_passage(
            _FakeRequest(
                _sweep_body(
                    latest_departure=(DEPARTURE + timedelta(days=13)).isoformat(),
                    sweep_interval_hours=1,
                )
            )
        )
    )
    assert body["sweep"]["interval_hours"] == 2
    assert any("élargi" in w for w in body["meta_warnings"])


@pytest.mark.asyncio
async def test_widened_sweep_does_not_report_phantom_dropped_windows(widened_sweep) -> None:
    """The windows never run are not windows lost to a short forecast horizon.

    Counting the expected total against the requested 1 h interval would
    invent 156 of them and tell the user the forecast ran out.
    """
    body = _payload(
        await passage_routes.api_passage(
            _FakeRequest(
                _sweep_body(
                    latest_departure=(DEPARTURE + timedelta(days=13)).isoformat(),
                    sweep_interval_hours=1,
                )
            )
        )
    )
    assert not any("ignorée" in w for w in body["meta_warnings"])
