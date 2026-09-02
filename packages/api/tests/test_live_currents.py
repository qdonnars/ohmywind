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

The registries here are the synthetic ones the data-adapters suite builds: a
MARC atlas of a single cell, and a SHOM zone of three points anchored on
Brest. What is asserted is provenance and wiring, never the numbers, which
have their own tests where the predictors live.
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest
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


def _write_shom_registry(out: Path) -> None:
    """Three points on one zone, referred to Brest. Mirrors the domain fixture."""
    out.mkdir(parents=True, exist_ok=True)
    hours = list(range(-6, 7))
    u_ve = [math.sin(math.pi * h / 6.0) for h in hours]
    rows = [
        {
            "atlas_id": 558,
            "zone": "TEST_ZONE",
            "ref_port_key": "BREST",
            "ref_tide": "PM",
            "lat": lat,
            "lon": lon,
            "u_ve_kn": u_ve,
            "v_ve_kn": [0.0 for _ in hours],
            "u_me_kn": [0.5 * v for v in u_ve],
            "v_me_kn": [0.0 for _ in hours],
        }
        for lat, lon in ((47.50, -2.90), (47.51, -2.89), (47.49, -2.91))
    ]
    pl.DataFrame(rows).with_columns(
        pl.col("atlas_id").cast(pl.Int16),
        pl.col("lat").cast(pl.Float32),
        pl.col("lon").cast(pl.Float32),
        pl.col("u_ve_kn").cast(pl.List(pl.Float32)),
        pl.col("v_ve_kn").cast(pl.List(pl.Float32)),
        pl.col("u_me_kn").cast(pl.List(pl.Float32)),
        pl.col("v_me_kn").cast(pl.List(pl.Float32)),
    ).write_parquet(out / "shom_c2d_points.parquet")
    (out / "shom_c2d_ref_ports.json").write_text(
        json.dumps(
            {
                "BREST": {
                    "display_name": "Brest",
                    "lat": 48.3833,
                    "lon": -4.4956,
                    "ref_tide": "PM",
                    "constants": {"M2": [2.0, 150.0], "S2": [0.7, 200.0]},
                }
            },
            ensure_ascii=False,
        )
    )


def _write_marc_atlas(out: Path) -> None:
    """One 250 m cell covering the same water, so the cascade composes."""
    atlas = out / "MORBI"
    tile = atlas / "tile_lat=47.5" / "tile_lon=-3.0"
    tile.mkdir(parents=True, exist_ok=True)
    (atlas / "metadata.json").write_text(
        json.dumps(
            {
                "atlas": "MORBI",
                "rank": 2,
                "resolution_m": 250,
                "constituents_h": ["M2"],
                "constituents_u": ["M2"],
                "constituents_v": ["M2"],
            }
        )
    )
    (atlas / "coverage.geojson").write_text(
        json.dumps(
            {
                "features": [
                    {
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [[-3.0, 47.4], [-2.8, 47.4], [-2.8, 47.6], [-3.0, 47.6]]
                            ],
                        }
                    }
                ]
            }
        )
    )
    pl.DataFrame(
        {
            "lat": [47.505],
            "lon": [-2.895],
            "z0_hydro_m": [-3.10],
            "M2_h_amp": [2.05],
            "M2_h_g": [108.0],
            "M2_u_amp": [0.5],
            "M2_u_g": [80.0],
            "M2_v_amp": [0.3],
            "M2_v_g": [120.0],
        }
    ).write_parquet(tile / "data.parquet", compression="zstd")


@pytest.fixture
def atlas_dirs(tmp_path):
    _write_shom_registry(tmp_path / "shom")
    _write_marc_atlas(tmp_path / "marc")
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
