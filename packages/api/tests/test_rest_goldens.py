# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Recorded responses for every REST route, compared byte for byte.

The safety net under the API extraction (plan lot 2): the handlers, the
parsing, the error mapping and the landing page are about to move into their
own package, and the one thing that must not move with them is the shape of
what goes on the wire. A test asserting "status 200 and a ``passage`` key"
would survive a reordered key, a float that lost a digit, or a ``null`` that
became absent. These do not.

Everything is pinned:

- the clock, because ``forecast_updated_at`` is stamped from it;
- the weather, via ``DeterministicMarineAdapter`` substituted for the engine's
  own ``OpenMeteoAdapter``, so no test here can reach the network;
- the atlases, via a one-cell FINIS fixture written to a temp directory.

The app under test is the real one, assembled by ``create_app`` with its whole
middleware stack and **no MCP app behind it**. That is the property this
package exists for: the REST surface stands up on its own, and every byte
below is produced without an MCP server in the process.
"""

from __future__ import annotations

import gzip
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from atlas_fixtures import FINIS_CELL, write_finis_atlas
from goldens_support import assert_golden
from openwind_data.routing import passage as passage_engine
from openwind_data.testing import DeterministicMarineAdapter, browser_cache_payload, hourly_axis
from starlette.testclient import TestClient

from openwind_api.app import create_app
from openwind_api.routes import passage as passage_routes
from openwind_api.settings import Settings

# Stamped into every ``forecast_updated_at``. Two days before the departure
# below, so the passage stays inside every model's horizon in the eyes of any
# code that compares the two.
FROZEN_NOW = datetime(2026, 4, 29, 9, 30, tzinfo=UTC)
DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)

# The route the project smoke-tests by hand, to the decimal: Marseille to
# Porquerolles, 40 nm, four 10 nm segments. Small enough that a golden stays
# readable, long enough that the segmentation and the per-segment fallback
# bookkeeping both run.
MARSEILLE = [43.29, 5.37]
PORQUEROLLES = [43.00, 6.20]

# Where the MARC fixture atlas has its single cell.
BREST = FINIS_CELL


class _FrozenMeta(type):
    """Keeps ``isinstance(real_datetime, Frozen)`` true.

    Only ``datetime.now`` needs replacing, but a bare subclass would make
    ``isinstance(a_real_datetime, Frozen)`` false, and any narrowing against
    the module global we replace would then take the wrong branch.
    """

    def __instancecheck__(cls, obj: object) -> bool:
        return isinstance(obj, datetime)


def _frozen_datetime(instant: datetime) -> type[datetime]:
    class _Frozen(datetime, metaclass=_FrozenMeta):
        @classmethod
        def now(cls, tz=None):
            return instant if tz is None else instant.astimezone(tz)

    return _Frozen


@pytest.fixture(autouse=True)
def deterministic_world(monkeypatch):
    """No clock, no network, no atlas dataset. Only arithmetic."""
    monkeypatch.setattr(passage_routes, "datetime", _frozen_datetime(FROZEN_NOW))
    # Belt and braces: nothing should reach for the engine's own adapter now
    # that the live path is handed one, but a regression that put the old
    # branch back would otherwise dial Open-Meteo from CI rather than fail.
    # Patched on ``sampling``, the engine's single construction site for it
    # (``resolve_fetch_adapter``), so this stays a real net rather than a
    # rebinding nobody reads.
    monkeypatch.setattr(passage_engine.sampling, "OpenMeteoAdapter", DeterministicMarineAdapter)


def _deterministic_app(settings: Settings) -> TestClient:
    """The real app, with the stub adapter in the place of the live one.

    A request without a ``forecast_cache`` is planned through
    ``app.state.services.marine``, so that is where the determinism has to be
    installed. Swapping it here rather than patching a module global is the
    same gesture a deployment makes when it hands its own services in, and it
    keeps every other part of the app genuinely real.
    """
    app = create_app(settings)
    app.state.services = replace(app.state.services, marine=DeterministicMarineAdapter())
    return TestClient(app)


@pytest.fixture
def client():
    """The real app, minus the MCP server.

    A fresh instance per test, which also gives each test its own rate-limit
    counter: the goldens fire more requests at ``/api/v1/passage`` than one
    bucket allows in a minute.
    """
    return _deterministic_app(Settings())


def _passage_body(**extra) -> dict:
    body = {
        "waypoints": [MARSEILLE, PORQUEROLLES],
        "departure": DEPARTURE.isoformat(),
        "archetype": "cruiser_30ft",
        "efficiency": 0.75,
    }
    body.update(extra)
    return body


class TestPassage:
    """``POST /api/v1/passage``, both modes."""

    def test_single_mode(self, client) -> None:
        resp = client.post("/api/v1/passage", json=_passage_body())
        assert resp.status_code == 200
        assert_golden("passage_single.json", resp.content)

    def test_single_mode_from_the_browser_cache(self, client) -> None:
        """The path every web request actually takes.

        The corridor points are the segment midpoints the server will sample,
        which is the alignment PR 0.3 introduced client-side; the nearest
        neighbour lookup therefore lands exactly on them.
        """
        resp = client.post(
            "/api/v1/passage",
            json=_passage_body(
                models=["AROME"],
                forecast_cache=browser_cache_payload(
                    _corridor_points(),
                    hourly_axis(DEPARTURE - timedelta(hours=3), DEPARTURE + timedelta(hours=24)),
                ),
            ),
        )
        assert resp.status_code == 200
        assert_golden("passage_single_forecast_cache.json", resp.content)

    def test_a_gzipped_request_produces_the_very_same_bytes(self, client) -> None:
        """The contract for compressed request bodies, stated as an equality.

        The request that produced ``passage_single.json`` is posted again,
        gzipped, and has to come back byte for byte identical. Anything the
        decompression path does to the body other than decompress it, a lost
        final chunk, a stray BOM, a re-encoded string, shows up here as a
        golden diff rather than as a subtly different plan.
        """
        resp = client.post(
            "/api/v1/passage",
            content=gzip.compress(json.dumps(_passage_body()).encode()),
            headers={"Content-Type": "application/json", "Content-Encoding": "gzip"},
        )
        assert resp.status_code == 200
        assert_golden("passage_single.json", resp.content)

    def test_sweep_mode(self, client) -> None:
        resp = client.post(
            "/api/v1/passage",
            json=_passage_body(
                latest_departure=(DEPARTURE + timedelta(hours=5)).isoformat(),
                sweep_interval_hours=1,
            ),
        )
        assert resp.status_code == 200
        assert json.loads(resp.content)["sweep"]["window_count"] == 6
        assert_golden("passage_sweep.json", resp.content)

    def test_sweep_mode_filtered_by_target_eta(self, client) -> None:
        """The ``target_eta`` filter keeps a strict subset of the windows.

        Asserted rather than merely recorded: a golden that happened to hold
        all six windows would pin the "nothing matched, here is everything"
        fallback instead of the filter, and look identical in a diff.
        """
        resp = client.post(
            "/api/v1/passage",
            json=_passage_body(
                latest_departure=(DEPARTURE + timedelta(hours=5)).isoformat(),
                sweep_interval_hours=1,
                target_eta=TARGET_ETA.isoformat(),
            ),
        )
        assert resp.status_code == 200
        payload = json.loads(resp.content)
        assert 0 < payload["sweep"]["window_count"] < 6
        assert payload["meta_warnings"] == []
        assert_golden("passage_sweep_target_eta.json", resp.content)


class TestPassageByEta:
    """``POST /api/v1/passage-by-eta``: the caller pins the arrival."""

    def test_by_eta(self, client) -> None:
        resp = client.post(
            "/api/v1/passage-by-eta",
            json={
                "waypoints": [MARSEILLE, PORQUEROLLES],
                "target_arrival": (DEPARTURE + timedelta(hours=9)).isoformat(),
                "archetype": "cruiser_30ft",
                "efficiency": 0.75,
            },
        )
        assert resp.status_code == 200
        assert_golden("passage_by_eta.json", resp.content)


class TestArchetypes:
    def test_archetypes(self, client) -> None:
        resp = client.get("/api/v1/archetypes")
        assert resp.status_code == 200
        # The web app caches this for a day; the header is part of the
        # contract as much as the body is.
        assert resp.headers["cache-control"] == "public, max-age=86400"
        assert_golden("archetypes.json", resp.content)


@pytest.fixture
def atlas_dir(tmp_path):
    """A one-cell FINIS atlas off Brest, M2 only, height and current.

    Same shape as the real dataset, small enough to write per test. Without
    it the overlay endpoint only ever answers ``covered: false`` in CI, which
    is the branch that needs a golden least. Built by ``atlas_fixtures``,
    which the batch tests write against too: one fixture, one set of numbers,
    and a golden that moves for both at once or for neither.
    """
    return write_finis_atlas(tmp_path)


@pytest.fixture
def atlas_client(atlas_dir):
    """The same app, told where the dataset is.

    Through ``Settings`` rather than a patched global: that is how the real
    deployment says it, and it is the only path that exercises
    ``Services.from_settings``.
    """
    return _deterministic_app(Settings(marc_atlas_dir=str(atlas_dir)))


class TestMarineOverlay:
    """``GET /api/v1/marine/marc`` and its coverage companion."""

    def test_covered_point(self, atlas_client) -> None:
        client = atlas_client
        resp = client.get(
            "/api/v1/marine/marc",
            params={
                "lat": BREST[0],
                "lon": BREST[1],
                "start": DEPARTURE.isoformat(),
                "end": (DEPARTURE + timedelta(hours=6)).isoformat(),
            },
        )
        assert resp.status_code == 200
        assert resp.headers["cache-control"] == "public, max-age=86400"
        assert_golden("marine_marc_covered.json", resp.content)

    def test_uncovered_point(self, client) -> None:
        """No dataset attached: the Space's own state most of the time."""
        resp = client.get(
            "/api/v1/marine/marc",
            params={
                "lat": 43.0,
                "lon": 6.2,
                "start": DEPARTURE.isoformat(),
                "end": (DEPARTURE + timedelta(hours=6)).isoformat(),
            },
        )
        assert resp.status_code == 200
        assert_golden("marine_marc_uncovered.json", resp.content)

    def test_coverage(self, atlas_client) -> None:
        resp = atlas_client.get("/api/v1/marine/marc/coverage")
        assert resp.status_code == 200
        assert_golden("marine_marc_coverage.json", resp.content)


class TestErrorBodies:
    """Every refusal the web client maps to a message, recorded as bytes.

    These are the goldens that will move when the structured ``code`` field
    lands (GO 3). Recording them now is what makes that addition show up as a
    reviewable diff instead of an invisible change of contract.
    """

    def test_missing_fields(self, client) -> None:
        resp = client.post("/api/v1/passage", json={"waypoints": [MARSEILLE, PORQUEROLLES]})
        assert resp.status_code == 422
        assert_golden("error_missing_fields.json", resp.content)

    def test_invalid_departure(self, client) -> None:
        resp = client.post("/api/v1/passage", json=_passage_body(departure="tomorrow-ish"))
        assert resp.status_code == 422
        assert_golden("error_invalid_departure.json", resp.content)

    def test_naive_departure(self, client) -> None:
        resp = client.post("/api/v1/passage", json=_passage_body(departure="2026-05-01T06:00:00"))
        assert resp.status_code == 422
        assert_golden("error_naive_departure.json", resp.content)

    def test_too_few_waypoints(self, client) -> None:
        resp = client.post("/api/v1/passage", json=_passage_body(waypoints=[MARSEILLE]))
        assert resp.status_code == 422
        assert_golden("error_too_few_waypoints.json", resp.content)

    def test_waypoint_out_of_range(self, client) -> None:
        resp = client.post(
            "/api/v1/passage", json=_passage_body(waypoints=[MARSEILLE, [95.0, 6.2]])
        )
        assert resp.status_code == 422
        assert_golden("error_waypoint_out_of_range.json", resp.content)

    def test_too_many_waypoints(self, client) -> None:
        resp = client.post(
            "/api/v1/passage",
            json=_passage_body(waypoints=[[43.0 + i * 0.01, 6.0] for i in range(60)]),
        )
        assert resp.status_code == 422
        assert_golden("error_too_many_waypoints.json", resp.content)

    def test_unknown_archetype(self, client) -> None:
        resp = client.post("/api/v1/passage", json=_passage_body(archetype="galleon"))
        assert resp.status_code == 422
        assert_golden("error_unknown_archetype.json", resp.content)

    def test_invalid_polar(self, client) -> None:
        resp = client.post(
            "/api/v1/passage",
            json=_passage_body(polar={"tws_kn": [6.0], "twa_deg": [40.0, 90.0]}),
        )
        assert resp.status_code == 422
        assert_golden("error_invalid_polar.json", resp.content)

    def test_invalid_forecast_cache(self, client) -> None:
        resp = client.post("/api/v1/passage", json=_passage_body(forecast_cache={"version": 99}))
        assert resp.status_code == 422
        assert_golden("error_invalid_forecast_cache.json", resp.content)

    def test_invalid_efficiency(self, client) -> None:
        resp = client.post("/api/v1/passage", json=_passage_body(efficiency=4.0))
        assert resp.status_code == 422
        assert_golden("error_invalid_efficiency.json", resp.content)

    def test_marc_step_ceiling(self, client) -> None:
        resp = client.get(
            "/api/v1/marine/marc",
            params={
                "lat": BREST[0],
                "lon": BREST[1],
                "start": DEPARTURE.isoformat(),
                "end": (DEPARTURE + timedelta(days=30)).isoformat(),
                "step_minutes": 5,
            },
        )
        assert resp.status_code == 422
        assert_golden("error_marc_step_ceiling.json", resp.content)

    def test_body_too_large(self, client) -> None:
        oversized = b'{"filler":"' + b"a" * (5 * 1024 * 1024) + b'"}'
        resp = client.post(
            "/api/v1/passage",
            content=oversized,
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 413
        assert_golden("error_body_too_large.json", resp.content)


def _corridor_points() -> list[tuple[float, float]]:
    """The midpoints the engine will sample, computed the way the engine does.

    Reproduced from ``geometry`` rather than hard-coded so the fixture follows
    the segmentation if it ever changes, instead of silently degrading into a
    nearest-neighbour test with the wrong neighbours.
    """
    from openwind_data.routing.geometry import Point, midpoint, segment_route

    route = [
        Point(lat=MARSEILLE[0], lon=MARSEILLE[1]),
        Point(lat=PORQUEROLLES[0], lon=PORQUEROLLES[1]),
    ]
    return [(p.lat, p.lon) for p in (midpoint(s.start, s.end) for s in segment_route(route, 10.0))]


# Arrival of the third window of the sweep above, to the minute. Pinned as a
# constant rather than derived at run time so the filter is exercised against
# a value that cannot drift with the fixture.
TARGET_ETA = datetime(2026, 5, 1, 16, 30, tzinfo=UTC)
