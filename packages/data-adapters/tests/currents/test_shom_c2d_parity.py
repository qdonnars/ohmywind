# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The vectorised SHOM predictor against the loop it replaced, sample for sample.

PR 2.4 rewrote ``ShomC2dRegistry.predict_current_series`` from a Python loop
over instants into one harmonic evaluation for the whole series. That is a
rewrite of the thing that decides how fast the water is running in the Raz de
Sein, so "it looks about right" is not a test. ``_reference_predict`` below is
the pre-2.4 implementation, copied verbatim; the two must agree.

They agree exactly, and the reason is worth stating: the vectorised version
does not approximate the old scan, it *is* the old scan. Both sample the tide
on the same 5-minute grid and the coefficient window on the same 30-minute
grid; the rewrite only stopped re-evaluating the overlapping parts. Same
inputs to ``harmonic.predict``, in the same order, so the same doubles come
back. The assertions below allow zero difference on purpose: a tolerance would
hide the day someone changes the grid and calls it a rounding artefact.
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl
import pytest

from openwind_data.currents.harmonic import predict as harmonic_predict
from openwind_data.currents.shom_c2d_registry import (
    _BREST_MEAN_RANGE_M,
    _HOUR_OFFSETS,
    _TIDE_SCAN_HALFWINDOW,
    _TIDE_SCAN_STEP_MIN,
    ShomC2dRegistry,
    _RefPortMeta,
)

_REPO_ROOT = Path(__file__).resolve().parents[3].parent
_LIVE_DIR = _REPO_ROOT / "build" / "shom_c2d"

# In the synthetic zone written below, and in the live Morbihan cartouche.
SYNTHETIC_POINT = (47.50, -2.90)
TASCON = (47.5733, -2.8903)
T0 = datetime(2026, 5, 15, 0, 0, tzinfo=UTC)


# --------------------------------------------------------------------------
# The pre-2.4 implementation, verbatim. Three methods, inlined into one
# function so nothing here can accidentally call the new code.
# --------------------------------------------------------------------------


def _reference_tide_event_time(port: _RefPortMeta, target_t: datetime) -> datetime:
    if target_t.tzinfo is None:
        target_t = target_t.replace(tzinfo=UTC)
    n_steps = int(2 * _TIDE_SCAN_HALFWINDOW.total_seconds() / 60 / _TIDE_SCAN_STEP_MIN) + 1
    offsets_min = np.linspace(
        -_TIDE_SCAN_HALFWINDOW.total_seconds() / 60,
        _TIDE_SCAN_HALFWINDOW.total_seconds() / 60,
        n_steps,
    )
    scan_times = [target_t + timedelta(minutes=float(m)) for m in offsets_min]
    heights = harmonic_predict(scan_times, port.constants)
    idx = int(np.argmax(heights) if port.ref_tide == "PM" else np.argmin(heights))
    return scan_times[idx]


def _reference_coefficient(
    registry: ShomC2dRegistry, port: _RefPortMeta, target_t: datetime
) -> float:
    if target_t.tzinfo is None:
        target_t = target_t.replace(tzinfo=UTC)
    brest = registry.ref_ports.get("BREST")
    anchor = brest if brest is not None else port
    offsets_min = np.linspace(-12.5 * 60, 12.5 * 60, 51)
    scan_times = [target_t + timedelta(minutes=float(m)) for m in offsets_min]
    heights = harmonic_predict(scan_times, anchor.constants)
    rng = float(heights.max() - heights.min())
    coef = 100.0 * rng / _BREST_MEAN_RANGE_M
    return max(20.0, min(120.0, coef))


def _reference_predict(
    registry: ShomC2dRegistry, lat: float, lon: float, times: list[datetime]
) -> tuple[np.ndarray, np.ndarray, str] | None:
    idx, dist_km = registry._nearest(lat, lon)
    if idx is None or dist_km > registry._MAX_NEAREST_KM:
        return None
    port = registry.ref_ports.get(str(registry.ref_port_keys[idx]))
    if port is None:
        return None
    u_ve = registry.u_ve[idx]
    v_ve = registry.v_ve[idx]
    u_me = registry.u_me[idx]
    v_me = registry.v_me[idx]
    source_label = (
        f"shom_c2d_{int(registry.atlas_ids[idx])}_{str(registry.zone_names[idx]).lower()}"
    )

    speeds = np.empty(len(times), dtype=np.float32)
    dirs = np.empty(len(times), dtype=np.float32)
    for i, t in enumerate(times):
        event_t = _reference_tide_event_time(port, t)
        offset_h = (t - event_t).total_seconds() / 3600.0
        offset_h = max(-6.0, min(6.0, offset_h))
        u_ve_t = float(np.interp(offset_h, _HOUR_OFFSETS, u_ve))
        v_ve_t = float(np.interp(offset_h, _HOUR_OFFSETS, v_ve))
        u_me_t = float(np.interp(offset_h, _HOUR_OFFSETS, u_me))
        v_me_t = float(np.interp(offset_h, _HOUR_OFFSETS, v_me))
        coef = _reference_coefficient(registry, port, t)
        w = (coef - 45.0) / 50.0
        u = u_me_t + w * (u_ve_t - u_me_t)
        v = v_me_t + w * (v_ve_t - v_me_t)
        speeds[i] = float(np.hypot(u, v))
        dirs[i] = float(np.rad2deg(np.arctan2(u, v)) % 360.0)
    return speeds, dirs, source_label


# --------------------------------------------------------------------------
# A registry with a real reference port, so the tide-event search has
# something to find. Same shape as the one in test_shom_c2d_registry.
# --------------------------------------------------------------------------


def _write_synthetic_registry(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    hours = list(range(-6, 7))
    # An asymmetric pair of series, so a wrong hour offset shows up as a wrong
    # number rather than cancelling out against a symmetric one.
    u_ve = [math.sin(math.pi * h / 6.0) for h in hours]
    v_ve = [0.4 * math.cos(math.pi * h / 5.0) for h in hours]
    rows = [
        {
            "atlas_id": 558,
            "zone": "TEST_ZONE",
            "ref_port_key": "BREST",
            "ref_tide": "PM",
            "lat": lat,
            "lon": lon,
            "u_ve_kn": u_ve,
            "v_ve_kn": v_ve,
            "u_me_kn": [0.5 * v for v in u_ve],
            "v_me_kn": [0.5 * v for v in v_ve],
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
                    # Enough constituents that the extremum moves from day to
                    # day, which is what makes the parity check meaningful.
                    "constants": {
                        "M2": [2.0, 150.0],
                        "S2": [0.7, 200.0],
                        "N2": [0.4, 130.0],
                        "K1": [0.07, 80.0],
                        "O1": [0.06, 320.0],
                        "M4": [0.1, 40.0],
                    },
                }
            },
            ensure_ascii=False,
        )
    )


@pytest.fixture
def registry(tmp_path: Path) -> ShomC2dRegistry:
    _write_synthetic_registry(tmp_path)
    return ShomC2dRegistry.from_directory(tmp_path)


def _assert_identical(registry: ShomC2dRegistry, point, times) -> None:
    expected = _reference_predict(registry, *point, times)
    produced = registry.predict_current_series(*point, times)
    assert expected is not None and produced is not None
    assert produced[2] == expected[2]
    speed_diff = float(np.max(np.abs(produced[0] - expected[0]))) if len(times) else 0.0
    dir_diff = float(np.max(np.abs(produced[1] - expected[1]))) if len(times) else 0.0
    assert speed_diff == 0.0, f"speed differs by up to {speed_diff} kn over {len(times)} instants"
    assert dir_diff == 0.0, f"direction differs by up to {dir_diff} deg over {len(times)} instants"


def test_thirty_days_hourly(registry) -> None:
    _assert_identical(registry, SYNTHETIC_POINT, [T0 + timedelta(hours=h) for h in range(721)])


def test_seven_days_at_five_minutes(registry) -> None:
    _assert_identical(
        registry, SYNTHETIC_POINT, [T0 + timedelta(minutes=5 * i) for i in range(2017)]
    )


def test_a_step_that_is_not_a_whole_number_of_lattice_steps(registry) -> None:
    """A 7-minute step spreads the series over five lattice phases.

    Nothing in the product asks for one, but the overlay endpoint takes
    ``step_minutes`` as a free integer, so the grouping has to hold for any
    of them rather than for the ones we happen to use.
    """
    _assert_identical(
        registry, SYNTHETIC_POINT, [T0 + timedelta(minutes=7 * i) for i in range(300)]
    )


def test_a_single_instant_and_an_empty_series(registry) -> None:
    _assert_identical(registry, SYNTHETIC_POINT, [T0])
    speeds, dirs, source = registry.predict_current_series(*SYNTHETIC_POINT, [])
    assert speeds.shape == (0,)
    assert dirs.shape == (0,)
    assert source == "shom_c2d_558_test_zone"


def test_naive_instants_are_still_read_as_utc(registry) -> None:
    naive = [T0.replace(tzinfo=None) + timedelta(hours=h) for h in range(48)]
    aware = [T0 + timedelta(hours=h) for h in range(48)]
    naive_out = registry.predict_current_series(*SYNTHETIC_POINT, naive)
    aware_out = registry.predict_current_series(*SYNTHETIC_POINT, aware)
    assert naive_out is not None and aware_out is not None
    assert np.array_equal(naive_out[0], aware_out[0])
    assert np.array_equal(naive_out[1], aware_out[1])


def test_unsorted_instants_keep_their_own_answers(registry) -> None:
    """Order is the caller's, not ours: the union of windows must not reorder it."""
    times = [T0 + timedelta(hours=h) for h in (30, 3, 17, 0, 71, 8)]
    _assert_identical(registry, SYNTHETIC_POINT, times)


def test_the_tide_coefficient_is_unchanged(registry) -> None:
    port = registry.ref_ports["BREST"]
    for day in range(0, 30, 3):
        t = T0 + timedelta(days=day)
        assert registry.tide_coefficient(t) == round(_reference_coefficient(registry, port, t))


@pytest.mark.skipif(
    not (_LIVE_DIR / "shom_c2d_points.parquet").exists(),
    reason="live SHOM C2D artefacts not built (run scripts/build_shom_c2d.py)",
)
def test_live_artefacts_thirty_days_hourly() -> None:
    """The same check on the shipped 13 k-point cloud, at a real reference port.

    The synthetic fixture proves the arithmetic; this proves it on the
    constants and the series that actually reach a skipper.
    """
    registry = ShomC2dRegistry.from_directory(_LIVE_DIR)
    _assert_identical(registry, TASCON, [T0 + timedelta(hours=h) for h in range(721)])
