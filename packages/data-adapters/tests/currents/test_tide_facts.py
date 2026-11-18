# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The tide at a passage's ends: facts on a known curve, no verdict."""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta, timezone

import pytest

from openwind_data.currents.tide_facts import TideCurve, curve_times, tide_reading

M2_H = 12.42  # hours
T0 = datetime(2026, 11, 18, 0, 0, tzinfo=UTC)


def _m2_curve(amplitude: float, *, z0: float | None, start: datetime, end: datetime) -> TideCurve:
    """A pure M2 tide, high water at T0, sampled the way the server samples."""
    times = curve_times(start, end)
    heights = [
        amplitude * math.cos(2 * math.pi * (t - T0).total_seconds() / 3600 / M2_H) for t in times
    ]
    curve = TideCurve.build(times, heights, source="marc_finis_250m", z0_hydro_m=z0)
    assert curve is not None
    return curve


def test_chart_datum_when_the_cell_has_a_z0() -> None:
    curve = _m2_curve(2.0, z0=-2.1, start=T0, end=T0 + timedelta(hours=24))
    r = tide_reading(curve, T0 + timedelta(hours=3), coefficient=70)
    assert r is not None
    assert r["datum"] == "ZH"
    # cos(2π·3/12.42) ≈ 0.053 → 0.11 m around MSL, 2.21 m above ZH.
    assert r["height_m"] == pytest_approx(2.21, 0.02)
    assert r["trend"] == "falling"
    assert r["previous"]["type"] == "high"
    assert r["next"]["type"] == "low"
    assert r["cycle_range_m"] == pytest_approx(4.0, 0.02)
    assert r["day_max_range_m"] == pytest_approx(4.0, 0.02)
    assert r["coefficient"] == 70
    assert r["source"] == "marc_finis_250m"


def test_around_msl_without_a_z0() -> None:
    curve = _m2_curve(0.1, z0=None, start=T0, end=T0 + timedelta(hours=24))
    r = tide_reading(curve, T0 + timedelta(hours=8))
    assert r is not None
    assert r["datum"] == "MSL"
    assert r["trend"] == "rising"
    # A Mediterranean-sized range: the scale says the tide hardly matters.
    assert r["day_max_range_m"] == pytest_approx(0.2, 0.01)
    assert "coefficient" not in r


def test_times_come_back_in_the_readings_offset() -> None:
    curve = _m2_curve(2.0, z0=None, start=T0, end=T0 + timedelta(hours=24))
    paris = timezone(timedelta(hours=1))
    r = tide_reading(curve, (T0 + timedelta(hours=3)).astimezone(paris))
    assert r is not None
    # Extremes are instants; the server shifts every instant to the user's
    # offset, so only the instant matters here.
    assert datetime.fromisoformat(r["previous"]["time"]) == T0


def test_outside_the_curve_is_no_reading() -> None:
    curve = _m2_curve(2.0, z0=None, start=T0, end=T0 + timedelta(hours=6))
    assert tide_reading(curve, T0 + timedelta(days=3)) is None


def test_a_flat_curve_is_no_reading() -> None:
    times = curve_times(T0, T0 + timedelta(hours=6))
    curve = TideCurve.build(times, [0.0] * len(times), source="x", z0_hydro_m=None)
    assert curve is not None
    assert tide_reading(curve, T0 + timedelta(hours=1)) is None


def test_a_curve_with_holes_is_refused() -> None:
    times = curve_times(T0, T0 + timedelta(hours=6))
    heights = [0.0] * len(times)
    heights[3] = float("nan")
    assert TideCurve.build(times, heights, source="x", z0_hydro_m=None) is None


def pytest_approx(expected: float, tol: float):
    return pytest.approx(expected, abs=tol)
