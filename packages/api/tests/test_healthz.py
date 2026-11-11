# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""``GET /healthz``: which datasets this process serves with, and how loaded it is.

The failure it exists to expose is a quiet one: a deployment built without
the tidal atlases answers every request, and answers the Raz de Sein with
an 8 km global current. These tests pin that the route says so, that it
stays cheap, and that it carries nothing about the people calling.
"""

from __future__ import annotations

from atlas_fixtures import write_finis_atlas, write_shom_registry
from starlette.testclient import TestClient

from openwind_api import Settings, create_app

# The CPU gate is a separate change the route reads when present; its part of
# the document is tested only where the services carry one.


def test_a_deployment_without_the_datasets_is_reported_degraded() -> None:
    with TestClient(create_app(Settings())) as client:
        resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["problems"] == ["no_harmonic_atlas", "no_shom_c2d", "no_land_mask"]
    assert body["atlases"] == {
        "harmonic": {},
        "harmonic_total": 0,
        "shom_c2d": {"atlases": 0, "points": 0},
    }
    assert body["land_mask"] is False


def test_it_reports_the_atlases_by_family(tmp_path) -> None:
    write_finis_atlas(tmp_path)
    write_shom_registry(tmp_path)
    settings = Settings(marc_atlas_dir=str(tmp_path), shom_c2d_dir=str(tmp_path))
    with TestClient(create_app(settings)) as client:
        body = client.get("/healthz").json()
    assert body["atlases"]["harmonic"] == {"marc": 1}
    assert body["atlases"]["harmonic_total"] == 1
    assert body["atlases"]["shom_c2d"]["points"] > 0
    assert "no_harmonic_atlas" not in body["problems"]
    assert "no_shom_c2d" not in body["problems"]


def test_it_reports_the_budget_and_the_cache() -> None:
    with TestClient(create_app(Settings())) as client:
        body = client.get("/healthz").json()
    assert body["upstream_budget"] == {
        "enabled": True,
        "windows": {
            "minute": {"used": 0.0, "limit": 480.0, "remaining": 480.0},
            "hour": {"used": 0.0, "limit": 4000.0, "remaining": 4000.0},
            "day": {"used": 0.0, "limit": 8000.0, "remaining": 8000.0},
        },
        "spent_total": 0.0,
        "refused_total": 0,
    }
    assert body["forecast_cache"] == {"entries": 0, "max_entries": 64, "inflight": 0}


def test_the_settings_reach_the_budget() -> None:
    settings = Settings(upstream_budget_enabled=False, upstream_budget_limits={"minute": 100})
    with TestClient(create_app(settings)) as client:
        body = client.get("/healthz").json()
    assert body["upstream_budget"]["enabled"] is False
    assert list(body["upstream_budget"]["windows"]) == ["minute"]


def test_nothing_in_it_is_about_the_caller() -> None:
    with TestClient(create_app(Settings())) as client:
        resp = client.get("/healthz", headers={"X-Forwarded-For": "203.0.113.7"})
    text = resp.text
    assert "203.0.113" not in text
    assert "bucket" not in text


def test_settings_from_env_reads_the_new_knobs() -> None:
    settings = Settings.from_env(
        {
            "OPENWIND_UPSTREAM_BUDGET": "0",
            "OPENWIND_UPSTREAM_BUDGET_PER_HOUR": "1000",
        }
    )
    assert settings.upstream_budget_enabled is False
    assert settings.upstream_budget_limits == {"minute": 480, "hour": 1000, "day": 8000}
