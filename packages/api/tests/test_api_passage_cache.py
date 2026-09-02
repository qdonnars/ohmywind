# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Endpoint tests for the client-supplied forecast_cache wiring.

The handlers are driven with a minimal fake Request rather than through the
ASGI stack: what is under test is which adapter reaches the engine, and a
TestClient would only add a serialisation round-trip between the assertion
and the thing asserted.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from openwind_data.adapters.cache_backed import CacheBackedAdapter
from openwind_data.routing.passage import NoModelCoveredError

from openwind_api.routes import passage as passage_routes

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
MARSEILLE = (43.30, 5.35)
PORQUEROLLES = (43.00, 6.20)


class _FakeRequest:
    def __init__(self, body: dict) -> None:
        self._body = body

    async def json(self) -> dict:
        return self._body


def _resp_json(resp) -> dict:
    return json.loads(bytes(resp.body))


def _corridor_cache(*, with_arome: bool = True) -> dict:
    """Constant 10 kn northerly along Marseille->Porquerolles, axis 04:00..18:00."""
    t0 = datetime(2026, 5, 1, 4, 0, tzinfo=UTC)
    times_ms = [int((t0 + timedelta(hours=h)).timestamp() * 1000) for h in range(15)]
    n = len(times_ms)

    def wind() -> dict:
        block = {
            "icon_eu": {"speed_kn": [10.0] * n, "direction_deg": [0.0] * n, "gust_kn": [None] * n}
        }
        if with_arome:
            block["meteofrance_arome_france"] = {
                "speed_kn": [10.0] * n,
                "direction_deg": [0.0] * n,
                "gust_kn": [None] * n,
            }
        return block

    def sea() -> dict:
        return {
            "wave_height_m": [0.4] * n,
            "wave_period_s": [4.0] * n,
            "wave_direction_deg": [0.0] * n,
            "current_speed_kn": [0.1] * n,
            "current_direction_to_deg": [90.0] * n,
            "tide_height_m": [0.0] * n,
            "current_source": "openmeteo_smoc",
        }

    return {
        "version": 1,
        "models": ["meteofrance_arome_france", "icon_eu"],
        "times_ms": times_ms,
        "points": [
            {"lat": lat, "lon": lon, "wind_by_model": wind(), "sea": sea()}
            for (lat, lon) in (MARSEILLE, PORQUEROLLES)
        ],
    }


def _single_body(**extra) -> dict:
    body = {
        "waypoints": [list(MARSEILLE), list(PORQUEROLLES)],
        "departure": DEPARTURE.isoformat(),
        "archetype": "cruiser_40ft",
    }
    body.update(extra)
    return body


# --------------------------------------------------------------- full path


@pytest.mark.asyncio
async def test_single_with_cache_returns_200_from_cache(monkeypatch) -> None:
    # Guard: if the handler ever instantiates the live adapter, fail loudly.
    import httpx

    def _boom(*a, **k):
        raise AssertionError("forecast_cache path must not hit Open-Meteo")

    monkeypatch.setattr(httpx.AsyncClient, "get", _boom)

    resp = await passage_routes.api_passage(
        _FakeRequest(_single_body(forecast_cache=_corridor_cache()))
    )
    assert resp.status_code == 200
    payload = _resp_json(resp)
    segments = payload["passage"]["segments"]
    assert segments and all(seg["tws_kn"] == 10.0 for seg in segments)


@pytest.mark.asyncio
async def test_malformed_cache_returns_422(monkeypatch) -> None:
    resp = await passage_routes.api_passage(
        _FakeRequest(
            _single_body(
                forecast_cache={"version": 999, "models": [], "times_ms": [], "points": []}
            )
        )
    )
    assert resp.status_code == 422
    assert "forecast_cache" in _resp_json(resp)["error"]


@pytest.mark.asyncio
async def test_oversized_cache_returns_422_naming_the_ceiling() -> None:
    """A payload the domain refuses must surface as 422, not 500.

    The ceilings live in ``cache_backed.from_payload`` (that is where the
    payload is parsed and where the cost is), and reach the client through the
    same ValueError channel as every other shape error. What this pins is that
    the message says which ceiling was hit: "invalid forecast_cache" alone
    would send a caller hunting for a typo that is not there.
    """
    from openwind_data.adapters.cache_backed import MAX_CACHE_POINTS

    cache = _corridor_cache()
    origin = cache["points"][0]
    cache["points"] = [
        {**origin, "lat": origin["lat"] + i / 1000} for i in range(MAX_CACHE_POINTS + 1)
    ]

    resp = await passage_routes.api_passage(_FakeRequest(_single_body(forecast_cache=cache)))
    assert resp.status_code == 422
    error = _resp_json(resp)["error"]
    assert error.startswith("invalid forecast_cache: ")
    assert f"at most {MAX_CACHE_POINTS} accepted" in error


# --------------------------------------------------------------- wiring capture


@pytest.mark.asyncio
async def test_single_passes_cache_adapter(monkeypatch) -> None:
    captured: dict = {}

    async def _stub(*args, **kwargs):
        captured["adapter"] = kwargs.get("adapter")
        captured["model_chain"] = kwargs.get("model_chain")
        raise NoModelCoveredError("stop here")  # short-circuit after capture

    monkeypatch.setattr(passage_routes, "estimate_passage", _stub)

    # With cache -> CacheBackedAdapter + chain from cache models.
    await passage_routes.api_passage(_FakeRequest(_single_body(forecast_cache=_corridor_cache())))
    assert isinstance(captured["adapter"], CacheBackedAdapter)
    assert captured["model_chain"] == ("meteofrance_arome_france", "icon_eu")

    # Without cache -> adapter None (MCP/live path unchanged).
    captured.clear()
    await passage_routes.api_passage(_FakeRequest(_single_body()))
    assert captured["adapter"] is None


@pytest.mark.asyncio
async def test_sweep_passes_cache_adapter(monkeypatch) -> None:
    captured: dict = {}

    async def _stub(*args, **kwargs):
        captured["adapter"] = kwargs.get("adapter")
        return []

    monkeypatch.setattr(passage_routes, "estimate_passage_windows", _stub)
    body = _single_body(
        forecast_cache=_corridor_cache(),
        latest_departure=(DEPARTURE + timedelta(hours=6)).isoformat(),
        sweep_interval_hours=3,
    )
    await passage_routes.api_passage(_FakeRequest(body))
    assert isinstance(captured["adapter"], CacheBackedAdapter)


@pytest.mark.asyncio
async def test_by_eta_passes_cache_adapter(monkeypatch) -> None:
    captured: dict = {}

    async def _stub(*args, **kwargs):
        captured["adapter"] = kwargs.get("adapter")
        raise NoModelCoveredError("stop here")

    monkeypatch.setattr(passage_routes, "estimate_passage_for_arrival", _stub)
    body = {
        "waypoints": [list(MARSEILLE), list(PORQUEROLLES)],
        "target_arrival": (DEPARTURE + timedelta(hours=8)).isoformat(),
        "archetype": "cruiser_40ft",
        "forecast_cache": _corridor_cache(),
    }
    await passage_routes.api_passage_by_eta(_FakeRequest(body))
    assert isinstance(captured["adapter"], CacheBackedAdapter)
