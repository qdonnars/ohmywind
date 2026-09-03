# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""A live REST passage reads its currents off the same atlases the MCP tools do.

This is audit finding M2, pinned. A request without a ``forecast_cache`` used
to let the passage engine build itself a bare ``OpenMeteoAdapter``, which knows
nothing about the tidal atlases shipped in the image: the same waypoint in the
Morbihan answered ``shom_c2d_558_test_zone`` over MCP and ``openmeteo_smoc``
over REST, from one process, with both datasets loaded in memory. A 0.9 kn
spring stream reported as 0.2 kn is a wrong ETA through a pass, not a cosmetic
divergence.

The registries here are the synthetic ones ``atlas_fixtures`` builds: a MARC
atlas of a single cell, and a SHOM zone of three points anchored on Brest. What is asserted is provenance and wiring, never the numbers, which
have their own tests where the predictors live.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from atlas_fixtures import write_marc_atlas, write_shom_registry
from openwind_data.testing import (
    DeterministicMarineAdapter,
    browser_cache_payload,
    hourly_axis,
)
from starlette.testclient import TestClient

from openwind_api.app import create_app
from openwind_api.settings import Settings

# Inside the synthetic SHOM zone (three points around 47.50, -2.90) and inside
# the synthetic MARC atlas below, which is what the cascade needs to reach its
# top tier: SHOM alone does not compose (see ``compose_marine_adapter``).
MORBIHAN = [[47.50, -2.90], [47.51, -2.89]]
DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)


@pytest.fixture
def atlas_dirs(tmp_path):
    write_shom_registry(tmp_path / "shom")
    write_marc_atlas(tmp_path / "marc")
    return tmp_path / "marc", tmp_path / "shom"


@pytest.fixture
def client(atlas_dirs):
    """The real app on real registries, with only the weather stubbed.

    The stub replaces the composite's *upstream*, not the composite: the
    cascade under test is the shipped one, and what it overrides is a bundle
    of deterministic SMOC values rather than a live Open-Meteo answer.
    """
    marc_dir, shom_dir = atlas_dirs
    app = create_app(Settings(marc_atlas_dir=str(marc_dir), shom_c2d_dir=str(shom_dir)))
    app.state.services.marine.upstream = DeterministicMarineAdapter()
    return TestClient(app)


def _body(**extra) -> dict:
    body = {
        "waypoints": MORBIHAN,
        "departure": DEPARTURE.isoformat(),
        "archetype": "cruiser_30ft",
    }
    body.update(extra)
    return body


def test_a_live_passage_reports_the_shom_atlas_as_its_current_source(client) -> None:
    resp = client.post("/api/v1/passage", json=_body())
    assert resp.status_code == 200, resp.text
    sources = {seg["current_source"] for seg in resp.json()["passage"]["segments"]}
    assert sources == {"shom_c2d_558_test_zone"}


def test_the_same_request_off_the_browser_cache_keeps_the_browser_provenance(client) -> None:
    """The other door, unchanged and deliberately so.

    A ``forecast_cache`` is the browser's own sampling, overlaid client-side
    with whatever ``/api/v1/marine/marc`` gave it. The server does not
    second-guess it: reading the atlases again here would cost the CPU the
    payload exists to save, and would silently disagree with what the user is
    looking at on the map.
    """
    axis = hourly_axis(DEPARTURE, DEPARTURE.replace(hour=18))
    payload = browser_cache_payload([(47.50, -2.90), (47.51, -2.89)], axis)
    resp = client.post("/api/v1/passage", json=_body(forecast_cache=payload))
    assert resp.status_code == 200, resp.text
    sources = {seg["current_source"] for seg in resp.json()["passage"]["segments"]}
    assert sources == {"openmeteo_smoc"}


def test_the_atlases_are_loaded_once_for_the_whole_process(client) -> None:
    """One registry object, reachable both ways: as data and through the adapter.

    Two copies is what the audit measured (M5), and the only observable
    difference between one and two is memory, which no assertion can see. The
    identity can.
    """
    services = client.app.state.services
    assert services.marine.shom is services.shom
    assert services.marine.marc is services.marc
