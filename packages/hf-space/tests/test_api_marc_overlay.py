# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Characterisation of ``GET /api/v1/marine/marc`` and of the landing page.

The overlay endpoint had no test. It is unusual enough to deserve one: it
answers 200 even when it has nothing to give, because the web client calls it
in parallel with Open-Meteo and a 404 would only add console noise. That
"always 200, `covered` tells you the truth" contract is easy to break by
accident during a refactor, so it is pinned here.

The registries are module-level and empty in CI, which is exactly the Space's
own state when the tidal atlas dataset was not pulled. That uncovered path is
therefore the one that runs in production more often than not.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
from datetime import UTC, datetime, timedelta

import pytest

_APP_PATH = (pathlib.Path(__file__).parents[1] / "app.py").resolve()
_spec = importlib.util.spec_from_file_location("hf_app_marc", _APP_PATH)
app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(app)

START = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
BREST = (48.39, -4.49)


class _FakeRequest:
    def __init__(self, params: dict[str, str]) -> None:
        self.query_params = params


class _FakeAssetRequest:
    def __init__(self, asset: str) -> None:
        self.path_params = {"asset": asset}


def _params(**extra) -> dict[str, str]:
    params = {
        "lat": str(BREST[0]),
        "lon": str(BREST[1]),
        "start": START.isoformat(),
        "end": (START + timedelta(hours=6)).isoformat(),
    }
    params.update(extra)
    return params


def _payload(resp) -> dict:
    return json.loads(bytes(resp.body))


class TestUncoveredPath:
    async def test_answers_200_rather_than_404_when_it_has_nothing(self) -> None:
        # The client fires this alongside its Open-Meteo call and simply keeps
        # the SMOC baseline when covered is false. A 404 here would be noise.
        resp = await app._api_marc_overlay(_FakeRequest(_params()))
        assert resp.status_code == 200
        assert _payload(resp)["covered"] is False

    async def test_says_why_when_no_atlas_is_loaded(self) -> None:
        # Distinguishes "this Space has no dataset" from "this point is
        # outside coverage", which are very different things to debug.
        resp = await app._api_marc_overlay(_FakeRequest(_params()))
        payload = _payload(resp)
        if not app._MARC_REGISTRY.atlases:
            assert payload["reason"] == "no atlas dataset loaded on this Space"

    async def test_uncovered_answers_are_cached(self) -> None:
        resp = await app._api_marc_overlay(_FakeRequest(_params()))
        assert "max-age" in resp.headers["cache-control"]


class TestRejectedQueries:
    @pytest.mark.parametrize("param", ["lat", "lon", "start", "end"])
    async def test_missing_required_param(self, param) -> None:
        params = _params()
        del params[param]
        resp = await app._api_marc_overlay(_FakeRequest(params))
        assert resp.status_code == 422
        assert "missing or invalid query params" in _payload(resp)["error"]

    async def test_unparseable_coordinates(self) -> None:
        resp = await app._api_marc_overlay(_FakeRequest(_params(lat="north")))
        assert resp.status_code == 422

    async def test_out_of_range_coordinates(self) -> None:
        resp = await app._api_marc_overlay(_FakeRequest(_params(lat="120.0")))
        assert resp.status_code == 422

    async def test_end_before_start(self) -> None:
        resp = await app._api_marc_overlay(
            _FakeRequest(_params(end=(START - timedelta(hours=1)).isoformat()))
        )
        assert resp.status_code == 422
        assert _payload(resp)["error"] == "end must be after start"

    async def test_window_longer_than_a_month(self) -> None:
        # Guards the series length: the handler materialises one entry per
        # step over the whole window.
        resp = await app._api_marc_overlay(
            _FakeRequest(_params(end=(START + timedelta(days=31)).isoformat()))
        )
        assert resp.status_code == 422
        assert "at most 30 days" in _payload(resp)["error"]

    @pytest.mark.parametrize("step", ["4", "361"])
    async def test_step_outside_the_allowed_range(self, step) -> None:
        resp = await app._api_marc_overlay(_FakeRequest(_params(step_minutes=step)))
        assert resp.status_code == 422
        assert "between 5 and 360" in _payload(resp)["error"]

    async def test_non_integer_step(self) -> None:
        resp = await app._api_marc_overlay(_FakeRequest(_params(step_minutes="hourly")))
        assert resp.status_code == 422
        assert "must be an integer" in _payload(resp)["error"]


class TestNaiveTimestamps:
    async def test_naive_timestamps_are_read_as_utc_not_rejected(self) -> None:
        # Clients do send naive timestamps; assuming UTC beats a 422 here.
        resp = await app._api_marc_overlay(
            _FakeRequest(
                _params(
                    start="2026-05-01T06:00:00",
                    end="2026-05-01T12:00:00",
                )
            )
        )
        assert resp.status_code == 200


class TestLanding:
    async def test_landing_serves_html(self) -> None:
        resp = await app._index(None)
        assert resp.status_code == 200
        assert resp.media_type == "text/html"

    async def test_landing_points_at_the_web_app(self) -> None:
        # The Space is the MCP endpoint; the landing exists to send humans who
        # land on it to the actual planner rather than leaving them stuck.
        body = bytes(resp.body).decode() if (resp := await app._index(None)) else ""
        assert "wind.fr" in body

    async def test_landing_plays_the_demo_from_this_origin(self) -> None:
        # Not from raw.githubusercontent.com: it serves MP4s as
        # application/octet-stream, and nosniff then stops <video> playing it.
        body = bytes(resp.body).decode() if (resp := await app._index(None)) else ""
        assert 'src="/static/demo.mp4"' in body
        assert 'poster="/static/demo-poster.jpg"' in body
        # Autoplaying with sound is blocked by every browser; muted is what
        # makes the loop actually start.
        assert "muted" in body


class TestStaticAssets:
    async def test_every_advertised_asset_is_shipped(self) -> None:
        # The Dockerfile COPYs an explicit file list, so an asset can be
        # committed, mirrored to the Space, and still be absent from the image.
        for name in app._STATIC_ASSETS:
            assert (app._STATIC_DIR / name).is_file(), name

    async def test_serves_the_demo_with_a_video_content_type(self) -> None:
        resp = await app._static_asset(_FakeAssetRequest("demo.mp4"))
        assert resp.status_code == 200
        assert resp.media_type == "video/mp4"
        assert "max-age" in resp.headers["cache-control"]

    async def test_unknown_asset_is_a_404(self) -> None:
        resp = await app._static_asset(_FakeAssetRequest("security.py"))
        assert resp.status_code == 404
