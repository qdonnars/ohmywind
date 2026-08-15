# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

from __future__ import annotations

import math
from itertools import pairwise

import pytest

from openwind_data.routing.geometry import (
    EARTH_RADIUS_NM,
    Point,
    bearing,
    haversine_distance,
    interpolate_great_circle,
    midpoint,
    normalize_twa,
    segment_route,
)

# A degree of arc on a sphere is exactly 60 NM by the historical NM definition.
# With Earth radius = 3440.065 NM the value is ~60.040 NM.
ONE_DEG_NM = EARTH_RADIUS_NM * math.pi / 180


class TestHaversineDistance:
    def test_zero_distance(self) -> None:
        p = Point(43.30, 5.35)
        assert haversine_distance(p, p) == pytest.approx(0.0, abs=1e-9)

    def test_one_degree_at_equator(self) -> None:
        d = haversine_distance(Point(0, 0), Point(0, 1))
        assert d == pytest.approx(ONE_DEG_NM, rel=1e-6)

    def test_one_degree_meridian(self) -> None:
        d = haversine_distance(Point(0, 0), Point(1, 0))
        assert d == pytest.approx(ONE_DEG_NM, rel=1e-6)

    def test_symmetric(self) -> None:
        a, b = Point(43.30, 5.35), Point(43.00, 6.20)
        assert haversine_distance(a, b) == pytest.approx(haversine_distance(b, a), rel=1e-12)

    def test_marseille_to_porquerolles(self) -> None:
        # Marseille (Vieux-Port) → Porquerolles. Reference ~41 NM great-circle.
        marseille = Point(43.30, 5.35)
        porquerolles = Point(43.00, 6.20)
        d = haversine_distance(marseille, porquerolles)
        assert 40.0 < d < 43.0, f"expected ~41 NM, got {d}"


class TestBearing:
    def test_due_north(self) -> None:
        assert bearing(Point(0, 0), Point(1, 0)) == pytest.approx(0.0, abs=1e-9)

    def test_due_east(self) -> None:
        assert bearing(Point(0, 0), Point(0, 1)) == pytest.approx(90.0, abs=1e-9)

    def test_due_south(self) -> None:
        # atan2(0, -) wraps to 180, then +360 % 360 → 180
        assert bearing(Point(0, 0), Point(-1, 0)) == pytest.approx(180.0, abs=1e-9)

    def test_due_west(self) -> None:
        assert bearing(Point(0, 0), Point(0, -1)) == pytest.approx(270.0, abs=1e-9)

    def test_marseille_to_porquerolles_southeast(self) -> None:
        # SE direction → bearing in (90, 180), expect ~113°
        b = bearing(Point(43.30, 5.35), Point(43.00, 6.20))
        assert 100.0 < b < 130.0, f"expected ~113°, got {b}"


class TestInterpolation:
    def test_fraction_zero_returns_start(self) -> None:
        a, b = Point(43.30, 5.35), Point(43.00, 6.20)
        p = interpolate_great_circle(a, b, 0.0)
        assert p.lat == pytest.approx(a.lat, abs=1e-9)
        assert p.lon == pytest.approx(a.lon, abs=1e-9)

    def test_fraction_one_returns_end(self) -> None:
        a, b = Point(43.30, 5.35), Point(43.00, 6.20)
        p = interpolate_great_circle(a, b, 1.0)
        assert p.lat == pytest.approx(b.lat, abs=1e-9)
        assert p.lon == pytest.approx(b.lon, abs=1e-9)

    def test_midpoint_on_equator(self) -> None:
        # Midpoint of two equatorial points at lon 0 and lon 90 is on the equator
        # at lon 45 — the great-circle along the equator is the equator itself.
        m = midpoint(Point(0, 0), Point(0, 90))
        assert m.lat == pytest.approx(0.0, abs=1e-9)
        assert m.lon == pytest.approx(45.0, abs=1e-9)

    def test_midpoint_distance_invariant(self) -> None:
        a, b = Point(43.30, 5.35), Point(43.00, 6.20)
        m = midpoint(a, b)
        d_total = haversine_distance(a, b)
        d_a = haversine_distance(a, m)
        d_b = haversine_distance(m, b)
        assert d_a == pytest.approx(d_total / 2, rel=1e-6)
        assert d_b == pytest.approx(d_total / 2, rel=1e-6)

    def test_zero_distance_interpolation(self) -> None:
        p = Point(43.30, 5.35)
        assert interpolate_great_circle(p, p, 0.5) == p


class TestNormalizeTwa:
    def test_head_to_wind(self) -> None:
        assert normalize_twa(twd=0, course=0) == pytest.approx(0.0)

    def test_dead_run(self) -> None:
        assert normalize_twa(twd=180, course=0) == pytest.approx(180.0)

    def test_beam_reach(self) -> None:
        assert normalize_twa(twd=90, course=0) == pytest.approx(90.0)

    def test_symmetric_around_axis(self) -> None:
        # Wind from 350°, course 10° → wind 20° off the bow on starboard.
        # Symmetric: wind from 30°, course 10° → wind 20° off the bow on port.
        assert normalize_twa(twd=350, course=10) == pytest.approx(20.0)
        assert normalize_twa(twd=30, course=10) == pytest.approx(20.0)

    def test_wraparound(self) -> None:
        # course 350°, twd 10° → diff = 20°
        assert normalize_twa(twd=10, course=350) == pytest.approx(20.0)

    def test_clamped_to_180(self) -> None:
        # Any input pair must yield value in [0, 180]
        for twd in range(0, 360, 17):
            for course in range(0, 360, 19):
                v = normalize_twa(twd, course)
                assert 0.0 <= v <= 180.0


class TestSegmentRoute:
    def test_single_leg_split_in_two(self) -> None:
        # 60.04 NM (1° of latitude) leg, target 31 NM segments → exactly 2 segments
        wpts = [Point(0, 0), Point(1, 0)]
        segs = segment_route(wpts, segment_length_nm=31.0)
        assert len(segs) == 2
        # Endpoints exactly hit the waypoints
        assert segs[0].start == wpts[0]
        assert segs[-1].end == wpts[1]

    def test_segments_sum_to_total_distance(self) -> None:
        wpts = [Point(43.30, 5.35), Point(43.00, 6.20)]
        total = haversine_distance(wpts[0], wpts[1])
        segs = segment_route(wpts, segment_length_nm=5.0)
        assert sum(s.distance_nm for s in segs) == pytest.approx(total, rel=1e-6)

    def test_short_leg_emits_one_segment(self) -> None:
        # 60 NM leg, 100 NM segment target → ceil(60/100) = 1
        wpts = [Point(0, 0), Point(1, 0)]
        segs = segment_route(wpts, segment_length_nm=100.0)
        assert len(segs) == 1
        assert segs[0].start == wpts[0]
        assert segs[0].end == wpts[1]

    def test_multi_leg_route(self) -> None:
        wpts = [Point(0, 0), Point(0, 1), Point(0, 2)]
        segs = segment_route(wpts, segment_length_nm=31.0)
        # Each ~60 NM leg splits into 2 → total 4 segments
        assert len(segs) == 4
        assert segs[0].start == wpts[0]
        assert segs[-1].end == wpts[2]
        # Continuity: each segment's end equals the next segment's start
        for s1, s2 in pairwise(segs):
            assert s1.end == s2.start

    def test_invalid_segment_length(self) -> None:
        with pytest.raises(ValueError):
            segment_route([Point(0, 0), Point(0, 1)], 0)
        with pytest.raises(ValueError):
            segment_route([Point(0, 0), Point(0, 1)], -5)

    def test_invalid_waypoint_count(self) -> None:
        with pytest.raises(ValueError):
            segment_route([Point(0, 0)], 5)
        with pytest.raises(ValueError):
            segment_route([], 5)
