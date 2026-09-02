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

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from openwind_data.currents.marc_atlas import MarcAtlasRegistry as _MarcAtlasRegistry
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry as _ShomC2dRegistry

from openwind_api.routes import landing as landing_routes
from openwind_api.routes import marine as marine_routes

# What a request sees on ``app.state.services``. Empty by default, which is
# the state of any deployment built without the atlas dataset and the branch
# that runs in CI; the fixtures below swap a registry in. A namespace rather
# than a real ``Services`` because that one is frozen, and swapping half of it
# is exactly what these tests do.
SERVICES = SimpleNamespace(
    marc=_MarcAtlasRegistry.from_directory(""),
    shom=_ShomC2dRegistry.from_directory(""),
)

START = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
BREST = (48.39, -4.49)


class _FakeRequest:
    """The two attributes the marine handlers touch."""

    def __init__(self, params: dict[str, str] | None = None) -> None:
        self.query_params = params or {}
        self.app = SimpleNamespace(state=SimpleNamespace(services=SERVICES))


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
        resp = await marine_routes.api_marc_overlay(_FakeRequest(_params()))
        assert resp.status_code == 200
        assert _payload(resp)["covered"] is False

    async def test_says_why_when_no_atlas_is_loaded(self) -> None:
        # Distinguishes "this Space has no dataset" from "this point is
        # outside coverage", which are very different things to debug.
        resp = await marine_routes.api_marc_overlay(_FakeRequest(_params()))
        payload = _payload(resp)
        if not SERVICES.marc.atlases:
            assert payload["reason"] == "no atlas dataset loaded on this Space"

    async def test_uncovered_answers_are_cached(self) -> None:
        resp = await marine_routes.api_marc_overlay(_FakeRequest(_params()))
        assert "max-age" in resp.headers["cache-control"]


class TestRejectedQueries:
    @pytest.mark.parametrize("param", ["lat", "lon", "start", "end"])
    async def test_missing_required_param(self, param) -> None:
        params = _params()
        del params[param]
        resp = await marine_routes.api_marc_overlay(_FakeRequest(params))
        assert resp.status_code == 422
        assert "missing or invalid query params" in _payload(resp)["error"]

    async def test_unparseable_coordinates(self) -> None:
        resp = await marine_routes.api_marc_overlay(_FakeRequest(_params(lat="north")))
        assert resp.status_code == 422

    async def test_out_of_range_coordinates(self) -> None:
        resp = await marine_routes.api_marc_overlay(_FakeRequest(_params(lat="120.0")))
        assert resp.status_code == 422

    async def test_end_before_start(self) -> None:
        resp = await marine_routes.api_marc_overlay(
            _FakeRequest(_params(end=(START - timedelta(hours=1)).isoformat()))
        )
        assert resp.status_code == 422
        assert _payload(resp)["error"] == "end must be after start"

    async def test_window_longer_than_a_month(self) -> None:
        # Guards the series length: the handler materialises one entry per
        # step over the whole window.
        resp = await marine_routes.api_marc_overlay(
            _FakeRequest(_params(end=(START + timedelta(days=31)).isoformat()))
        )
        assert resp.status_code == 422
        assert "at most 30 days" in _payload(resp)["error"]

    @pytest.mark.parametrize("step", ["4", "361"])
    async def test_step_outside_the_allowed_range(self, step) -> None:
        resp = await marine_routes.api_marc_overlay(_FakeRequest(_params(step_minutes=step)))
        assert resp.status_code == 422
        assert "between 5 and 360" in _payload(resp)["error"]

    async def test_non_integer_step(self) -> None:
        resp = await marine_routes.api_marc_overlay(_FakeRequest(_params(step_minutes="hourly")))
        assert resp.status_code == 422
        assert "must be an integer" in _payload(resp)["error"]

    async def test_too_many_steps_for_one_call(self) -> None:
        # The window and the step were each bounded, their product was not:
        # 30 days at a 5-minute step is 8641 instants, and the SHOM predictor
        # runs a Python loop per instant on the event loop (~1 ms each), so
        # one request could block the single worker for ~9 s, MCP included.
        resp = await marine_routes.api_marc_overlay(
            _FakeRequest(_params(end=(START + timedelta(days=30)).isoformat(), step_minutes="5"))
        )
        assert resp.status_code == 422
        error = _payload(resp)["error"]
        assert f"at most {marine_routes.MAX_MARC_STEPS}" in error
        assert "step_minutes" in error

    async def test_a_month_of_hourly_steps_is_still_allowed(self) -> None:
        # 721 instants: the longest window the web app asks for, and the shape
        # the 30-day ceiling was written to permit. It must stay under the
        # step ceiling or the two rules contradict each other.
        resp = await marine_routes.api_marc_overlay(
            _FakeRequest(_params(end=(START + timedelta(days=30)).isoformat()))
        )
        assert resp.status_code == 200

    async def test_the_step_ceiling_is_checked_before_any_prediction(self) -> None:
        # Cheap-check-first: an over-sized request must cost arithmetic, not a
        # registry lookup followed by a series materialisation.
        called = False

        class _ExplodingRegistry:
            atlases = ()

            def cell_at(self, *_args):
                nonlocal called
                called = True
                raise AssertionError("coverage lookup ran on a rejected request")

        original = SERVICES.marc
        SERVICES.marc = _ExplodingRegistry()
        try:
            resp = await marine_routes.api_marc_overlay(
                _FakeRequest(
                    _params(end=(START + timedelta(days=30)).isoformat(), step_minutes="5")
                )
            )
        finally:
            SERVICES.marc = original
        assert resp.status_code == 422
        assert called is False


class TestNaiveTimestamps:
    async def test_naive_timestamps_are_read_as_utc_not_rejected(self) -> None:
        # Clients do send naive timestamps; assuming UTC beats a 422 here.
        resp = await marine_routes.api_marc_overlay(
            _FakeRequest(
                _params(
                    start="2026-05-01T06:00:00",
                    end="2026-05-01T12:00:00",
                )
            )
        )
        assert resp.status_code == 200


class TestCoverage:
    """``GET /api/v1/marine/marc/coverage``: where it is worth asking at all.

    The overlay answers 200 with ``covered: false`` outside coverage, once per
    corridor point. A Mediterranean plan measured 14 such answers out of 14
    calls. This endpoint exists so the client can skip them, which only works
    if the boxes are complete, ordered, and cheap to cache.
    """

    class _StubMarcAtlas:
        def __init__(self, name, bbox, cells=()):
            self.name = name
            self.bbox = bbox
            self.cells = tuple(cells)

    class _StubMarcRegistry:
        def __init__(self, atlases):
            self.atlases = tuple(atlases)

        def coverage_cells(self):
            return tuple((a.name, a.cells) for a in self.atlases)

    class _StubShomRegistry:
        def __init__(self, zones):
            self._zones = tuple(zones)

        def coverage_zones(self):
            return self._zones

    @pytest.fixture
    def loaded(self, monkeypatch):
        """A Space with both datasets, declared out of alphabetical order."""
        monkeypatch.setattr(
            SERVICES,
            "marc",
            self._StubMarcRegistry(
                [
                    # Declared out of alphabetical order, and with a coverage
                    # envelope wider than the tiles that hold data, which is
                    # the real shape of every MARC atlas.
                    self._StubMarcAtlas(
                        "MANGA", (48.0, -5.0, 50.0, 0.0), [(49.0, -2.0, 49.5, -1.0)]
                    ),
                    self._StubMarcAtlas(
                        "FINIS",
                        (47.5, -5.5, 48.9, -3.5),
                        [(48.0, -5.0, 48.5, -4.0), (48.5, -5.0, 49.0, -4.5)],
                    ),
                ]
            ),
        )
        monkeypatch.setattr(
            SERVICES,
            "shom",
            self._StubShomRegistry(
                [
                    ("MORBIHAN", (47.4, -3.2, 47.7, -2.6)),
                    ("BREST", (48.2, -4.8, 48.5, -4.2)),
                ]
            ),
        )

    async def test_reports_every_loaded_atlas_and_zone(self, loaded) -> None:
        payload = _payload(await marine_routes.api_marc_coverage(_FakeRequest()))
        assert [(a["source"], a["name"]) for a in payload["atlases"]] == [
            ("marc", "FINIS"),
            ("marc", "MANGA"),
            ("shom", "BREST"),
            ("shom", "MORBIHAN"),
        ]

    async def test_boxes_are_lat_lon_in_that_order(self, loaded) -> None:
        # Same order as the overlay's own lat/lon query params. Swapping them
        # would put every French box in the Indian Ocean and the client would
        # skip every call.
        finis = next(
            a for a in _payload(await marine_routes.api_marc_coverage(_FakeRequest()))["atlases"]
        )
        lat_min, lon_min, lat_max, lon_max = finis["bbox"]
        assert 47.0 < lat_min < lat_max < 49.0
        assert -6.0 < lon_min < lon_max < -3.0

    async def test_ordering_is_stable_across_calls(self, loaded) -> None:
        first = _payload(await marine_routes.api_marc_coverage(_FakeRequest()))
        second = _payload(await marine_routes.api_marc_coverage(_FakeRequest()))
        assert first == second

    async def test_rounding_only_ever_widens_a_box(self, monkeypatch) -> None:
        # A box is a promise that there is nothing outside it. Rounding a
        # bound inward would shave metres off that promise and silently drop
        # a covered point.
        raw = (47.123456789, -3.987654321, 48.111111111, -2.000000001)
        monkeypatch.setattr(
            SERVICES, "marc", self._StubMarcRegistry([self._StubMarcAtlas("X", raw, [raw])])
        )
        monkeypatch.setattr(SERVICES, "shom", self._StubShomRegistry([]))
        lat_min, lon_min, lat_max, lon_max = _payload(
            await marine_routes.api_marc_coverage(_FakeRequest())
        )["atlases"][0]["bbox"]
        assert lat_min <= raw[0] and lon_min <= raw[1]
        assert lat_max >= raw[2] and lon_max >= raw[3]

    async def test_every_entry_carries_its_cells(self, loaded) -> None:
        payload = _payload(await marine_routes.api_marc_coverage(_FakeRequest()))
        by_name = {a["name"]: a for a in payload["atlases"]}
        assert by_name["FINIS"]["cells"] == [
            [48.0, -5.0, 48.5, -4.0],
            [48.5, -5.0, 49.0, -4.5],
        ]
        # SHOM has nothing finer than its zone box, which already wraps the
        # points themselves rather than a build-time envelope.
        assert by_name["MORBIHAN"]["cells"] == [by_name["MORBIHAN"]["bbox"]]

    async def test_bbox_is_unchanged_by_the_arrival_of_cells(self, loaded) -> None:
        # A client already reads bbox off the deployed answer; cells is added
        # beside it, not in its place.
        finis = next(
            a
            for a in _payload(await marine_routes.api_marc_coverage(_FakeRequest()))["atlases"]
            if a["name"] == "FINIS"
        )
        assert finis["bbox"] == [47.5, -5.5, 48.9, -3.5]

    async def test_cells_stay_within_one_tile_of_the_bbox_they_refine(self, loaded) -> None:
        """A cell may overrun the envelope, by at most one tile.

        Tiles are aligned on a half-degree grid while a coverage polygon ends
        wherever the model grid ends, so the topmost tile of an atlas whose
        bbox stops at 48.9 legitimately reaches 49.0. Anything further than
        that means the two are describing different atlases.
        """
        tile = 0.5
        for entry in _payload(await marine_routes.api_marc_coverage(_FakeRequest()))["atlases"]:
            lat_min, lon_min, lat_max, lon_max = entry["bbox"]
            for cell in entry["cells"]:
                assert cell[0] >= lat_min - tile and cell[2] <= lat_max + tile, entry["name"]
                assert cell[1] >= lon_min - tile and cell[3] <= lon_max + tile, entry["name"]

    async def test_a_mediterranean_point_is_in_the_bbox_and_in_no_cell(self, monkeypatch) -> None:
        """The whole reason ``cells`` exists, at the endpoint level.

        ATLNE's build-time coverage polygon is a bounding box that reaches
        from Madeira's latitude to Norway and from mid-Atlantic to Poland, so
        Porquerolles sits inside it while the overlay answers uncovered there,
        14 times out of 14 in the live measurement. Filtering on ``bbox`` a
        Mediterranean client skips nothing; filtering on ``cells`` it skips
        every call.
        """
        monkeypatch.setattr(
            SERVICES,
            "marc",
            self._StubMarcRegistry(
                [
                    self._StubMarcAtlas(
                        "ATLNE",
                        (39.982, -20.0295, 64.9911, 15.0004),
                        [(48.0, -5.0, 48.5, -4.0)],
                    )
                ]
            ),
        )
        monkeypatch.setattr(SERVICES, "shom", self._StubShomRegistry([]))
        entry = _payload(await marine_routes.api_marc_coverage(_FakeRequest()))["atlases"][0]

        porquerolles = (43.0, 6.2)

        def contains(box):
            return box[0] <= porquerolles[0] <= box[2] and box[1] <= porquerolles[1] <= box[3]

        assert contains(entry["bbox"])
        assert not any(contains(cell) for cell in entry["cells"])

    async def test_no_float_artefacts_in_the_answer(self, monkeypatch) -> None:
        # The deployed answer carried -20.029500000000002. It is harmless
        # arithmetically and it makes the payload look broken.
        monkeypatch.setattr(
            SERVICES,
            "marc",
            self._StubMarcRegistry(
                [
                    self._StubMarcAtlas(
                        "ATLNE", (39.982, -20.0295, 64.9911, 15.0004), [(48.0, -5.0, 48.5, -4.0)]
                    )
                ]
            ),
        )
        monkeypatch.setattr(SERVICES, "shom", self._StubShomRegistry([]))
        raw = bytes((await marine_routes.api_marc_coverage(_FakeRequest())).body).decode()
        assert "-20.0295," in raw
        assert "0000000" not in raw

    async def test_reads_real_tiles_off_disk(self, monkeypatch, tmp_path) -> None:
        """End to end through the real registry, not a stub.

        The handler joins ``registry.atlases`` to ``coverage_cells()`` by
        atlas name. A stub cannot catch that join going wrong, and if it did
        every atlas would silently report an empty ``cells`` list, which a
        client would read as "skip everything".
        """
        import json

        import polars as pl
        from openwind_data.currents.marc_atlas import MarcAtlasRegistry

        atlas_dir = tmp_path / "FINIS"
        atlas_dir.mkdir()
        (atlas_dir / "metadata.json").write_text(
            json.dumps(
                {
                    "atlas": "FINIS",
                    "rank": 2,
                    "resolution_m": 250,
                    "constituents_h": ["M2"],
                    "constituents_u": [],
                    "constituents_v": [],
                    "schema_version": 2,
                }
            )
        )
        (atlas_dir / "coverage.geojson").write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "properties": {},
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [
                                    [
                                        [-5.5, 47.5],
                                        [-4.5, 47.5],
                                        [-4.5, 49.0],
                                        [-5.5, 49.0],
                                        [-5.5, 47.5],
                                    ]
                                ],
                            },
                        }
                    ],
                }
            )
        )
        tile = atlas_dir / "tile_lat=48.0" / "tile_lon=-5.0"
        tile.mkdir(parents=True)
        pl.DataFrame(
            {
                "lat": [48.35],
                "lon": [-4.80],
                "z0_hydro_m": [0.0],
                "M2_h_amp": [1.0],
                "M2_h_g": [0.0],
            }
        ).write_parquet(tile / "data.parquet", compression="zstd")

        monkeypatch.setattr(SERVICES, "marc", MarcAtlasRegistry.from_directory(tmp_path))
        monkeypatch.setattr(SERVICES, "shom", self._StubShomRegistry([]))

        entry = _payload(await marine_routes.api_marc_coverage(_FakeRequest()))["atlases"][0]
        assert entry["name"] == "FINIS"
        assert entry["cells"] == [[48.0, -5.0, 48.5, -4.5]]
        assert entry["bbox"] == [47.5, -5.5, 49.0, -4.5]

    async def test_an_empty_answer_still_has_no_cells_to_report(self) -> None:
        payload = _payload(await marine_routes.api_marc_coverage(_FakeRequest()))
        assert payload == {"atlases": []}

    async def test_answers_an_empty_list_without_a_dataset(self) -> None:
        # The registries are empty in CI, which is also the Space's state
        # whenever the dataset was not pulled at build time.
        resp = await marine_routes.api_marc_coverage(_FakeRequest())
        assert resp.status_code == 200
        assert _payload(resp) == {"atlases": []}

    async def test_an_empty_answer_is_only_cached_briefly(self) -> None:
        # Attaching the dataset must not take a day to become visible.
        assert SERVICES.marc.atlases == ()
        assert _payload(await marine_routes.api_marc_coverage(_FakeRequest())) == {"atlases": []}
        assert (await marine_routes.api_marc_coverage(_FakeRequest())).headers["cache-control"] == (
            "public, max-age=300"
        )

    async def test_a_loaded_answer_is_cached_for_a_day(self, loaded) -> None:
        # It only changes when a new image ships, and that restarts the Space.
        resp = await marine_routes.api_marc_coverage(_FakeRequest())
        assert resp.headers["cache-control"] == "public, max-age=86400"


class TestLanding:
    async def test_landing_serves_html(self) -> None:
        resp = await landing_routes.index(None)
        assert resp.status_code == 200
        assert resp.media_type == "text/html"

    async def test_landing_points_at_the_web_app(self) -> None:
        # The Space is the MCP endpoint; the landing exists to send humans who
        # land on it to the actual planner rather than leaving them stuck.
        body = bytes(resp.body).decode() if (resp := await landing_routes.index(None)) else ""
        assert "wind.fr" in body

    async def test_landing_plays_the_demo_from_this_origin(self) -> None:
        # Not from raw.githubusercontent.com: it serves MP4s as
        # application/octet-stream, and nosniff then stops <video> playing it.
        body = bytes(resp.body).decode() if (resp := await landing_routes.index(None)) else ""
        assert 'src="/static/demo.mp4"' in body
        assert 'poster="/static/demo-poster.jpg"' in body
        # Autoplaying with sound is blocked by every browser; muted is what
        # makes the loop actually start.
        assert "muted" in body


class TestStaticAssets:
    """The landing media, served from wherever the deployment put them.

    That the files actually ship is the deployment's problem and is asserted
    in ``hf-space/tests``; what is checked here is the allowlist, which is
    what makes path traversal impossible by construction.
    """

    @pytest.fixture
    def media_dir(self, tmp_path):
        (tmp_path / "demo.mp4").write_bytes(b"\x00\x00\x00\x18ftypmp42")
        return tmp_path

    async def test_serves_the_demo_with_a_video_content_type(self, media_dir) -> None:
        resp = await landing_routes.static_asset_route(media_dir)(_FakeAssetRequest("demo.mp4"))
        assert resp.status_code == 200
        assert resp.media_type == "video/mp4"
        assert "max-age" in resp.headers["cache-control"]

    async def test_a_name_outside_the_allowlist_is_a_404(self, media_dir) -> None:
        # Not "does the file exist": the allowlist is consulted first, so a
        # traversal attempt never reaches the filesystem.
        resp = await landing_routes.static_asset_route(media_dir)(
            _FakeAssetRequest("../security.py")
        )
        assert resp.status_code == 404

    async def test_without_a_media_directory_it_is_a_404(self) -> None:
        # A redeployment that has not copied the assets serves the landing
        # page with a video element that finds nothing, rather than crashing.
        resp = await landing_routes.static_asset_route(None)(_FakeAssetRequest("demo.mp4"))
        assert resp.status_code == 404
