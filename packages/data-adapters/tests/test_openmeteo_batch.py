"""Tests for OpenMeteoAdapter.prewarm_batch (multi-coordinate batching).

The win: a passage samples one point per segment, so the per-segment fetch path
issues ~2*N HTTP calls. prewarm_batch fetches all points in 1 wind + 1 marine
call and fills the cache, so those per-segment fetches become hits — making the
call count independent of the number of segments.
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import respx

from openwind_data.adapters.openmeteo import (
    DEFAULT_MODEL,
    FORECAST_URL,
    MARINE_URL,
    OpenMeteoAdapter,
)
from openwind_data.routing.geometry import Point
from openwind_data.routing.passage import estimate_passage

POINTS = [(43.30, 5.35), (43.15, 5.78), (43.00, 6.20)]


def _start_end():
    return datetime(2026, 4, 26, 0, 0, tzinfo=UTC), datetime(2026, 4, 26, 23, 0, tzinfo=UTC)


@respx.mock
async def test_prewarm_batch_one_call_per_endpoint_then_cache_hits(
    forecast_marseille_arome, marine_porquerolles
):
    fc = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=[forecast_marseille_arome] * len(POINTS))
    )
    mr = respx.get(MARINE_URL).mock(
        return_value=httpx.Response(200, json=[marine_porquerolles] * len(POINTS))
    )
    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()

    await adapter.prewarm_batch(POINTS, start, end, [DEFAULT_MODEL])
    # One request total per endpoint, regardless of point count.
    assert fc.call_count == 1
    assert mr.call_count == 1

    # Every point now resolves from cache — no new HTTP.
    for lat, lon in POINTS:
        bundle = await adapter.fetch(lat, lon, start, end, models=[DEFAULT_MODEL])
        assert bundle.wind_by_model[DEFAULT_MODEL].points
        assert bundle.sea.points
    assert fc.call_count == 1
    assert mr.call_count == 1


@respx.mock
async def test_prewarm_batch_is_cache_aware_idempotent(
    forecast_marseille_arome, marine_porquerolles
):
    fc = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=[forecast_marseille_arome] * len(POINTS))
    )
    respx.get(MARINE_URL).mock(
        return_value=httpx.Response(200, json=[marine_porquerolles] * len(POINTS))
    )
    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    start, end = _start_end()

    await adapter.prewarm_batch(POINTS, start, end, [DEFAULT_MODEL])
    await adapter.prewarm_batch(POINTS, start, end, [DEFAULT_MODEL])
    # Second call finds everything covered → no extra request.
    assert fc.call_count == 1


@respx.mock
async def test_prewarmed_fetch_matches_single_point_fetch(
    forecast_marseille_arome, marine_porquerolles
):
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=[forecast_marseille_arome]))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=[marine_porquerolles]))
    start, end = _start_end()

    batched = OpenMeteoAdapter(http_min_interval_s=0)
    await batched.prewarm_batch([POINTS[0]], start, end, [DEFAULT_MODEL])
    via_cache = await batched.fetch(*POINTS[0], start, end, models=[DEFAULT_MODEL])

    # Same payload via the single-point endpoint (object, not array).
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=forecast_marseille_arome))
    respx.get(MARINE_URL).mock(return_value=httpx.Response(200, json=marine_porquerolles))
    direct = OpenMeteoAdapter(http_min_interval_s=0)
    via_http = await direct.fetch(*POINTS[0], start, end, models=[DEFAULT_MODEL])

    assert (
        via_cache.wind_by_model[DEFAULT_MODEL].points
        == via_http.wind_by_model[DEFAULT_MODEL].points
    )
    assert via_cache.sea.points == via_http.sea.points


@respx.mock
async def test_estimate_passage_call_count_independent_of_segments(
    forecast_marseille_arome, marine_porquerolles
):
    fc = respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(200, json=[forecast_marseille_arome] * 12)
    )
    mr = respx.get(MARINE_URL).mock(
        return_value=httpx.Response(200, json=[marine_porquerolles] * 12)
    )
    adapter = OpenMeteoAdapter(http_min_interval_s=0)
    # ~41 nm at 5 nm segments → ~9 segments; without batching that is ~9 wind +
    # ~9 marine calls. With prewarm_batch it is 1 + 1.
    report = await estimate_passage(
        [Point(43.30, 5.35), Point(43.00, 6.20)],
        datetime(2026, 4, 26, 6, 0, tzinfo=UTC),
        "cruiser_40ft",
        adapter=adapter,
        segment_length_nm=5.0,
        model=DEFAULT_MODEL,
    )
    assert report.segments
    assert fc.call_count == 1
    assert mr.call_count == 1
