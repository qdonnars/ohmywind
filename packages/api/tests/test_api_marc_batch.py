# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""``POST /api/v1/marine/marc/batch``: a whole corridor, one request.

The endpoint exists for one measured reason: the web app asks for one overlay
per corridor point, up to 21 on a 200 nm route since PR 0.3, and every one of
them repeats a time series that is identical for all of them. Replacing 21
round trips with one is worth doing only if the answer is *exactly* what the
21 would have been, which is what most of this module asserts.

``TestParityWithTheGet`` is the one that matters: each overlay is compared to
the GET's response for the same point **as bytes**, not as parsed objects. A
key that reordered, a float that widened or a ``null`` that went missing would
pass an equality on dicts and break a client that reads the two interchangeably.

The fixtures put one point in each tier of the cascade: SHOM currents in the
Morbihan, MARC height and currents off Brest, nothing at all at Porquerolles.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from atlas_fixtures import FINIS_CELL, MORBIHAN_POINTS, write_finis_atlas, write_shom_registry
from goldens_support import assert_golden
from starlette.testclient import TestClient

from openwind_api import security
from openwind_api.app import create_app
from openwind_api.routes import marine as marine_routes
from openwind_api.settings import Settings

BATCH = "/api/v1/marine/marc/batch"
OVERLAY = "/api/v1/marine/marc"

START = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
END = START + timedelta(hours=6)

# One point per tier of the cascade, in an order that is not the order of the
# tiers: the answer has to follow the request, not the coverage.
SHOM_POINT = list(MORBIHAN_POINTS[0])
PORQUEROLLES = [43.00, 6.20]
MARC_POINT = list(FINIS_CELL)
THREE_POINTS = [SHOM_POINT, PORQUEROLLES, MARC_POINT]


@pytest.fixture
def atlas_dirs(tmp_path):
    write_finis_atlas(tmp_path / "marc")
    write_shom_registry(tmp_path / "shom")
    return tmp_path / "marc", tmp_path / "shom"


@pytest.fixture
def client(atlas_dirs):
    """The real app on both synthetic registries, no MCP behind it."""
    marc_dir, shom_dir = atlas_dirs
    return TestClient(
        create_app(Settings(marc_atlas_dir=str(marc_dir), shom_c2d_dir=str(shom_dir)))
    )


@pytest.fixture
def bare_client():
    """A deployment with no dataset at all: the Space's own state, often."""
    return TestClient(create_app(Settings()))


def _body(**extra) -> dict:
    body = {"points": THREE_POINTS, "start": START.isoformat(), "end": END.isoformat()}
    body.update(extra)
    return body


def _window_of(n_steps: int, step_minutes: int = 60) -> dict:
    """A window of exactly ``n_steps`` instants, for the product ceiling."""
    return {
        "start": START.isoformat(),
        "end": (START + timedelta(minutes=step_minutes * (n_steps - 1))).isoformat(),
        "step_minutes": step_minutes,
    }


def _overlays(resp) -> list[dict]:
    return resp.json()["overlays"]


class TestTheAnswer:
    def test_three_points_three_overlays_in_order(self, client) -> None:
        resp = client.post(BATCH, json=_body())
        assert resp.status_code == 200
        overlays = _overlays(resp)
        assert [o["covered"] for o in overlays] == [True, False, True]

    def test_each_tier_reports_what_it_has(self, client) -> None:
        shom, porquerolles, marc = _overlays(client.post(BATCH, json=_body()))
        # SHOM: hand-curated currents, and no height series to give.
        assert shom["current_source"].startswith("shom_c2d_")
        assert "tide_height_m" not in shom
        # MARC: height and currents off one 250 m cell.
        assert marc["current_source"] == "marc_finis_250m"
        assert marc["atlas_resolution_m"] == 250
        assert len(marc["tide_height_m"]) == len(marc["times"]) == 7
        # Nothing in the Mediterranean, and the client keeps its SMOC baseline.
        assert porquerolles == {"covered": False}

    def test_the_batch_golden(self, client) -> None:
        resp = client.post(BATCH, json=_body())
        assert resp.status_code == 200
        assert_golden("marine_marc_batch.json", resp.content)

    def test_the_order_is_the_request_s_own(self, client) -> None:
        # Reversed input, reversed output: the client zips by index and has
        # nothing else to match on.
        resp = client.post(BATCH, json=_body(points=list(reversed(THREE_POINTS))))
        assert [o["covered"] for o in _overlays(resp)] == [True, False, True][::-1]

    def test_one_point_is_a_legitimate_batch(self, client) -> None:
        resp = client.post(BATCH, json=_body(points=[MARC_POINT]))
        assert resp.status_code == 200
        assert len(_overlays(resp)) == 1

    def test_the_same_point_twice_answers_twice(self, client) -> None:
        # Deduplicating would silently change the length of the answer, and
        # the client indexes into it.
        resp = client.post(BATCH, json=_body(points=[MARC_POINT, MARC_POINT]))
        first, second = _overlays(resp)
        assert first == second

    def test_a_deployment_without_atlases_says_so_for_every_point(self, bare_client) -> None:
        overlays = _overlays(bare_client.post(BATCH, json=_body()))
        assert (
            overlays == [{"covered": False, "reason": "no atlas dataset loaded on this Space"}] * 3
        )

    def test_the_post_is_not_cached(self, client) -> None:
        """A POST body is not a cache key any intermediary honours.

        The GET is cacheable for a day because its URL *is* the request.
        Stamping the same header on this one would promise a caching that
        nothing performs, and clients that want it still have the GET.
        """
        assert "cache-control" not in client.post(BATCH, json=_body()).headers

    def test_the_step_is_honoured(self, client) -> None:
        overlays = _overlays(client.post(BATCH, json=_body(step_minutes=30)))
        assert len(overlays[2]["times"]) == 13

    def test_naive_timestamps_are_read_as_utc(self, client) -> None:
        # Same leniency as the GET: clients do send them, and refusing would
        # only move the guess into the client.
        resp = client.post(
            BATCH,
            json=_body(start="2026-05-01T06:00:00", end="2026-05-01T12:00:00"),
        )
        assert resp.status_code == 200
        assert _overlays(resp)[2]["times"][0] == "2026-05-01T06:00:00+00:00"


class TestParityWithTheGet:
    """Whatever the batch says about a point, the GET says the same bytes."""

    def _get(self, client, point, **params):
        query = {
            "lat": point[0],
            "lon": point[1],
            "start": START.isoformat(),
            "end": END.isoformat(),
        }
        query.update(params)
        return client.get(OVERLAY, params=query)

    @pytest.mark.parametrize("index", [0, 1, 2])
    def test_an_overlay_is_the_get_s_body_byte_for_byte(self, client, index) -> None:
        overlay = _overlays(client.post(BATCH, json=_body()))[index]
        # The encoder JSONResponse uses, so this is a comparison of the bytes
        # that would have gone on the wire rather than of two parsed objects.
        rendered = json.dumps(
            overlay, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        ).encode()
        assert rendered == self._get(client, THREE_POINTS[index]).content

    def test_parity_holds_at_a_finer_step_too(self, client) -> None:
        overlay = _overlays(client.post(BATCH, json=_body(step_minutes=15)))[2]
        assert overlay == self._get(client, MARC_POINT, step_minutes=15).json()

    def test_parity_holds_without_a_dataset(self, bare_client) -> None:
        overlay = _overlays(bare_client.post(BATCH, json=_body(points=[MARC_POINT])))[0]
        assert overlay == self._get(bare_client, MARC_POINT).json()

    def test_the_tide_coefficient_is_the_one_the_get_reports(self, client) -> None:
        """Computed once per batch, not once per point, and still the same.

        It is Brest-anchored, so it depends on the start of the window and on
        nothing else. Hoisting it out of the loop is only safe while it keeps
        answering what the per-point path answered.
        """
        overlays = _overlays(client.post(BATCH, json=_body()))
        coefficient = self._get(client, MARC_POINT).json()["tide_coefficient"]
        assert coefficient is not None
        assert {o["tide_coefficient"] for o in overlays if o["covered"]} == {coefficient}


class TestRefusals:
    def test_more_points_than_the_ceiling(self, client) -> None:
        points = [[43.0 + i * 0.001, 6.2] for i in range(security_batch_ceiling() + 1)]
        resp = client.post(BATCH, json=_body(points=points))
        assert resp.status_code == 422
        payload = resp.json()
        assert payload["code"] == "too_many_points"
        assert str(len(points)) in payload["error"]

    def test_the_ceiling_itself_is_accepted(self, client) -> None:
        points = [[43.0 + i * 0.001, 6.2] for i in range(security_batch_ceiling())]
        resp = client.post(BATCH, json=_body(points=points))
        assert resp.status_code == 200
        assert len(_overlays(resp)) == security_batch_ceiling()

    def test_the_product_of_the_two_ceilings_has_a_ceiling_of_its_own(self, client) -> None:
        """The rule the other two leave open, and the one that costs.

        120 points is allowed and 800 steps is allowed, so without this a
        caller could ask for 96 000 point-steps, measured at 5.2 s of
        prediction on the real atlases, on a bucket that allows 120 requests
        a minute per IP.
        """
        points = [[43.0 + i * 0.001, 6.2] for i in range(120)]
        resp = client.post(BATCH, json=_body(points=points, **_window_of(201)))
        assert resp.status_code == 422
        payload = resp.json()
        assert payload["code"] == "batch_too_large"
        assert payload["error"] == (
            f"requested {120 * 201} point-steps, at most {marine_routes.MAX_BATCH_CELLS}: "
            "fewer points, a shorter window or a wider step"
        )

    def test_the_product_ceiling_itself_is_accepted(self, client) -> None:
        # Exactly at the cap, from both directions of the product: the
        # ceiling is what a call may be, not what it must stay under. One
        # point-step more is the test above; 24 001 exactly is unreachable,
        # since it factorises into nothing that fits 120 points and 800 steps.
        for points_count, steps in ((120, 200), (80, 300)):
            points = [[43.0 + i * 0.001, 6.2] for i in range(points_count)]
            assert points_count * steps == marine_routes.MAX_BATCH_CELLS
            resp = client.post(BATCH, json=_body(points=points, **_window_of(steps)))
            assert resp.status_code == 200, resp.text
            assert len(_overlays(resp)) == points_count

    def test_the_web_app_s_own_call_is_far_inside_the_product_ceiling(self) -> None:
        # 21 corridor points over 7 days hourly, the shape PR 0.3 settled on.
        # If this ever stops holding, the cap is wrong, not the client.
        assert 21 * 169 < marine_routes.MAX_BATCH_CELLS / 6

    def test_the_product_ceiling_is_the_constant_and_the_constant_is_settable(
        self, monkeypatch, client
    ) -> None:
        # The check reads the module constant rather than a literal, and that
        # constant comes from OPENWIND_MARC_BATCH_MAX_CELLS at import, so a
        # deployment with more CPU than this one raises it without a release.
        assert marine_routes.MAX_BATCH_CELLS == 24000
        monkeypatch.setattr(marine_routes, "MAX_BATCH_CELLS", 20)
        # 3 points over a 7-instant window is 21, one past the lowered cap.
        resp = client.post(BATCH, json=_body())
        assert resp.status_code == 422
        assert resp.json() == {
            "error": "requested 21 point-steps, at most 20: "
            "fewer points, a shorter window or a wider step",
            "code": "batch_too_large",
        }

    def test_a_rejected_product_costs_no_prediction(self, client, monkeypatch) -> None:
        def _explode(*_args, **_kwargs):
            raise AssertionError("a point was predicted for a rejected batch")

        monkeypatch.setattr(marine_routes, "overlay_for_point", _explode)
        points = [[43.0 + i * 0.001, 6.2] for i in range(120)]
        resp = client.post(BATCH, json=_body(points=points, **_window_of(400)))
        assert resp.status_code == 422
        assert resp.json()["code"] == "batch_too_large"

    @pytest.mark.parametrize(
        "points",
        [
            pytest.param([], id="empty"),
            pytest.param("43,6", id="a-string"),
            pytest.param({"lat": 43}, id="an-object"),
        ],
    )
    def test_points_that_are_not_a_list_of_pairs(self, client, points) -> None:
        resp = client.post(BATCH, json=_body(points=points))
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_waypoints"

    @pytest.mark.parametrize(
        "point",
        [
            pytest.param([43.0], id="one-number"),
            pytest.param([43.0, 6.2, 0.0], id="three-numbers"),
            pytest.param(["north", 6.2], id="not-a-number"),
            pytest.param(43.0, id="a-bare-number"),
            pytest.param(None, id="null"),
        ],
    )
    def test_a_malformed_point_names_its_index(self, client, point) -> None:
        resp = client.post(BATCH, json=_body(points=[MARC_POINT, point]))
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_waypoints"
        assert "index 1" in resp.json()["error"]

    def test_a_point_off_the_planet_is_refused_like_the_get_s(self, client) -> None:
        resp = client.post(BATCH, json=_body(points=[[95.0, 6.2]]))
        assert resp.status_code == 422
        assert resp.json()["code"] == "waypoint_out_of_range"
        one_at_a_time = client.get(
            OVERLAY,
            params={"lat": 95.0, "lon": 6.2, "start": START.isoformat(), "end": END.isoformat()},
        )
        assert resp.json() == one_at_a_time.json()

    @pytest.mark.parametrize("missing", ["points", "start", "end"])
    def test_a_missing_field(self, client, missing) -> None:
        body = _body()
        del body[missing]
        resp = client.post(BATCH, json=body)
        assert resp.status_code == 422
        assert resp.json()["code"] == "missing_fields"
        assert missing in resp.json()["error"]

    @pytest.mark.parametrize("body", [[1, 2], "points", 42, None])
    def test_a_body_that_is_not_an_object(self, client, body) -> None:
        resp = client.post(BATCH, json=body)
        assert resp.status_code == 422
        assert resp.json() == {"error": "invalid JSON body", "code": "invalid_json"}

    def test_a_body_that_is_not_json(self, client) -> None:
        resp = client.post(BATCH, content=b"{oops", headers={"Content-Type": "application/json"})
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_json"

    def test_an_unreadable_timestamp(self, client) -> None:
        resp = client.post(BATCH, json=_body(start="tomorrow-ish"))
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_datetime"

    def test_end_before_start_is_refused_in_the_get_s_words(self, client) -> None:
        resp = client.post(BATCH, json=_body(end=(START - timedelta(hours=1)).isoformat()))
        assert resp.status_code == 422
        assert resp.json() == {"error": "end must be after start", "code": "invalid_time_window"}

    def test_a_window_longer_than_a_month(self, client) -> None:
        resp = client.post(BATCH, json=_body(end=(START + timedelta(days=31)).isoformat()))
        assert resp.status_code == 422
        assert "at most 30 days" in resp.json()["error"]

    def test_the_step_ceiling_applies_once_for_the_whole_call(self, client) -> None:
        """The window rules are the GET's, and they are the same 422.

        Applied to the window rather than to the batch, so a caller cannot
        buy 800 steps per point by sending more points; the point count has
        its own ceiling.
        """
        resp = client.post(
            BATCH,
            json=_body(end=(START + timedelta(days=30)).isoformat(), step_minutes=5),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "too_many_steps"
        one_at_a_time = client.get(
            OVERLAY,
            params={
                "lat": MARC_POINT[0],
                "lon": MARC_POINT[1],
                "start": START.isoformat(),
                "end": (START + timedelta(days=30)).isoformat(),
                "step_minutes": 5,
            },
        )
        assert resp.json() == one_at_a_time.json()

    @pytest.mark.parametrize("step", [4, 361])
    def test_a_step_outside_the_allowed_range(self, client, step) -> None:
        resp = client.post(BATCH, json=_body(step_minutes=step))
        assert resp.status_code == 422
        assert "between 5 and 360" in resp.json()["error"]

    @pytest.mark.parametrize("step", ["hourly", 30.5, True, [30]])
    def test_a_step_that_is_not_an_integer(self, client, step) -> None:
        resp = client.post(BATCH, json=_body(step_minutes=step))
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_query_params"

    def test_a_numeric_string_step_is_still_read(self, client) -> None:
        # The GET only ever sees strings, and the two parse the same way.
        resp = client.post(BATCH, json=_body(step_minutes="30"))
        assert resp.status_code == 200

    def test_nothing_is_predicted_for_a_rejected_batch(self, client, monkeypatch) -> None:
        # Cheap checks first: a refused request must cost arithmetic, not 120
        # coverage lookups followed by 120 series.
        def _explode(*_args, **_kwargs):
            raise AssertionError("coverage lookup ran on a rejected request")

        monkeypatch.setattr(marine_routes, "overlay_for_point", _explode)
        assert client.post(BATCH, json=_body(step_minutes=1)).status_code == 422


class TestRateLimit:
    """One request, one token, whatever the point count."""

    def _limits(self, **overrides):
        original = security.RateLimitMiddleware.__init__

        def _init(self, app, **kwargs):
            kwargs.update(overrides)
            original(self, app, **kwargs)

        return _init

    def test_a_batch_costs_one_token_not_one_per_point(self, monkeypatch, atlas_dirs) -> None:
        # The whole point of the endpoint: 21 round trips became one, and the
        # limiter must not hand back what the round trips gave.
        monkeypatch.setattr(
            security.RateLimitMiddleware, "__init__", self._limits(marc_max_requests=2)
        )
        marc_dir, shom_dir = atlas_dirs
        client = TestClient(
            create_app(Settings(marc_atlas_dir=str(marc_dir), shom_c2d_dir=str(shom_dir)))
        )
        points = [[47.5 + i * 0.001, -2.9] for i in range(20)]
        codes = [client.post(BATCH, json=_body(points=points)).status_code for _ in range(3)]
        assert codes == [200, 200, 429]

    def test_it_shares_the_overlay_s_bucket_and_not_the_planners(self, monkeypatch) -> None:
        monkeypatch.setattr(
            security.RateLimitMiddleware,
            "__init__",
            self._limits(max_requests=1, marc_max_requests=1),
        )
        client = TestClient(create_app(Settings()))
        assert client.post(BATCH, json=_body()).status_code == 200
        # The overlay's bucket is spent, on both routes...
        assert client.post(BATCH, json=_body()).status_code == 429
        assert client.get(OVERLAY, params={"lat": 43.0, "lon": 6.2}).status_code == 429
        # ...and the planners' is untouched.
        assert client.post("/api/v1/passage", json={}).status_code == 422

    def test_the_batch_path_is_declared_on_the_overlay_bucket(self) -> None:
        assert BATCH in security.DEFAULT_MARC_LIMITED_PATHS
        assert BATCH not in security.DEFAULT_LIMITED_PATHS


def security_batch_ceiling() -> int:
    return marine_routes.MAX_MARC_BATCH_POINTS
