# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

from __future__ import annotations

import dataclasses

import pytest

from openwind_data.routing.archetypes import (
    _bracket,
    effective_min_upwind_twa,
    get_polar,
    list_archetypes,
    lookup_polar,
)

EXPECTED_ARCHETYPES = {
    "cruiser_20ft",
    "cruiser_25ft",
    "cruiser_30ft",
    "cruiser_40ft",
    "cruiser_50ft",
    "catamaran_40ft",
    "racer_cruiser",
}


class TestRegistry:
    def test_list_returns_all_archetypes(self) -> None:
        archetypes = list_archetypes()
        assert {a.name for a in archetypes} == EXPECTED_ARCHETYPES

    def test_get_known_archetype(self) -> None:
        p = get_polar("cruiser_40ft")
        assert p.name == "cruiser_40ft"
        assert p.length_ft == 40
        assert p.type == "monohull"
        assert len(p.examples) >= 3

    def test_unknown_archetype_raises(self) -> None:
        with pytest.raises(KeyError):
            get_polar("uss_enterprise")

    def test_grid_shape_consistent(self) -> None:
        for archetype in list_archetypes():
            n_tws = len(archetype.tws_kn)
            n_twa = len(archetype.twa_deg)
            assert len(archetype.boat_speed_kn) == n_tws
            for row in archetype.boat_speed_kn:
                assert len(row) == n_twa

    def test_grid_axes_sorted(self) -> None:
        for archetype in list_archetypes():
            assert list(archetype.tws_kn) == sorted(archetype.tws_kn)
            assert list(archetype.twa_deg) == sorted(archetype.twa_deg)

    def test_twa_range_is_symmetric_compatible(self) -> None:
        # All polars should expose only the [0, 180] half — symmetric is implicit.
        for archetype in list_archetypes():
            assert min(archetype.twa_deg) >= 0
            assert max(archetype.twa_deg) <= 180


class TestBracket:
    def test_at_low_edge(self) -> None:
        assert _bracket((6.0, 8.0, 10.0), 6.0) == (0, 0, 0.0)

    def test_below_low_edge_clamps(self) -> None:
        assert _bracket((6.0, 8.0, 10.0), 4.0) == (0, 0, 0.0)

    def test_at_high_edge(self) -> None:
        assert _bracket((6.0, 8.0, 10.0), 10.0) == (2, 2, 0.0)

    def test_above_high_edge_clamps(self) -> None:
        assert _bracket((6.0, 8.0, 10.0), 50.0) == (2, 2, 0.0)

    def test_interpolation_in_middle(self) -> None:
        lo, hi, f = _bracket((6.0, 8.0, 10.0), 7.0)
        assert (lo, hi) == (0, 1)
        assert f == pytest.approx(0.5)

    def test_interpolation_quarter(self) -> None:
        lo, hi, f = _bracket((6.0, 10.0), 7.0)
        assert (lo, hi) == (0, 1)
        assert f == pytest.approx(0.25)


class TestLookupPolar:
    def test_exact_grid_point(self) -> None:
        p = get_polar("cruiser_40ft")
        # cruiser_40ft @ TWS=10, TWA=90 → 6.7 (per JSON, 3rd row, 5th col)
        assert lookup_polar(p, 10.0, 90.0) == pytest.approx(6.7, abs=1e-9)

    def test_clamped_below_min_tws(self) -> None:
        p = get_polar("cruiser_40ft")
        # TWS=0 clamps to grid min (6 kn), so should equal 6 kn row
        assert lookup_polar(p, 0.0, 90.0) == pytest.approx(5.2, abs=1e-9)

    def test_clamped_above_max_tws(self) -> None:
        p = get_polar("cruiser_40ft")
        # TWS=50 clamps to grid max (25 kn), TWA=90 → 7.8
        assert lookup_polar(p, 50.0, 90.0) == pytest.approx(7.8, abs=1e-9)

    def test_twa_clamped_to_180(self) -> None:
        p = get_polar("cruiser_40ft")
        # twa=200 → clamp to 180 → past last col (165), uses 165 col
        v_at_165 = lookup_polar(p, 10.0, 165.0)
        assert lookup_polar(p, 10.0, 200.0) == pytest.approx(v_at_165)

    def test_twa_clamped_to_zero(self) -> None:
        p = get_polar("cruiser_40ft")
        # twa=-30 → clamp to 0 → before first col (40), uses 40 col
        v_at_40 = lookup_polar(p, 10.0, 40.0)
        assert lookup_polar(p, 10.0, -30.0) == pytest.approx(v_at_40)

    def test_bilinear_in_box(self) -> None:
        p = get_polar("cruiser_40ft")
        # Halfway between (10, 90)=6.7 and (12, 90)=7.1 in TWS, TWA fixed
        assert lookup_polar(p, 11.0, 90.0) == pytest.approx((6.7 + 7.1) / 2)

    def test_returns_positive_speed_in_grid(self) -> None:
        for arch in list_archetypes():
            for tws in (6, 10, 14, 20):
                for twa in (40, 90, 135):
                    v = lookup_polar(arch, tws, twa)
                    assert v > 0


class TestEffectiveMinUpwindTwa:
    def test_explicit_field_wins(self) -> None:
        p = dataclasses.replace(get_polar("cruiser_30ft"), min_upwind_twa_deg=52.0)
        assert effective_min_upwind_twa(p) == 52.0

    def test_all_archetypes_carry_a_realistic_value(self) -> None:
        for arch in list_archetypes():
            assert arch.min_upwind_twa_deg is not None, arch.name
            assert 42.0 <= arch.min_upwind_twa_deg <= 50.0, arch.name

    def test_derives_first_twa_when_field_absent(self) -> None:
        p = dataclasses.replace(get_polar("cruiser_30ft"), min_upwind_twa_deg=None)
        assert effective_min_upwind_twa(p) == p.twa_deg[0]

    def test_skips_leading_zero_columns(self) -> None:
        # Mimics an imported file with a 0-deg row of zeros.
        base = get_polar("cruiser_30ft")
        twa = (0.0, *base.twa_deg)
        matrix = tuple((0.0, *row) for row in base.boat_speed_kn)
        p = dataclasses.replace(base, min_upwind_twa_deg=None, twa_deg=twa, boat_speed_kn=matrix)
        assert effective_min_upwind_twa(p) == base.twa_deg[0]
