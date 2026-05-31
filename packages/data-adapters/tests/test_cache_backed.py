from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from openwind_data.adapters.cache_backed import SUPPORTED_VERSION, CacheBackedAdapter
from openwind_data.adapters.openmeteo import AUTO_MODEL
from openwind_data.routing.geometry import Point
from openwind_data.routing.passage import estimate_passage

# A fixed hourly axis: 2026-05-01 00:00..05:00 UTC (6 points).
_T0 = datetime(2026, 5, 1, 0, 0, tzinfo=UTC)
_TIMES_MS = [int((_T0 + timedelta(hours=h)).timestamp() * 1000) for h in range(6)]


def _wind(speed, direction, gust=None):
    n = len(_TIMES_MS)
    return {
        "speed_kn": list(speed),
        "direction_deg": list(direction),
        "gust_kn": list(gust) if gust is not None else [None] * n,
    }


def _sea(**overrides):
    n = len(_TIMES_MS)
    base = {
        "wave_height_m": [0.5] * n,
        "wave_period_s": [4.0] * n,
        "wave_direction_deg": [200.0] * n,
        "current_speed_kn": [0.2] * n,
        "current_direction_to_deg": [90.0] * n,
        "tide_height_m": [1.0] * n,
        "current_source": "openmeteo_smoc",
    }
    base.update(overrides)
    return base


def _payload(points, models=("meteofrance_arome_france", "icon_eu")):
    return {
        "version": SUPPORTED_VERSION,
        "models": list(models),
        "times_ms": list(_TIMES_MS),
        "points": points,
    }


def _point(lat, lon, wind_by_model, sea=None):
    return {
        "lat": lat,
        "lon": lon,
        "wind_by_model": wind_by_model,
        "sea": sea if sea is not None else _sea(),
    }


# --------------------------------------------------------------- from_payload


def test_from_payload_valid() -> None:
    n = len(_TIMES_MS)
    adapter = CacheBackedAdapter.from_payload(
        _payload([_point(43.3, 5.35, {"meteofrance_arome_france": _wind([10.0] * n, [180.0] * n)})])
    )
    assert isinstance(adapter, CacheBackedAdapter)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p.update(version=999),
        lambda p: p.update(models=[]),
        lambda p: p.update(times_ms=[]),
        lambda p: p.update(points="nope"),
        lambda p: p["points"][0].update(lat="abc"),
        # wind array length mismatch with the time axis
        lambda p: p["points"][0]["wind_by_model"]["meteofrance_arome_france"].update(
            speed_kn=[1.0, 2.0]
        ),
        lambda p: p["points"][0]["sea"].update(current_source=123),
    ],
)
def test_from_payload_rejects_bad_shape(mutate) -> None:
    n = len(_TIMES_MS)
    payload = _payload(
        [_point(43.3, 5.35, {"meteofrance_arome_france": _wind([10.0] * n, [180.0] * n)})]
    )
    mutate(payload)
    with pytest.raises(ValueError):
        CacheBackedAdapter.from_payload(payload)


def test_non_dict_payload_rejected() -> None:
    with pytest.raises(ValueError):
        CacheBackedAdapter.from_payload([1, 2, 3])


# ---------------------------------------------------------------------- fetch


@pytest.mark.asyncio
async def test_fetch_nearest_neighbour_picks_closest_point() -> None:
    n = len(_TIMES_MS)
    payload = _payload(
        [
            _point(43.0, 5.0, {"meteofrance_arome_france": _wind([5.0] * n, [10.0] * n)}),
            _point(43.5, 5.5, {"meteofrance_arome_france": _wind([20.0] * n, [200.0] * n)}),
        ]
    )
    adapter = CacheBackedAdapter.from_payload(payload)
    bundle = await adapter.fetch(
        43.49, 5.49, _T0, _T0 + timedelta(hours=5), models=["meteofrance_arome_france"]
    )
    pts = bundle.wind_by_model["meteofrance_arome_france"].points
    assert pts and all(p.speed_kn == 20.0 for p in pts)


@pytest.mark.asyncio
async def test_fetch_clips_to_window() -> None:
    n = len(_TIMES_MS)
    adapter = CacheBackedAdapter.from_payload(
        _payload([_point(43.3, 5.35, {"meteofrance_arome_france": _wind([10.0] * n, [180.0] * n)})])
    )
    bundle = await adapter.fetch(
        43.3,
        5.35,
        _T0 + timedelta(hours=1),
        _T0 + timedelta(hours=3),
        models=["meteofrance_arome_france"],
    )
    pts = bundle.wind_by_model["meteofrance_arome_france"].points
    assert [p.time for p in pts] == [
        _T0 + timedelta(hours=1),
        _T0 + timedelta(hours=2),
        _T0 + timedelta(hours=3),
    ]


@pytest.mark.asyncio
async def test_fetch_drops_null_wind_hours() -> None:
    speed = [10.0, None, 10.0, 10.0, None, 10.0]
    direction = [180.0, 180.0, None, 180.0, 180.0, 180.0]
    adapter = CacheBackedAdapter.from_payload(
        _payload([_point(43.3, 5.35, {"meteofrance_arome_france": _wind(speed, direction)})])
    )
    bundle = await adapter.fetch(
        43.3, 5.35, _T0, _T0 + timedelta(hours=5), models=["meteofrance_arome_france"]
    )
    pts = bundle.wind_by_model["meteofrance_arome_france"].points
    # Indices 1 (null speed), 2 (null dir), 4 (null speed) dropped -> 3 left.
    assert [p.time.hour for p in pts] == [0, 3, 5]


@pytest.mark.asyncio
async def test_fetch_absent_slug_returns_empty_series() -> None:
    n = len(_TIMES_MS)
    adapter = CacheBackedAdapter.from_payload(
        _payload([_point(43.3, 5.35, {"meteofrance_arome_france": _wind([10.0] * n, [180.0] * n)})])
    )
    # ICON not present at this point -> empty series (drives server fallback).
    bundle = await adapter.fetch(43.3, 5.35, _T0, _T0 + timedelta(hours=5), models=["icon_eu"])
    assert bundle.wind_by_model["icon_eu"].points == ()


@pytest.mark.asyncio
async def test_fetch_window_outside_axis_returns_empty() -> None:
    n = len(_TIMES_MS)
    adapter = CacheBackedAdapter.from_payload(
        _payload([_point(43.3, 5.35, {"meteofrance_arome_france": _wind([10.0] * n, [180.0] * n)})])
    )
    far = _T0 + timedelta(days=30)
    bundle = await adapter.fetch(
        43.3, 5.35, far, far + timedelta(hours=2), models=["meteofrance_arome_france"]
    )
    assert bundle.wind_by_model["meteofrance_arome_france"].points == ()


@pytest.mark.asyncio
async def test_fetch_current_source_propagates() -> None:
    n = len(_TIMES_MS)
    sea = _sea(current_source="marc_finis_250m")
    adapter = CacheBackedAdapter.from_payload(
        _payload(
            [
                _point(
                    43.3,
                    5.35,
                    {"meteofrance_arome_france": _wind([10.0] * n, [180.0] * n)},
                    sea=sea,
                )
            ]
        )
    )
    bundle = await adapter.fetch(
        43.3, 5.35, _T0, _T0 + timedelta(hours=5), models=["meteofrance_arome_france"]
    )
    assert all(p.current_source == "marc_finis_250m" for p in bundle.sea.points)


@pytest.mark.asyncio
async def test_fetch_current_source_none_when_no_current_or_tide() -> None:
    n = len(_TIMES_MS)
    sea = _sea(current_speed_kn=[None] * n, tide_height_m=[None] * n)
    adapter = CacheBackedAdapter.from_payload(
        _payload(
            [
                _point(
                    43.3,
                    5.35,
                    {"meteofrance_arome_france": _wind([10.0] * n, [180.0] * n)},
                    sea=sea,
                )
            ]
        )
    )
    bundle = await adapter.fetch(
        43.3, 5.35, _T0, _T0 + timedelta(hours=5), models=["meteofrance_arome_france"]
    )
    assert all(p.current_source is None for p in bundle.sea.points)


@pytest.mark.asyncio
async def test_fetch_requires_tz_aware() -> None:
    n = len(_TIMES_MS)
    adapter = CacheBackedAdapter.from_payload(
        _payload([_point(43.3, 5.35, {"meteofrance_arome_france": _wind([10.0] * n, [180.0] * n)})])
    )
    with pytest.raises(ValueError):
        await adapter.fetch(43.3, 5.35, datetime(2026, 5, 1, 0, 0), _T0 + timedelta(hours=2))


# ----------------------------------------------- integration with estimate_passage

_DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
_MARSEILLE = Point(43.30, 5.35)
_PORQUEROLLES = Point(43.00, 6.20)


def _corridor_cache(*, with_arome: bool = True) -> CacheBackedAdapter:
    """Two-endpoint corridor cache, constant 10 kn northerly, axis 04:00..18:00.

    Constant wind everywhere means nearest-neighbour is immaterial: every
    segment midpoint snaps to one endpoint and reads the same series. The axis
    spans the whole passage plus the per-segment +/-90 min fetch windows.
    """
    t0 = datetime(2026, 5, 1, 4, 0, tzinfo=UTC)
    times_ms = [int((t0 + timedelta(hours=h)).timestamp() * 1000) for h in range(15)]
    n = len(times_ms)

    def wind_block() -> dict:
        block = {"icon_eu": _const_wind(n)}
        if with_arome:
            block["meteofrance_arome_france"] = _const_wind(n)
        return block

    def sea_block() -> dict:
        return {
            "wave_height_m": [0.4] * n,
            "wave_period_s": [4.0] * n,
            "wave_direction_deg": [0.0] * n,
            "current_speed_kn": [0.1] * n,
            "current_direction_to_deg": [90.0] * n,
            "tide_height_m": [0.0] * n,
            "current_source": "openmeteo_smoc",
        }

    points = [
        {"lat": p.lat, "lon": p.lon, "wind_by_model": wind_block(), "sea": sea_block()}
        for p in (_MARSEILLE, _PORQUEROLLES)
    ]
    return CacheBackedAdapter.from_payload(
        {
            "version": SUPPORTED_VERSION,
            "models": ["meteofrance_arome_france", "icon_eu"],
            "times_ms": times_ms,
            "points": points,
        }
    )


def _const_wind(n: int) -> dict:
    return {"speed_kn": [10.0] * n, "direction_deg": [0.0] * n, "gust_kn": [None] * n}


@pytest.mark.asyncio
async def test_estimate_passage_reads_cache() -> None:
    report = await estimate_passage(
        [_MARSEILLE, _PORQUEROLLES],
        _DEPARTURE,
        "cruiser_40ft",
        adapter=_corridor_cache(),
        segment_length_nm=5.0,
        model=AUTO_MODEL,
        model_chain=("meteofrance_arome_france", "icon_eu"),
    )
    assert 40.0 < report.distance_nm < 43.0
    assert 6.0 < report.duration_h < 11.0
    assert all(seg.tws_kn == 10.0 for seg in report.segments)
    assert all(seg.model_used == "meteofrance_arome_france" for seg in report.segments)


@pytest.mark.asyncio
async def test_estimate_passage_falls_back_when_primary_absent() -> None:
    # AROME absent from every corridor point -> per-segment fallback to icon_eu.
    report = await estimate_passage(
        [_MARSEILLE, _PORQUEROLLES],
        _DEPARTURE,
        "cruiser_40ft",
        adapter=_corridor_cache(with_arome=False),
        segment_length_nm=5.0,
        model=AUTO_MODEL,
        model_chain=("meteofrance_arome_france", "icon_eu"),
    )
    assert all(seg.model_used == "icon_eu" for seg in report.segments)
