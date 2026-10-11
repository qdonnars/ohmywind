# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tests for the documented zones where the current is withheld."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from importlib import resources
from pathlib import Path

from openwind_data.adapters.base import (
    ForecastBundle,
    SeaPoint,
    SeaSeries,
    WindPoint,
    WindSeries,
)
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.router import CompositeMarineAdapter
from openwind_data.currents.unknown_zones import (
    FIELDS,
    REASONS,
    UNKNOWN_CURRENT_SOURCE,
    unknown_zone_along,
    unknown_zone_at,
)

_SERVER = resources.files("openwind_data.currents").joinpath("unknown_zones.geojson")
_WEB = Path(__file__).parents[3] / "web/src/domain/unknownZones.json"

# Rance points: above the plant (MARC MANW's dead basin, MANGA's free tide),
# and the sea just outside it.
SAINT_SULIAC = (48.567, -1.975)
LA_RICHARDAIS = (48.6, -2.03)
DINARD_ROADS = (48.64, -2.06)


def test_every_zone_says_why_and_what_it_withholds() -> None:
    fc = json.loads(_SERVER.read_text())
    ids = [f["properties"]["id"] for f in fc["features"]]
    assert ids and len(ids) == len(set(ids))
    for f in fc["features"]:
        p = f["properties"]
        assert p["reason"] in REASONS
        assert p["fields"] and set(p["fields"]) <= FIELDS
        # A zone without a citation is the hand-drawn box narrow_pass dropped.
        assert len(p["source"]) > 40
        assert p["name"] and p["added"]
        assert f["geometry"]["type"] in {"Polygon", "MultiPolygon"}


def test_the_web_bundles_the_same_file() -> None:
    assert json.loads(_WEB.read_text()) == json.loads(_SERVER.read_text())


def test_the_rance_basin_is_a_zone_and_the_sea_outside_is_not() -> None:
    for lat, lon in (SAINT_SULIAC, LA_RICHARDAIS):
        zone = unknown_zone_at(lat, lon)
        assert zone is not None and zone.id == "rance"
        assert zone.fields == {"current", "tide"}
    assert unknown_zone_at(*DINARD_ROADS) is None
    assert unknown_zone_at(43.29, 5.37) is None  # Marseille


def test_a_leg_that_cuts_the_zone_is_caught_with_both_ends_outside() -> None:
    # A leg crossing the basin east-west with both ends on the banks outside
    # the polygon: neither end is in, the leg still spends time in it.
    zone = unknown_zone_along(48.55, -2.10, 48.55, -1.90)
    assert zone is not None and zone.id == "rance"
    assert unknown_zone_along(*DINARD_ROADS, 48.66, -2.10) is None


def _bundle(lat: float, lon: float) -> ForecastBundle:
    base = datetime(2026, 10, 11, 12, tzinfo=UTC)
    times = [base + timedelta(hours=h) for h in range(3)]
    sea = tuple(
        SeaPoint(
            time=t,
            wave_height_m=0.4,
            wave_period_s=4.0,
            wave_direction_deg=300.0,
            wind_wave_height_m=0.3,
            swell_wave_height_m=0.1,
            current_speed_kn=1.2,
            current_direction_to_deg=180.0,
            tide_height_m=2.0,
            current_source="openmeteo_smoc",
        )
        for t in times
    )
    wind = WindSeries(
        model="m",
        points=tuple(
            WindPoint(time=t, speed_kn=10, direction_deg=270, gust_kn=None) for t in times
        ),
    )
    return ForecastBundle(
        lat=lat,
        lon=lon,
        start=times[0],
        end=times[-1],
        wind_by_model={"m": wind},
        sea=SeaSeries(points=sea),
        requested_at=base,
    )


class _Upstream:
    async def fetch(self, lat, lon, start, end, models=None) -> ForecastBundle:
        return _bundle(lat, lon)


async def test_the_cascade_withholds_current_and_tide_in_the_rance() -> None:
    adapter = CompositeMarineAdapter(upstream=_Upstream(), marc=MarcAtlasRegistry(atlases=()))
    start = datetime(2026, 10, 11, 12, tzinfo=UTC)
    inside = await adapter.fetch(*SAINT_SULIAC, start, start + timedelta(hours=2))
    for p in inside.sea.points:
        assert p.current_speed_kn is None and p.current_direction_to_deg is None
        assert p.tide_height_m is None
        assert p.current_source == UNKNOWN_CURRENT_SOURCE
        assert p.wave_height_m == 0.4  # the sea state is not the zone's business
    outside = await adapter.fetch(*DINARD_ROADS, start, start + timedelta(hours=2))
    assert all(p.current_speed_kn == 1.2 for p in outside.sea.points)


async def test_the_cascade_withholds_dead_water_of_a_coastal_atlas(tmp_path) -> None:
    """A river beyond the model, as Rouen in MARC MANE (placed outside every zone): the atlas covers, its cells are dead. The point gets
    no current and no tide under the "unknown" source, not a zero and not the
    global model under MANE's name."""
    from tests.currents.test_marc_atlas import _COASTAL, _write_rows

    _write_rows(
        tmp_path,
        "MANE",
        _COASTAL,
        [
            {"lat": 47.300, "lon": -2.300, "h": 2.5, "u": 0.6, "v": 0.2},
            {"lat": 47.440, "lon": -2.400, "h": 0.0, "u": 0.0, "v": 0.0},
        ],
    )
    adapter = CompositeMarineAdapter(
        upstream=_Upstream(), marc=MarcAtlasRegistry.from_directory(tmp_path)
    )
    start = datetime(2026, 10, 11, 12, tzinfo=UTC)
    dead = await adapter.fetch(47.440, -2.400, start, start + timedelta(hours=2))
    for p in dead.sea.points:
        assert p.current_speed_kn is None and p.current_direction_to_deg is None
        assert p.tide_height_m is None
        assert p.current_source == UNKNOWN_CURRENT_SOURCE
    alive = await adapter.fetch(47.300, -2.300, start, start + timedelta(hours=2))
    assert all(
        p.current_source == "marc_mane_250m" and p.current_speed_kn for p in alive.sea.points
    )


def test_the_seine_above_the_pont_de_normandie_is_a_zone_and_its_mouth_is_not() -> None:
    # MARC MANE reads 0.04 kt for a 7.6 m range above the bridge, dead water
    # from Caudebec to Rouen: the whole river is one named zone. Honfleur and
    # the Le Havre roads, where MANE reads 2.7 and 1.2 kt, stay outside.
    for lat, lon in ((49.45, 0.35), (49.47, 0.46), (49.526, 0.728), (49.44, 1.08)):
        zone = unknown_zone_at(lat, lon)
        assert zone is not None and zone.id == "seine_maritime", (lat, lon)
        assert zone.fields == {"current"}
    assert unknown_zone_at(49.43, 0.24) is None  # Honfleur
    assert unknown_zone_at(49.48, 0.05) is None  # Le Havre roads
