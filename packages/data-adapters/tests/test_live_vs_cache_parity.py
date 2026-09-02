# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The same weather, entered by two doors, must produce the same passage.

Door one: ``OpenMeteoAdapter`` against a mocked Open-Meteo, the path an MCP
client takes. Door two: ``CacheBackedAdapter`` over the corridor bundle the
web client samples in the browser and posts with the request, the path every
``/plan`` calculation takes. Until now nothing checked that the two agree, and
they are the two halves of the same product: a user comparing a plan made in
the web app with the same plan made through an assistant is comparing these.

The audit listed this as the second missing test (annexe C, "Tests
manquants"). It is also the precondition for PR 2.3, which will let the live
REST path reach the coastal current sources the cached path already gets: a
difference introduced there has to be visible against a baseline of exact
equality, not against "roughly the same".

Both adapters are fed by ``openwind_data.testing``, which generates
Open-Meteo-shaped responses and browser-cache-shaped payloads from one
closed-form function of ``(lat, lon, time)``. The current is generated in
km/h, the unit the API answers in, precisely so that the knots the adapter
computes on ingestion and the knots the cache carries are the same double
rather than two roundings of the same number.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx

from openwind_data.adapters.cache_backed import CacheBackedAdapter
from openwind_data.adapters.openmeteo import FORECAST_URL, MARINE_URL, OpenMeteoAdapter
from openwind_data.routing.geometry import Point, midpoint, segment_route
from openwind_data.routing.passage import estimate_passage
from openwind_data.testing import (
    browser_cache_payload,
    hourly_axis,
    openmeteo_marine_response,
    openmeteo_wind_response,
)

MODEL = "meteofrance_arome_france"
SEGMENT_LENGTH_NM = 10.0

MARSEILLE = Point(lat=43.29, lon=5.37)
PORQUEROLLES = Point(lat=43.00, lon=6.20)
ROUTE = [MARSEILLE, PORQUEROLLES]


def _departure() -> datetime:
    """Tomorrow, on the hour.

    Not a fixed date: ``OpenMeteoAdapter`` refuses anything past today + 14 d
    before it even issues a request, so a hard-coded 2026 departure would turn
    this into a test of that guard the moment the calendar moved past it.
    """
    return datetime.now(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(days=1)


def _corridor() -> list[tuple[float, float]]:
    """The points the engine will sample, computed the way the engine does.

    Segment midpoints, which is also what the web client samples since it was
    aligned on the server's segmentation. Nearest-neighbour lookup in the
    cache therefore lands exactly on them, which is what makes the comparison
    below about the two code paths rather than about spatial interpolation.
    """
    return [
        (p.lat, p.lon)
        for p in (midpoint(s.start, s.end) for s in segment_route(ROUTE, SEGMENT_LENGTH_NM))
    ]


def _hourly_from_query(request: httpx.Request) -> tuple[list[tuple[float, float]], list[datetime]]:
    """Decode the coordinates and the day range Open-Meteo was asked for.

    Handles the single-coordinate and the comma-separated multi-coordinate
    forms with the same code, because the adapter uses both: one batched
    prewarm call, then one call per point for anything the batch missed.
    """
    params = request.url.params
    lats = [float(v) for v in params["latitude"].split(",")]
    lons = [float(v) for v in params["longitude"].split(",")]
    start = datetime.fromisoformat(params["start_date"]).replace(tzinfo=UTC)
    end = datetime.fromisoformat(params["end_date"]).replace(tzinfo=UTC) + timedelta(hours=23)
    return list(zip(lats, lons, strict=True)), hourly_axis(start, end)


@pytest.fixture
def open_meteo():
    """Open-Meteo, answering from the generator instead of from the network."""

    def _wind(request: httpx.Request) -> httpx.Response:
        points, axis = _hourly_from_query(request)
        bodies = [openmeteo_wind_response(lat, lon, axis) for lat, lon in points]
        return httpx.Response(200, json=bodies if len(bodies) > 1 else bodies[0])

    def _marine(request: httpx.Request) -> httpx.Response:
        points, axis = _hourly_from_query(request)
        bodies = [openmeteo_marine_response(lat, lon, axis) for lat, lon in points]
        return httpx.Response(200, json=bodies if len(bodies) > 1 else bodies[0])

    with respx.mock:
        respx.get(FORECAST_URL).mock(side_effect=_wind)
        respx.get(MARINE_URL).mock(side_effect=_marine)
        yield


async def _live_report(departure: datetime):
    return await estimate_passage(
        ROUTE,
        departure,
        "cruiser_30ft",
        adapter=OpenMeteoAdapter(http_min_interval_s=0),
        segment_length_nm=SEGMENT_LENGTH_NM,
        model="auto",
        model_chain=(MODEL,),
    )


async def _cached_report(departure: datetime):
    axis = hourly_axis(departure - timedelta(hours=3), departure + timedelta(hours=24))
    adapter = CacheBackedAdapter.from_payload(browser_cache_payload(_corridor(), axis, (MODEL,)))
    return await estimate_passage(
        ROUTE,
        departure,
        "cruiser_30ft",
        adapter=adapter,
        segment_length_nm=SEGMENT_LENGTH_NM,
        model="auto",
        model_chain=(MODEL,),
    )


async def test_live_and_cached_passages_are_identical(open_meteo) -> None:
    """Equality of the whole report, dataclass against dataclass.

    ``PassageReport`` is frozen and its fields are floats, strings and nested
    frozen dataclasses, so ``==`` compares every number exactly. A tolerance
    here would hide precisely the kind of drift this exists to catch: a unit
    conversion applied on one path only, a rounding that lands on one side,
    a sea field the cache forgets to carry.
    """
    departure = _departure()
    assert await _live_report(departure) == await _cached_report(departure)


async def test_the_cached_path_carries_the_sea_state_too(open_meteo) -> None:
    """Guards the assertion above against passing for the wrong reason.

    If both paths lost their sea data the reports would still be equal, and
    equal-and-empty proves nothing. Every segment must arrive with a wave
    height, a current and its provenance.
    """
    report = await _cached_report(_departure())
    assert report.segments
    for segment in report.segments:
        assert segment.hs_m is not None
        assert segment.current_speed_kn is not None
        assert segment.sog_kn is not None
        assert segment.current_source == "openmeteo_smoc"


async def test_the_live_path_really_went_through_open_meteo(open_meteo) -> None:
    """And against the other wrong reason: a live path that never fetched.

    ``respx`` would raise on an unmocked call, but a report built from an
    empty bundle would not call at all.
    """
    departure = _departure()
    report = await _live_report(departure)
    assert respx.calls.call_count > 0
    assert report.model == MODEL
    for segment in report.segments:
        assert segment.tws_kn > 0
