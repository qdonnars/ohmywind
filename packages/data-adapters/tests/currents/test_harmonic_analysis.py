# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tests for the harmonic analysis: it must invert ``harmonic.predict`` exactly.

Every fixture series is synthesised by the predictor itself, so a constant
recovered here is, by construction, a constant the runtime will reconstruct
the same series from. That is the property the offline builders rely on.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from openwind_data.currents.harmonic import predict
from openwind_data.currents.harmonic_analysis import (
    GridAnalysis,
    Inference,
    analyze,
    current_ellipse,
    design_matrix,
    inferences_from_reference,
    rayleigh_hours,
    select_constituents,
)

# A Raz-de-Sein-like east component, in m/s and Greenwich degrees.
TRUTH: dict[str, tuple[float, float]] = {
    "M2": (1.40, 112.0),
    "S2": (0.48, 155.0),
    "N2": (0.29, 93.0),
    "K1": (0.05, 40.0),
    "O1": (0.04, 350.0),
    "M4": (0.12, 210.0),
    "MS4": (0.06, 250.0),
}


def _hourly(start: datetime, hours: int, step_min: int = 60) -> list[datetime]:
    return [start + timedelta(minutes=step_min * k) for k in range(int(hours * 60 / step_min))]


def test_round_trip_full_year_recovers_constants() -> None:
    times = _hourly(datetime(2024, 1, 1, tzinfo=UTC), 24 * 370)
    rng = np.random.default_rng(0)
    y = predict(times, TRUTH, z0=0.15) + rng.normal(0.0, 0.05, len(times))
    res = analyze(times, y, list(TRUTH))
    assert res.z0 == pytest.approx(0.15, abs=0.01)
    for name, (amp, g) in TRUTH.items():
        got_amp, got_g = res.constants[name]
        assert got_amp == pytest.approx(amp, abs=0.01), name
        assert (got_g - g + 180.0) % 360.0 - 180.0 == pytest.approx(0.0, abs=2.0), name
    assert res.variance_explained > 0.99
    assert res.rmse == pytest.approx(0.05, abs=0.01)


def test_round_trip_is_exact_without_noise() -> None:
    """Predict → analyze → predict reproduces the series to floating precision."""
    times = _hourly(datetime(2022, 3, 1, tzinfo=UTC), 24 * 60)
    y = predict(times, TRUTH)
    res = analyze(times, y, list(TRUTH))
    y2 = predict(times, res.constants, z0=res.z0)
    assert np.max(np.abs(y2 - y)) < 1e-9


def test_rayleigh_selection_follows_record_length() -> None:
    assert rayleigh_hours("M2", "S2") == pytest.approx(354.4, abs=0.5)
    assert rayleigh_hours("M2", "N2") == pytest.approx(661.3, abs=0.5)
    three_days = select_constituents(72.0)
    assert "M2" in three_days and "K1" in three_days and "M4" in three_days
    assert "S2" not in three_days and "N2" not in three_days and "O1" not in three_days
    fortnight = select_constituents(24 * 15)
    assert "S2" in fortnight and "N2" not in fortnight
    month = select_constituents(24 * 30)
    assert "N2" in month and "K2" not in month  # K2/S2 need 182 days
    assert "P1" not in month
    year = select_constituents(24 * 370)
    assert {"K2", "P1", "SA"} <= set(year)


def test_inference_keeps_spring_neap_on_a_short_record() -> None:
    """Three days cannot separate S2 from M2; tying S2 to M2 fixes both."""
    times = _hourly(datetime(2026, 9, 16, 12, tzinfo=UTC), 72, step_min=15)
    truth = {"M2": TRUTH["M2"], "S2": TRUTH["S2"], "N2": TRUTH["N2"], "M4": TRUTH["M4"]}
    y = predict(times, truth)
    resolved = ("M2", "M4")
    reference = {"M2": (1.30, 100.0), "S2": (0.45, 143.0), "N2": (0.27, 81.0)}  # atlas nearby
    inferences = inferences_from_reference(reference, resolved, ("S2", "N2"))
    assert {i.name for i in inferences} == {"S2", "N2"}
    assert all(i.reference == "M2" for i in inferences)

    with_inf = analyze(times, y, resolved, inferences)
    without = analyze(times, y, resolved)
    m2_err_with = abs(with_inf.constants["M2"][0] - truth["M2"][0])
    m2_err_without = abs(without.constants["M2"][0] - truth["M2"][0])
    assert m2_err_with < m2_err_without
    assert m2_err_with < 0.03
    # Inferred S2 follows the reference ratio and lag applied to the fitted M2.
    ratio = reference["S2"][0] / reference["M2"][0]
    assert with_inf.constants["S2"][0] == pytest.approx(ratio * with_inf.constants["M2"][0])
    # And the reconstruction over the following fortnight keeps the neap.
    future = _hourly(datetime(2026, 9, 20, tzinfo=UTC), 24 * 15)
    truth_future = predict(future, truth)
    pred_with = predict(future, with_inf.constants, z0=with_inf.z0)
    pred_without = predict(future, without.constants, z0=without.z0)
    rmse_with = float(np.sqrt(np.mean((pred_with - truth_future) ** 2)))
    rmse_without = float(np.sqrt(np.mean((pred_without - truth_future) ** 2)))
    assert rmse_with < rmse_without
    assert rmse_with < 0.12


def test_design_matrix_rejects_bad_inference() -> None:
    times = _hourly(datetime(2024, 1, 1, tzinfo=UTC), 24)
    with pytest.raises(ValueError):
        design_matrix(times, ["M2"], [Inference("S2", "N2", 0.3, 40.0)])  # N2 not fitted
    with pytest.raises(ValueError):
        design_matrix(times, ["M2", "S2"], [Inference("S2", "M2", 0.3, 40.0)])  # already fitted
    with pytest.raises(KeyError):
        design_matrix(times, ["M2", "XYZ"])


def test_grid_analysis_matches_single_series_including_gaps() -> None:
    times = _hourly(datetime(2024, 5, 1, tzinfo=UTC), 24 * 35)
    rng = np.random.default_rng(1)
    cells = [
        {"M2": (1.0, 30.0), "S2": (0.3, 60.0), "N2": (0.2, 10.0)},
        {"M2": (0.4, 200.0), "S2": (0.1, 250.0), "N2": (0.05, 180.0)},
        {"M2": (2.1, 300.0), "S2": (0.7, 340.0), "N2": (0.4, 270.0)},
    ]
    grid = np.column_stack([predict(times, c, z0=0.1 * i) for i, c in enumerate(cells)])
    grid += rng.normal(0.0, 0.02, grid.shape)
    grid[100:400, 1] = np.nan  # a drying cell
    grid[5, 2] = np.nan

    ga = GridAnalysis(n_cells=3, constituents=["M2", "S2", "N2"])
    # Feed out of order and in uneven chunks: the accumulation must not care.
    for lo, hi in ((500, 840), (0, 100), (100, 500)):
        ga.add(times[lo:hi], grid[lo:hi])
    res = ga.solve()
    assert res.record_hours == pytest.approx(24 * 35 - 1)
    for cell in range(3):
        single = analyze(times, grid[:, cell], ["M2", "S2", "N2"])
        for k, name in enumerate(res.names):
            assert res.amp[k, cell] == pytest.approx(single.constants[name][0], abs=1e-6)
            assert res.phase_deg[k, cell] == pytest.approx(single.constants[name][1], abs=1e-4)
        assert res.z0[cell] == pytest.approx(single.z0, abs=1e-6)
        assert res.rmse[cell] == pytest.approx(single.rmse, abs=1e-6)
        assert res.n_valid[cell] == single.n_samples
        assert res.constants_at(cell).keys() == {"M2", "S2", "N2"}


def test_grid_analysis_with_inference_and_too_few_samples() -> None:
    times = _hourly(datetime(2024, 5, 1, tzinfo=UTC), 72)
    y = predict(times, {"M2": (1.0, 30.0), "S2": (0.3, 60.0)})
    grid = np.column_stack([y, np.full_like(y, np.nan)])
    ga = GridAnalysis(2, ["M2"], [Inference("S2", "M2", 0.3, 30.0)])
    ga.add(times, grid)
    res = ga.solve()
    assert res.names == ("M2", "S2")
    assert res.amp[0, 0] == pytest.approx(1.0, abs=0.02)
    assert res.amp[1, 0] == pytest.approx(0.3 * res.amp[0, 0])
    assert np.isnan(res.amp[0, 1]) and np.isnan(res.z0[1])


def test_current_ellipse_known_cases() -> None:
    rect_east = current_ellipse((1.0, 30.0), (0.0, 0.0))
    assert rect_east.semi_major == pytest.approx(1.0)
    assert rect_east.semi_minor == pytest.approx(0.0, abs=1e-12)
    assert rect_east.inclination_deg == pytest.approx(0.0, abs=1e-9)
    assert rect_east.phase_deg == pytest.approx(30.0)

    rect_north = current_ellipse((0.0, 0.0), (0.8, 300.0))
    assert rect_north.semi_major == pytest.approx(0.8)
    assert rect_north.inclination_deg == pytest.approx(90.0)
    assert rect_north.phase_deg == pytest.approx(300.0)

    circle_ccw = current_ellipse((1.0, 0.0), (1.0, 90.0))  # v lags u by 90°: anticlockwise
    assert circle_ccw.semi_major == pytest.approx(1.0)
    assert circle_ccw.semi_minor == pytest.approx(1.0)

    circle_cw = current_ellipse((1.0, 0.0), (1.0, 270.0))
    assert circle_cw.semi_minor == pytest.approx(-1.0)

    # Cross-check against a brute-force maximum of the reconstructed vector.
    # S2 rather than M2: its nodal factor is exactly 1, so the predicted
    # speed is the ellipse itself and not the ellipse scaled by f(t).
    u, v = (0.9, 120.0), (0.5, 200.0)
    ell = current_ellipse(u, v)
    times = _hourly(datetime(2024, 1, 1, tzinfo=UTC), 13, step_min=1)
    speed = np.hypot(predict(times, {"S2": u}), predict(times, {"S2": v}))
    assert float(speed.max()) == pytest.approx(ell.semi_major, abs=0.002)
    assert float(speed.min()) == pytest.approx(abs(ell.semi_minor), abs=0.002)


@pytest.mark.parametrize(
    ("u", "v"),
    [
        ((0.9, 120.0), (0.5, 200.0)),
        ((0.3, 10.0), (1.1, 350.0)),
        ((1.0, 250.0), (1.0, 20.0)),
        ((0.7, 95.0), (0.2, 300.0)),
        ((0.4, 0.0), (0.4, 180.0)),
    ],
)
def test_ellipse_phase_and_inclination_are_consistent(u: tuple, v: tuple) -> None:
    """At the ellipse's phase time the vector points along the inclination.

    S2 has no nodal correction and a zero equilibrium argument, so its
    argument is exactly ``30 * hours - G``: the maximum along the major axis
    falls ``phase / 30`` hours after 00:00 UT of any day, and the vector
    there must point at ``inclination`` (anticlockwise from east, mod 360,
    not mod 180). This is what catches an inclination normalised without
    its phase.
    """
    ell = current_ellipse(u, v)
    t = datetime(2024, 1, 1, tzinfo=UTC) + timedelta(hours=ell.phase_deg / 30.0)
    uu = float(predict([t], {"S2": u})[0])
    vv = float(predict([t], {"S2": v})[0])
    assert np.hypot(uu, vv) == pytest.approx(ell.semi_major, abs=1e-6)
    direction = np.degrees(np.arctan2(vv, uu)) % 360.0
    assert (direction - ell.inclination_deg + 180.0) % 360.0 - 180.0 == pytest.approx(0.0, abs=1e-4)


def test_max_reconstructed_speed_is_the_ellipse_peak_for_a_solar_constituent() -> None:
    # S2 has no nodal correction, so the peak of a 0.3 / 0.4 m/s pair is 0.5 m/s
    # exactly, reached at the hourly sample where both phases pass through zero.
    from openwind_data.currents.harmonic_analysis import max_reconstructed_speed

    u_amp = np.array([[0.3, 0.0]])
    v_amp = np.array([[0.4, 1.0]])
    zeros = np.zeros((1, 2))
    speed = max_reconstructed_speed(u_amp, zeros, v_amp, zeros, ["S2"])
    assert speed.shape == (2,)
    assert speed[0] == pytest.approx(0.5, abs=1e-6)
    assert speed[1] == pytest.approx(1.0, abs=1e-6)
