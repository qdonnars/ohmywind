"""Endpoint tests for the client-supplied forecast_cache wiring in app.py.

hf-space has no pyproject (it ships via Docker), so we load app.py by path and
drive the handlers with a minimal fake Request. Run from the mcp-core worktree
venv, which resolves the worktree's editable openwind_data (with cache_backed):

    cd packages/mcp-core && uv run --no-active python -m pytest \
        ../hf-space/tests/test_api_passage_cache.py
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
from datetime import UTC, datetime, timedelta

import pytest

_APP_PATH = (pathlib.Path(__file__).parents[1] / "app.py").resolve()
_spec = importlib.util.spec_from_file_location("hf_app", _APP_PATH)
app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(app)

from openwind_data.adapters.cache_backed import CacheBackedAdapter  # noqa: E402

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

    resp = await app._api_passage(_FakeRequest(_single_body(forecast_cache=_corridor_cache())))
    assert resp.status_code == 200
    payload = _resp_json(resp)
    segments = payload["passage"]["segments"]
    assert segments and all(seg["tws_kn"] == 10.0 for seg in segments)


@pytest.mark.asyncio
async def test_malformed_cache_returns_422(monkeypatch) -> None:
    resp = await app._api_passage(
        _FakeRequest(
            _single_body(
                forecast_cache={"version": 999, "models": [], "times_ms": [], "points": []}
            )
        )
    )
    assert resp.status_code == 422
    assert "forecast_cache" in _resp_json(resp)["error"]


# --------------------------------------------------------------- wiring capture


@pytest.mark.asyncio
async def test_single_passes_cache_adapter(monkeypatch) -> None:
    captured: dict = {}

    async def _stub(*args, **kwargs):
        captured["adapter"] = kwargs.get("adapter")
        captured["model_chain"] = kwargs.get("model_chain")
        raise app.NoModelCoveredError("stop here")  # short-circuit after capture

    monkeypatch.setattr(app, "estimate_passage", _stub)

    # With cache -> CacheBackedAdapter + chain from cache models.
    await app._api_passage(_FakeRequest(_single_body(forecast_cache=_corridor_cache())))
    assert isinstance(captured["adapter"], CacheBackedAdapter)
    assert captured["model_chain"] == ("meteofrance_arome_france", "icon_eu")

    # Without cache -> adapter None (MCP/live path unchanged).
    captured.clear()
    await app._api_passage(_FakeRequest(_single_body()))
    assert captured["adapter"] is None


@pytest.mark.asyncio
async def test_sweep_passes_cache_adapter(monkeypatch) -> None:
    captured: dict = {}

    async def _stub(*args, **kwargs):
        captured["adapter"] = kwargs.get("adapter")
        return []

    monkeypatch.setattr(app, "estimate_passage_windows", _stub)
    body = _single_body(
        forecast_cache=_corridor_cache(),
        latest_departure=(DEPARTURE + timedelta(hours=6)).isoformat(),
        sweep_interval_hours=3,
    )
    await app._api_passage(_FakeRequest(body))
    assert isinstance(captured["adapter"], CacheBackedAdapter)


@pytest.mark.asyncio
async def test_by_eta_passes_cache_adapter(monkeypatch) -> None:
    captured: dict = {}

    async def _stub(*args, **kwargs):
        captured["adapter"] = kwargs.get("adapter")
        raise app.NoModelCoveredError("stop here")

    monkeypatch.setattr(app, "estimate_passage_for_arrival", _stub)
    body = {
        "waypoints": [list(MARSEILLE), list(PORQUEROLLES)],
        "target_arrival": (DEPARTURE + timedelta(hours=8)).isoformat(),
        "archetype": "cruiser_40ft",
        "forecast_cache": _corridor_cache(),
    }
    await app._api_passage_by_eta(_FakeRequest(body))
    assert isinstance(captured["adapter"], CacheBackedAdapter)
