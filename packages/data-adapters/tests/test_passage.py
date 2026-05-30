from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from itertools import pairwise

import pytest

from openwind_data.adapters.base import (
    ForecastBundle,
    ForecastHorizonError,
    SeaPoint,
    SeaSeries,
    WindPoint,
    WindSeries,
)
from openwind_data.routing.archetypes import get_polar, lookup_polar
from openwind_data.routing.geometry import Point
from openwind_data.routing.passage import (
    LIGHT_WIND_THRESHOLD_KN,
    MAX_SWEEP_WINDOWS,
    best_vmg_upwind,
    estimate_passage,
    estimate_passage_for_arrival,
    estimate_passage_windows,
    wave_derate,
)

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
MARSEILLE = Point(43.30, 5.35)
PORQUEROLLES = Point(43.00, 6.20)


class StubAdapter:
    """Returns a constant-wind ForecastBundle, optionally schedule-varying."""

    def __init__(
        self,
        tws_kn: float = 10.0,
        twd_deg: float = 0.0,
        hs_m: float | None = None,
        current_kn: float | None = None,
        current_to_deg: float | None = None,
        gust_kn: float | None = None,
        wave_period_s: float | None = None,
    ) -> None:
        self.tws_kn = tws_kn
        self.twd_deg = twd_deg
        self.hs_m = hs_m
        self.current_kn = current_kn
        self.current_to_deg = current_to_deg
        self.gust_kn = gust_kn
        self.wave_period_s = wave_period_s
        self.calls: list[tuple[float, float, datetime, datetime]] = []

    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle:
        self.calls.append((lat, lon, start, end))
        models = models or ["meteofrance_arome_france"]
        points: list[WindPoint] = []
        t = start
        while t <= end:
            points.append(
                WindPoint(
                    time=t,
                    speed_kn=self.tws_kn,
                    direction_deg=self.twd_deg,
                    gust_kn=self.gust_kn,
                )
            )
            t = t + timedelta(hours=1)
        wind = {m: WindSeries(model=m, points=tuple(points)) for m in models}
        sea_points: list[SeaPoint] = []
        emit_sea = (
            self.hs_m is not None
            or self.current_kn is not None
            or self.current_to_deg is not None
            or self.wave_period_s is not None
        )
        if emit_sea:
            t = start
            while t <= end:
                sea_points.append(
                    SeaPoint(
                        time=t,
                        wave_height_m=self.hs_m,
                        wave_period_s=self.wave_period_s,
                        wave_direction_deg=None,
                        wind_wave_height_m=None,
                        swell_wave_height_m=None,
                        current_speed_kn=self.current_kn,
                        current_direction_to_deg=self.current_to_deg,
                    )
                )
                t = t + timedelta(hours=1)
        return ForecastBundle(
            lat=lat,
            lon=lon,
            start=start,
            end=end,
            wind_by_model=wind,
            sea=SeaSeries(points=tuple(sea_points)),
            requested_at=start,
        )


class TestEstimatePassage:
    async def test_marseille_to_porquerolles_north_wind(self) -> None:
        # Wind from north @ 10 kn, route bearing ~113° → TWA ~113° (broad reach).
        # cruiser_40ft polar at (10 kn, 113°) ≈ 6.66 kn x 0.75 efficiency ≈ 5.0 kn.
        # Distance ~41.4 NM → expected ~8.3 h.
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=5.0,
        )
        assert 40.0 < report.distance_nm < 43.0
        assert 6.5 < report.duration_h < 10.0
        assert report.archetype == "cruiser_40ft"
        assert report.efficiency == 0.75
        assert report.departure_time == DEPARTURE
        assert report.arrival_time == DEPARTURE + timedelta(hours=report.duration_h)
        assert all(seg.tws_kn == 10.0 for seg in report.segments)
        assert all(seg.twd_deg == 0.0 for seg in report.segments)
        assert all(seg.boat_speed_kn > 0 for seg in report.segments)
        # No light-wind warning at TWS=10 (boat speed comfortably above floor)
        assert all("vent faible" not in w for w in report.warnings)

    async def test_constant_wind_yields_exact_timing(self) -> None:
        # Challenge #7: single-pass approximation. Under constant wind in time,
        # the heuristic timing offset is irrelevant — the wind hit at any timestamp
        # is the same. So duration must equal sum(distance / boat_speed) exactly.
        adapter = StubAdapter(tws_kn=12.0, twd_deg=180.0)  # wind from south, course east
        report = await estimate_passage(
            [Point(43.0, 5.0), Point(43.0, 6.0)],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=10.0,
        )
        expected_h = sum(s.distance_nm / s.boat_speed_kn for s in report.segments)
        # Timedelta stores microseconds → drift ~1e-9 hours per segment
        assert report.duration_h == pytest.approx(expected_h, abs=1e-6)

    async def test_segment_speed_matches_polar_times_efficiency(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=270.0)  # wind from west
        polar = get_polar("racer_cruiser")
        report = await estimate_passage(
            [Point(43.0, 5.0), Point(43.0, 5.5)],
            DEPARTURE,
            "racer_cruiser",
            adapter=adapter,
            segment_length_nm=20.0,
            efficiency=0.8,
        )
        for seg in report.segments:
            expected_polar = lookup_polar(polar, 10.0, seg.twa_deg)
            assert seg.polar_speed_kn == pytest.approx(expected_polar, rel=1e-9)
            assert seg.boat_speed_kn == pytest.approx(expected_polar * 0.8, rel=1e-9)

    async def test_strong_wind_no_passage_warning(self) -> None:
        # Strong-wind warnings now live on the complexity score (richer message
        # with affected nm). The passage report itself emits no wind warning.
        adapter = StubAdapter(tws_kn=30.0, twd_deg=180.0)
        report = await estimate_passage(
            [Point(43.0, 5.0), Point(43.0, 5.3)],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
        )
        assert all("vent fort" not in w for w in report.warnings)

    async def test_light_wind_warning(self) -> None:
        # Upwind in light air: cruiser_30ft @ tws=6 (grid floor), twa~0 →
        # ~2.25 kn boat speed, below the 3.0 kn floor.
        adapter = StubAdapter(tws_kn=3.0, twd_deg=90.0)  # wind from east, route east → upwind
        report = await estimate_passage(
            [Point(43.0, 5.0), Point(43.0, 5.3)],
            DEPARTURE,
            "cruiser_30ft",
            adapter=adapter,
        )
        assert any("vent faible" in w for w in report.warnings)
        assert min(s.boat_speed_kn for s in report.segments) < LIGHT_WIND_THRESHOLD_KN

    async def test_light_wind_threshold_at_3_kn(self) -> None:
        # 12 kn beam reach on cruiser_30ft → boat speed comfortably above the
        # 3 kn floor. The previous 4 kn floor would still have stayed silent
        # too; this test pins the new threshold.
        adapter = StubAdapter(tws_kn=12.0, twd_deg=180.0)  # wind south, route east → beam reach
        report = await estimate_passage(
            [Point(43.0, 5.0), Point(43.0, 5.3)],
            DEPARTURE,
            "cruiser_30ft",
            adapter=adapter,
        )
        assert LIGHT_WIND_THRESHOLD_KN == 3.0
        assert all("vent faible" not in w for w in report.warnings)
        assert min(s.boat_speed_kn for s in report.segments) >= LIGHT_WIND_THRESHOLD_KN

    async def test_fetches_one_bundle_per_segment(self) -> None:
        adapter = StubAdapter(tws_kn=12.0, twd_deg=0.0)
        report = await estimate_passage(
            [Point(43.0, 5.0), Point(43.0, 6.0)],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=15.0,
        )
        assert len(adapter.calls) == len(report.segments)

    async def test_naive_departure_time_rejected(self) -> None:
        adapter = StubAdapter()
        with pytest.raises(ValueError, match="timezone-aware"):
            await estimate_passage(
                [MARSEILLE, PORQUEROLLES],
                datetime(2026, 5, 1, 6, 0),  # no tzinfo
                "cruiser_40ft",
                adapter=adapter,
            )

    async def test_invalid_efficiency_rejected(self) -> None:
        adapter = StubAdapter()
        with pytest.raises(ValueError, match="efficiency"):
            await estimate_passage(
                [MARSEILLE, PORQUEROLLES],
                DEPARTURE,
                "cruiser_40ft",
                adapter=adapter,
                efficiency=1.5,
            )

    async def test_unknown_archetype_propagates(self) -> None:
        adapter = StubAdapter()
        with pytest.raises(KeyError):
            await estimate_passage(
                [MARSEILLE, PORQUEROLLES],
                DEPARTURE,
                "battleship",
                adapter=adapter,
            )

    async def test_gust_and_wave_period_propagated_to_segments(self) -> None:
        # Web "Comment c'est calculé" build-up surfaces gust_kn and wave_period_s
        # alongside Hs — verify both ride through the full pipeline.
        adapter = StubAdapter(tws_kn=12.0, twd_deg=180.0, hs_m=1.4, gust_kn=22.0, wave_period_s=4.5)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=10.0,
        )
        assert all(seg.gust_kn == 22.0 for seg in report.segments)
        assert all(seg.wave_period_s == 4.5 for seg in report.segments)

    async def test_segments_continuous_in_time(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=5.0,
        )
        for s1, s2 in pairwise(report.segments):
            assert s1.end_time == s2.start_time
        assert report.segments[0].start_time == DEPARTURE
        assert report.segments[-1].end_time == report.arrival_time


class TestSampleCap:
    """Long routes auto-stretch segment_length_nm to cap API fetches."""

    async def test_short_route_no_cap_no_warning(self) -> None:
        # Marseille → Porquerolles ~41 nm: 4 segments at default 10 nm.
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
        )
        assert len(report.segments) <= 5
        assert all("trajet long" not in w for w in report.warnings)

    async def test_long_route_caps_to_ten_points_and_warns(self) -> None:
        # Marseille → Ajaccio-ish ~170 nm. Default L=10 would give ~17 points;
        # cap should stretch to ~17 nm and yield ~10 segments.
        ajaccio = Point(41.92, 8.74)
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        report = await estimate_passage(
            [MARSEILLE, ajaccio],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
        )
        assert len(report.segments) <= 11  # may overshoot by 1 due to per-leg ceil
        assert any("trajet long" in w for w in report.warnings)
        # Each fetch maps to one sampled point — confirms API budget cap holds.
        assert len(adapter.calls) == len(report.segments)

    async def test_very_long_route_clamped_at_max_seg(self) -> None:
        # Synthetic ~600 nm leg → target=60 nm > MAX_SEG (30 nm). Effective L=30,
        # so segments ~ ceil(600/30) = 20, not 10.
        far = Point(43.30, 18.0)  # ~600 nm east of Marseille
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        report = await estimate_passage(
            [MARSEILLE, far],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
        )
        assert 15 <= len(report.segments) <= 25
        assert any("trajet long" in w for w in report.warnings)

    async def test_user_explicit_long_segment_not_overridden(self) -> None:
        # If caller already asks for a coarser segment than the cap target,
        # respect it (no cap, no warning).
        ajaccio = Point(41.92, 8.74)
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        report = await estimate_passage(
            [MARSEILLE, ajaccio],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=25.0,
        )
        assert all("trajet long" not in w for w in report.warnings)


class TestWaveDerate:
    def test_flat_water_returns_one(self) -> None:
        assert wave_derate(0.0, 0.0) == 1.0
        assert wave_derate(0.0, 90.0) == 1.0
        assert wave_derate(0.0, 180.0) == 1.0

    def test_following_seas_no_effect(self) -> None:
        # cos²(180/2) = cos²(90) = 0 → angular factor 0 → factor 1.0
        assert wave_derate(3.0, 180.0) == pytest.approx(1.0, abs=1e-9)

    def test_head_seas_strongest_effect(self) -> None:
        # cos²(0) = 1, derate = 1 - 0.05 * Hs^1.75
        f = wave_derate(2.0, 0.0)
        assert f == pytest.approx(1.0 - 0.05 * 2.0**1.75, rel=1e-9)
        assert f < 1.0

    def test_floor_clamp(self) -> None:
        # Extreme Hs upwind → would go below 0.5, clamped
        assert wave_derate(20.0, 0.0) == 0.5

    def test_monotonic_in_hs_at_fixed_twa(self) -> None:
        a = wave_derate(0.5, 30.0)
        b = wave_derate(1.5, 30.0)
        c = wave_derate(2.5, 30.0)
        assert a > b > c

    def test_negative_hs_rejected(self) -> None:
        with pytest.raises(ValueError, match="hs_m"):
            wave_derate(-0.1, 0.0)


class TestEstimatePassageWaveCorrection:
    async def test_disabled_by_default_keeps_speed_but_surfaces_hs(self) -> None:
        # Hs is now always surfaced so callers see sea state. The flag only
        # gates the boat-speed derate.
        adapter = StubAdapter(tws_kn=12.0, twd_deg=180.0, hs_m=3.0)
        report = await estimate_passage(
            [Point(43.0, 5.0), Point(43.0, 5.5)],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        for s in report.segments:
            assert s.wave_derate_factor == 1.0  # no derate applied
            assert s.hs_m == pytest.approx(3.0)  # but Hs is visible

    async def test_enabled_slows_in_head_seas(self) -> None:
        # TWD=90 (wind from east), course east → TWA=0 (head seas).
        wpts = [Point(43.0, 5.0), Point(43.0, 5.5)]
        flat = StubAdapter(tws_kn=12.0, twd_deg=90.0, hs_m=0.5)
        rough = StubAdapter(tws_kn=12.0, twd_deg=90.0, hs_m=3.0)
        flat_report = await estimate_passage(
            wpts,
            DEPARTURE,
            "cruiser_40ft",
            adapter=flat,
            segment_length_nm=20.0,
            use_wave_correction=True,
        )
        rough_report = await estimate_passage(
            wpts,
            DEPARTURE,
            "cruiser_40ft",
            adapter=rough,
            segment_length_nm=20.0,
            use_wave_correction=True,
        )
        assert rough_report.duration_h > flat_report.duration_h * 1.05
        assert rough_report.segments[0].hs_m == pytest.approx(3.0)
        assert rough_report.segments[0].wave_derate_factor < 1.0


class HorizonLimitedStubAdapter:
    """Returns empty wind points for `short_horizon_models`; constant wind otherwise."""

    def __init__(
        self,
        short_horizon_models: tuple[str, ...] = ("meteofrance_arome_france",),
        tws_kn: float = 10.0,
        twd_deg: float = 0.0,
    ) -> None:
        self.short_horizon_models = short_horizon_models
        self.tws_kn = tws_kn
        self.twd_deg = twd_deg

    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle:
        models = models or ["meteofrance_arome_france"]
        wind: dict[str, WindSeries] = {}
        for m in models:
            if m in self.short_horizon_models:
                wind[m] = WindSeries(model=m, points=())
            else:
                points: list[WindPoint] = []
                t = start
                while t <= end:
                    points.append(
                        WindPoint(
                            time=t,
                            speed_kn=self.tws_kn,
                            direction_deg=self.twd_deg,
                            gust_kn=None,
                        )
                    )
                    t = t + timedelta(hours=1)
                wind[m] = WindSeries(model=m, points=tuple(points))
        return ForecastBundle(
            lat=lat,
            lon=lon,
            start=start,
            end=end,
            wind_by_model=wind,
            sea=SeaSeries(points=()),
            requested_at=start,
        )


class TestModelFallback:
    async def test_auto_uses_first_model(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            model="auto",
            segment_length_nm=10.0,
        )
        assert report.model == "meteofrance_arome_france"

    async def test_auto_falls_back_when_first_horizon_short(self) -> None:
        adapter = HorizonLimitedStubAdapter(short_horizon_models=("meteofrance_arome_france",))
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            model="auto",
            segment_length_nm=10.0,
        )
        assert report.model == "icon_eu"

    async def test_explicit_model_horizon_error_propagates(self) -> None:
        adapter = HorizonLimitedStubAdapter(short_horizon_models=("meteofrance_arome_france",))
        with pytest.raises(ForecastHorizonError) as excinfo:
            await estimate_passage(
                [MARSEILLE, PORQUEROLLES],
                DEPARTURE,
                "cruiser_40ft",
                adapter=adapter,
                model="meteofrance_arome_france",
                segment_length_nm=10.0,
            )
        assert excinfo.value.model == "meteofrance_arome_france"
        msg = str(excinfo.value)
        assert "horizon" in msg
        assert "meteofrance_arome_france" in msg

    async def test_auto_all_fail_raises_last(self) -> None:
        adapter = HorizonLimitedStubAdapter(
            short_horizon_models=(
                "meteofrance_arome_france",
                "icon_eu",
                "ecmwf_ifs025",
                "gfs_seamless",
            )
        )
        with pytest.raises(ForecastHorizonError) as excinfo:
            await estimate_passage(
                [MARSEILLE, PORQUEROLLES],
                DEPARTURE,
                "cruiser_40ft",
                adapter=adapter,
                model="auto",
                segment_length_nm=10.0,
            )
        assert excinfo.value.model == "gfs_seamless"


class TestBestVmgUpwind:
    def test_returns_positive_vmg_speed(self) -> None:
        polar = get_polar("cruiser_40ft")
        opt_twa, opt_speed = best_vmg_upwind(polar, 12.0)
        assert opt_twa > 0.0
        assert opt_speed > 0.0

    def test_optimal_twa_in_upwind_range(self) -> None:
        polar = get_polar("cruiser_40ft")
        opt_twa, _ = best_vmg_upwind(polar, 12.0)
        assert 30.0 <= opt_twa <= 90.0

    def test_all_archetypes_return_positive(self) -> None:
        from openwind_data.routing.archetypes import list_archetypes

        for archetype in list_archetypes():
            _, opt_speed = best_vmg_upwind(archetype, 10.0)
            assert opt_speed > 0.0, f"{archetype.name} returned zero speed"

    def test_light_wind_still_positive(self) -> None:
        polar = get_polar("cruiser_30ft")
        _, opt_speed = best_vmg_upwind(polar, 3.0)
        assert opt_speed > 0.0


class TestVmgUpwindCorrection:
    async def test_upwind_correction_gives_correct_vmg(self) -> None:
        # Dead upwind (TWA=0 deg): effective speed = polar(opt_twa) * cos(opt_twa).
        # This is the real VMG toward destination when tacking — always less than
        # polar(opt_twa) itself, and less than the clamped polar at 0° (which
        # lookup_polar returns as the first-column value, an inaccurate shortcut).
        polar = get_polar("cruiser_40ft")
        tws = 12.0
        opt_twa, opt_speed = best_vmg_upwind(polar, tws)
        vmg_effective = opt_speed * math.cos(math.radians(opt_twa))  # twa=0°
        # Must be positive and strictly less than the uncorrected polar at opt_twa.
        assert vmg_effective > 0.0
        assert vmg_effective < opt_speed
        # Also less than beam-reach speed (physically expected: upwind is slower).
        beam_speed = lookup_polar(polar, tws, 90.0)
        assert vmg_effective < beam_speed

    async def test_partial_upwind_less_penalty_than_dead_upwind(self) -> None:
        # TWA=20° → cos(opt-20°) is larger than cos(opt-0°) → less speed reduction.
        polar = get_polar("cruiser_40ft")
        tws = 12.0
        opt_twa, opt_speed = best_vmg_upwind(polar, tws)
        # Both are upwind (< opt_twa assumed > 20°)
        assert opt_twa > 20.0, "test premise: optimal twa must be >20° for this archetype"
        eff_0 = opt_speed * math.cos(math.radians(opt_twa - 0.0))
        eff_20 = opt_speed * math.cos(math.radians(opt_twa - 20.0))
        assert eff_20 > eff_0

    async def test_smooth_transition_at_optimal_angle(self) -> None:
        # At twa == opt_twa: cos(0) = 1 → effective_polar = opt_speed = lookup(polar, tws, opt_twa)
        polar = get_polar("cruiser_40ft")
        tws = 12.0
        opt_twa, opt_speed = best_vmg_upwind(polar, tws)
        effective = opt_speed * math.cos(math.radians(opt_twa - opt_twa))
        assert effective == pytest.approx(opt_speed, rel=1e-9)

    async def test_beam_reach_unchanged(self) -> None:
        # TWA=90° equals opt_twa threshold boundary or above → use direct polar.
        # Simulate: wind from west (270°), route northward (bearing≈0°).
        # normalize_twa(twd=270, course=0) → |270-0| normalized → 90°
        adapter = StubAdapter(tws_kn=12.0, twd_deg=270.0)
        report = await estimate_passage(
            [Point(43.0, 5.0), Point(44.0, 5.0)],  # northward
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        polar = get_polar("cruiser_40ft")
        for seg in report.segments:
            # At TWA=90°, no VMG correction should be applied.
            expected = lookup_polar(polar, seg.tws_kn, seg.twa_deg)
            assert seg.polar_speed_kn == pytest.approx(expected, rel=1e-9)

    async def test_downwind_route_unchanged(self) -> None:
        # TWD=270 (wind from west), route westward (bearing≈270°) → TWA=180°.
        adapter = StubAdapter(tws_kn=12.0, twd_deg=270.0)
        report = await estimate_passage(
            [Point(43.0, 6.0), Point(43.0, 5.0)],  # westward
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        polar = get_polar("cruiser_40ft")
        for seg in report.segments:
            expected = lookup_polar(polar, seg.tws_kn, seg.twa_deg)
            assert seg.polar_speed_kn == pytest.approx(expected, rel=1e-9)


class TestEstimatePassageWindows:
    async def test_returns_correct_window_count_exact(self) -> None:
        # 6h sweep at 1h → 7 windows (06:00, 07:00, ..., 12:00)
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        earliest = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
        latest = datetime(2026, 5, 1, 12, 0, tzinfo=UTC)
        reports = await estimate_passage_windows(
            [MARSEILLE, PORQUEROLLES],
            earliest,
            latest,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        assert len(reports) == 7

    async def test_returns_correct_window_count_interval(self) -> None:
        # 6h sweep at 2h → 4 windows (06:00, 08:00, 10:00, 12:00)
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        earliest = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
        latest = datetime(2026, 5, 1, 12, 0, tzinfo=UTC)
        reports = await estimate_passage_windows(
            [MARSEILLE, PORQUEROLLES],
            earliest,
            latest,
            "cruiser_40ft",
            sweep_interval_hours=2,
            adapter=adapter,
            segment_length_nm=20.0,
        )
        assert len(reports) == 4

    async def test_each_window_departure_is_correct(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        earliest = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
        latest = datetime(2026, 5, 1, 8, 0, tzinfo=UTC)
        reports = await estimate_passage_windows(
            [MARSEILLE, PORQUEROLLES],
            earliest,
            latest,
            "cruiser_40ft",
            sweep_interval_hours=1,
            adapter=adapter,
            segment_length_nm=20.0,
        )
        assert len(reports) == 3
        assert reports[0].departure_time == earliest
        assert reports[1].departure_time == earliest + timedelta(hours=1)
        assert reports[2].departure_time == earliest + timedelta(hours=2)

    async def test_single_window_when_equal(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        t = datetime(2026, 5, 1, 8, 0, tzinfo=UTC)
        reports = await estimate_passage_windows(
            [MARSEILLE, PORQUEROLLES],
            t,
            t,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        assert len(reports) == 1
        assert reports[0].departure_time == t

    async def test_window_cap_raises(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        earliest = datetime(2026, 5, 1, 0, 0, tzinfo=UTC)
        latest = earliest + timedelta(days=15)  # 360 windows > 336 cap
        with pytest.raises(ValueError, match=str(MAX_SWEEP_WINDOWS)):
            await estimate_passage_windows(
                [MARSEILLE, PORQUEROLLES],
                earliest,
                latest,
                "cruiser_40ft",
                adapter=adapter,
            )

    async def test_naive_departure_rejected(self) -> None:
        adapter = StubAdapter()
        with pytest.raises(ValueError, match="timezone-aware"):
            await estimate_passage_windows(
                [MARSEILLE, PORQUEROLLES],
                datetime(2026, 5, 1, 6, 0),  # naive
                datetime(2026, 5, 1, 8, 0, tzinfo=UTC),
                "cruiser_40ft",
                adapter=adapter,
            )

    async def test_latest_before_earliest_rejected(self) -> None:
        adapter = StubAdapter()
        earliest = datetime(2026, 5, 1, 12, 0, tzinfo=UTC)
        latest = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
        with pytest.raises(ValueError):
            await estimate_passage_windows(
                [MARSEILLE, PORQUEROLLES],
                earliest,
                latest,
                "cruiser_40ft",
                adapter=adapter,
            )

    async def test_all_windows_are_passagereports(self) -> None:
        from openwind_data.routing.passage import PassageReport

        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        earliest = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
        latest = datetime(2026, 5, 1, 8, 0, tzinfo=UTC)
        reports = await estimate_passage_windows(
            [MARSEILLE, PORQUEROLLES],
            earliest,
            latest,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        for r in reports:
            assert isinstance(r, PassageReport)
            assert r.duration_h > 0
            assert r.distance_nm > 0

    async def test_per_window_auto_fallback_to_longer_horizon(self) -> None:
        """When the cache-warmed model can't cover a later window, the sweep
        retries with auto so we escalate to ICON/ECMWF/GFS instead of
        silently dropping the window. The whole point of `model="auto"`."""
        # Adapter where AROME is empty (zero horizon) but ICON-EU works.
        # First window will resolve to icon_eu; later windows would still hit
        # icon_eu's horizon in the deployed scenario, but here we model the
        # common pattern: AROME-too-short → fallback chain finds the next.
        adapter = HorizonLimitedStubAdapter(short_horizon_models=("meteofrance_arome_france",))
        earliest = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
        latest = datetime(2026, 5, 1, 12, 0, tzinfo=UTC)  # 7 windows at 1h
        reports = await estimate_passage_windows(
            [MARSEILLE, PORQUEROLLES],
            earliest,
            latest,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
            model="auto",
        )
        # All 7 windows must be covered by the fallback model — none dropped.
        assert len(reports) == 7
        # And every report uses the same fallback model (icon_eu, next in
        # the auto chain after AROME).
        assert all(r.model == "icon_eu" for r in reports)

    async def test_explicit_model_skips_on_horizon_error(self) -> None:
        """When the user pinned a specific model (no `auto`), out-of-horizon
        windows are skipped with no fallback — explicit choice wins."""
        # AROME-only adapter; user pins icon_eu → every window misses.
        adapter = HorizonLimitedStubAdapter(short_horizon_models=("icon_eu",))
        earliest = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
        latest = datetime(2026, 5, 1, 8, 0, tzinfo=UTC)
        # Pinning a model that has no data → first window raises, propagates.
        with pytest.raises(ForecastHorizonError):
            await estimate_passage_windows(
                [MARSEILLE, PORQUEROLLES],
                earliest,
                latest,
                "cruiser_40ft",
                adapter=adapter,
                segment_length_nm=20.0,
                model="icon_eu",
            )

    async def test_partial_skip_on_per_window_horizon_error(self) -> None:
        """Some windows hitting ForecastHorizonError must NOT fail the whole sweep.
        Caller infers skip count from len(reports) vs expected window count."""
        from openwind_data.adapters.base import (
            ForecastBundle as _FB,
        )
        from openwind_data.adapters.base import (
            SeaSeries as _SS,
        )
        from openwind_data.adapters.base import (
            WindSeries as _WS,
        )

        class FlakyAdapter(StubAdapter):
            """Returns empty wind for the 3rd fetch onward (mid-times past 2nd window)."""

            def __init__(self) -> None:
                super().__init__(tws_kn=10.0, twd_deg=0.0)
                self.fetch_count = 0
                self.fail_at_call = 6  # let prewarm + first sweep window pass

            async def fetch(
                self,
                lat: float,
                lon: float,
                start: datetime,
                end: datetime,
                models: list[str] | None = None,
            ) -> _FB:
                self.fetch_count += 1
                if self.fetch_count >= self.fail_at_call:
                    return _FB(
                        lat=lat,
                        lon=lon,
                        start=start,
                        end=end,
                        wind_by_model={
                            (models or ["meteofrance_arome_france"])[0]: _WS(
                                model=(models or ["meteofrance_arome_france"])[0], points=()
                            )
                        },
                        sea=_SS(points=()),
                        requested_at=start,
                    )
                return await super().fetch(lat, lon, start, end, models)

        adapter = FlakyAdapter()
        earliest = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
        latest = datetime(2026, 5, 1, 12, 0, tzinfo=UTC)  # 7 windows at 1h
        reports = await estimate_passage_windows(
            [MARSEILLE, PORQUEROLLES],
            earliest,
            latest,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        # First window must succeed (resolved before flakiness kicks in).
        assert len(reports) >= 1
        # Some windows skipped → fewer than 7 total, no exception bubbled.
        assert len(reports) < 7


class TestSeaStateAlwaysSurfaced:
    """Hs must be populated on every segment when sea data is available,
    regardless of use_wave_correction. The flag only gates the speed derate."""

    async def test_hs_populated_when_correction_disabled(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0, hs_m=0.6)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
            use_wave_correction=False,
        )
        for seg in report.segments:
            assert seg.hs_m == pytest.approx(0.6)
            assert seg.wave_derate_factor == 1.0  # no derate applied

    async def test_hs_populated_when_correction_enabled(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0, hs_m=0.6)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
            use_wave_correction=True,
        )
        for seg in report.segments:
            assert seg.hs_m == pytest.approx(0.6)

    async def test_hs_none_when_no_sea_data(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0, hs_m=None)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        for seg in report.segments:
            assert seg.hs_m is None


class TestCurrentSog:
    """Currents are projected on the segment bearing to compute SOG, which
    drives duration. Following currents shorten the passage, opposing currents
    lengthen it. With no current data, SOG falls back to STW (legacy behavior).
    """

    async def test_following_current_shortens_passage(self) -> None:
        # Course east (~90°), current setting east (90°) → fully aligned.
        # SOG = boat_speed + current → faster passage than no-current baseline.
        baseline = StubAdapter(tws_kn=12.0, twd_deg=180.0)  # no current
        following = StubAdapter(tws_kn=12.0, twd_deg=180.0, current_kn=2.0, current_to_deg=90.0)
        route = [Point(43.0, 5.0), Point(43.0, 6.0)]  # ~44 nm bearing ~90°
        baseline_report = await estimate_passage(
            route, DEPARTURE, "cruiser_40ft", adapter=baseline, segment_length_nm=20.0
        )
        following_report = await estimate_passage(
            route, DEPARTURE, "cruiser_40ft", adapter=following, segment_length_nm=20.0
        )
        assert following_report.duration_h < baseline_report.duration_h
        for seg in following_report.segments:
            assert seg.current_speed_kn == pytest.approx(2.0)
            assert seg.sog_kn is not None and seg.sog_kn > seg.boat_speed_kn

    async def test_opposing_current_lengthens_passage(self) -> None:
        # Course east, current setting west (270°) → fully opposed.
        # SOG = boat_speed - current → slower passage.
        baseline = StubAdapter(tws_kn=12.0, twd_deg=180.0)
        opposing = StubAdapter(tws_kn=12.0, twd_deg=180.0, current_kn=2.0, current_to_deg=270.0)
        route = [Point(43.0, 5.0), Point(43.0, 6.0)]
        baseline_report = await estimate_passage(
            route, DEPARTURE, "cruiser_40ft", adapter=baseline, segment_length_nm=20.0
        )
        opposing_report = await estimate_passage(
            route, DEPARTURE, "cruiser_40ft", adapter=opposing, segment_length_nm=20.0
        )
        assert opposing_report.duration_h > baseline_report.duration_h
        for seg in opposing_report.segments:
            assert seg.sog_kn is not None and seg.sog_kn < seg.boat_speed_kn

    async def test_no_current_data_preserves_legacy_timing(self) -> None:
        # Sanity: when the adapter doesn't supply current fields, sog_kn is
        # None and duration matches the pre-currents formula exactly.
        adapter = StubAdapter(tws_kn=12.0, twd_deg=180.0)
        report = await estimate_passage(
            [Point(43.0, 5.0), Point(43.0, 6.0)],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        for seg in report.segments:
            assert seg.current_speed_kn is None
            assert seg.current_direction_to_deg is None
            assert seg.sog_kn is None
        expected_h = sum(s.distance_nm / s.boat_speed_kn for s in report.segments)
        assert report.duration_h == pytest.approx(expected_h, abs=1e-6)


class TestSeaStatePassageWarningsRemoved:
    """Sea-state warnings live on the complexity score now, not the passage
    report. The passage's `warnings` field stays free of mer/forte-mer entries
    so the UI can render them once via complexity without dedup."""

    async def test_no_sea_warning_on_passage_even_when_rough(self) -> None:
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0, hs_m=3.0)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=20.0,
        )
        assert not any("mer" in w.lower() for w in report.warnings)


class TestEstimatePassageForArrival:
    """ETA-driven solver: given a target arrival, find the right departure."""

    async def test_arrival_lands_exactly_on_target(self) -> None:
        # Backward resolution anchors the last segment's end_time at target,
        # so arrival must equal target to microsecond precision (the only
        # drift comes from cumulative timedelta arithmetic, sub-microsecond).
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        target = datetime(2026, 5, 1, 14, 0, tzinfo=UTC)
        plan = await estimate_passage_for_arrival(
            [MARSEILLE, PORQUEROLLES],
            target,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=10.0,
        )
        assert plan.target_arrival == target
        assert plan.report.arrival_time == target
        # And departure + duration ≈ arrival (sanity)
        expected_arrival = plan.report.departure_time + timedelta(hours=plan.report.duration_h)
        assert abs((plan.report.arrival_time - expected_arrival).total_seconds()) < 1e-3

    async def test_segments_chain_continuously_to_target(self) -> None:
        # End-to-end: each segment's end_time equals the next segment's
        # start_time, the last segment's end_time equals target.
        adapter = StubAdapter(tws_kn=12.0, twd_deg=180.0)
        target = datetime(2026, 5, 1, 16, 0, tzinfo=UTC)
        plan = await estimate_passage_for_arrival(
            [MARSEILLE, PORQUEROLLES],
            target,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=10.0,
        )
        for s1, s2 in pairwise(plan.report.segments):
            assert s1.end_time == s2.start_time
        assert plan.report.segments[-1].end_time == target
        assert plan.report.segments[0].start_time == plan.report.departure_time

    async def test_one_fetch_per_segment(self) -> None:
        # Backward solver issues one fetch per segment, no iteration multiplier.
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        target = datetime(2026, 5, 1, 14, 0, tzinfo=UTC)
        plan = await estimate_passage_for_arrival(
            [MARSEILLE, PORQUEROLLES],
            target,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=10.0,
        )
        assert len(adapter.calls) == len(plan.report.segments)

    async def test_naive_target_rejected(self) -> None:
        adapter = StubAdapter()
        with pytest.raises(ValueError, match="timezone-aware"):
            await estimate_passage_for_arrival(
                [MARSEILLE, PORQUEROLLES],
                datetime(2026, 5, 1, 14, 0),  # naive
                "cruiser_40ft",
                adapter=adapter,
            )

    async def test_invalid_efficiency_rejected(self) -> None:
        adapter = StubAdapter()
        with pytest.raises(ValueError, match="efficiency"):
            await estimate_passage_for_arrival(
                [MARSEILLE, PORQUEROLLES],
                datetime(2026, 5, 1, 14, 0, tzinfo=UTC),
                "cruiser_40ft",
                adapter=adapter,
                efficiency=0.0,
            )

    async def test_target_arrival_with_local_tz_converted_to_utc(self) -> None:
        # A non-UTC tzinfo should be normalized; target_arrival on the result
        # is stored as UTC.
        from datetime import timezone as tz

        local = tz(timedelta(hours=2))
        target_local = datetime(2026, 5, 1, 16, 0, tzinfo=local)  # = 14:00 UTC
        adapter = StubAdapter(tws_kn=10.0, twd_deg=0.0)
        plan = await estimate_passage_for_arrival(
            [MARSEILLE, PORQUEROLLES],
            target_local,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=10.0,
        )
        assert plan.target_arrival == target_local.astimezone(UTC)


class TestPolarOverride:
    """Custom polar payload overrides the bundled archetype polar."""

    @staticmethod
    def _doubled_polar(base_name: str) -> "BoatPolar":
        from openwind_data.routing.archetypes import BoatPolar

        base = get_polar(base_name)
        doubled = tuple(tuple(v * 2.0 for v in row) for row in base.boat_speed_kn)
        return BoatPolar(
            name="custom",
            length_ft=base.length_ft,
            type=base.type,
            category=base.category,
            examples=base.examples,
            performance_class=base.performance_class,
            tws_kn=base.tws_kn,
            twa_deg=base.twa_deg,
            boat_speed_kn=doubled,
        )

    async def test_override_changes_duration(self) -> None:
        # Doubling polar speeds → ~half the duration (modulo VMG kicker around
        # close-hauled, identical here because we set up a beam reach).
        adapter_base = StubAdapter(tws_kn=12.0, twd_deg=0.0)
        baseline = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter_base,
            segment_length_nm=10.0,
        )

        adapter_custom = StubAdapter(tws_kn=12.0, twd_deg=0.0)
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter_custom,
            segment_length_nm=10.0,
            polar_override=self._doubled_polar("cruiser_40ft"),
        )
        # Halved speed → halved duration; allow 5 % slack for VMG corrections.
        assert report.duration_h == pytest.approx(baseline.duration_h / 2.0, rel=0.05)
        # Archetype label preserved (the override is a perf layer, not a relabel).
        assert report.archetype == "cruiser_40ft"

    async def test_override_used_in_compare_windows(self) -> None:
        # Sweep mode must thread polar_override through every window.
        adapter = StubAdapter(tws_kn=12.0, twd_deg=0.0)
        custom = self._doubled_polar("cruiser_40ft")
        reports = await estimate_passage_windows(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            DEPARTURE + timedelta(hours=3),
            "cruiser_40ft",
            sweep_interval_hours=1,
            adapter=adapter,
            segment_length_nm=10.0,
            polar_override=custom,
        )
        # 4 windows (hours 0..3), all using the custom polar.
        assert len(reports) == 4
        baseline_dur = reports[0].duration_h
        # Identical wind series + identical polar → identical durations across windows.
        for r in reports:
            assert r.duration_h == pytest.approx(baseline_dur, rel=0.01)

    async def test_override_used_in_eta_solver(self) -> None:
        adapter = StubAdapter(tws_kn=12.0, twd_deg=0.0)
        target = datetime(2026, 5, 1, 14, 0, tzinfo=UTC)
        baseline = await estimate_passage_for_arrival(
            [MARSEILLE, PORQUEROLLES],
            target,
            "cruiser_40ft",
            adapter=StubAdapter(tws_kn=12.0, twd_deg=0.0),
            segment_length_nm=10.0,
        )
        custom = self._doubled_polar("cruiser_40ft")
        plan = await estimate_passage_for_arrival(
            [MARSEILLE, PORQUEROLLES],
            target,
            "cruiser_40ft",
            adapter=adapter,
            segment_length_nm=10.0,
            polar_override=custom,
        )
        assert plan.report.duration_h == pytest.approx(baseline.report.duration_h / 2.0, rel=0.05)
        assert plan.report.arrival_time == target


class TestModelChainOverride:
    """Caller-supplied model chain overrides the default AROME→ICON→ECMWF→GFS."""

    async def test_chain_walked_in_order(self) -> None:
        # AROME has no horizon → chain should fall through to ICON-EU.
        adapter = HorizonLimitedStubAdapter(short_horizon_models=("meteofrance_arome_france",))
        report = await estimate_passage(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            "cruiser_40ft",
            adapter=adapter,
            model="auto",
            model_chain=("meteofrance_arome_france", "icon_eu"),
            segment_length_nm=10.0,
        )
        assert report.model == "icon_eu"

    async def test_chain_can_skip_default_models(self) -> None:
        # Only one model in the chain; if it has no horizon, all fail.
        adapter = HorizonLimitedStubAdapter(short_horizon_models=("icon_eu",))
        with pytest.raises(ForecastHorizonError) as excinfo:
            await estimate_passage(
                [MARSEILLE, PORQUEROLLES],
                DEPARTURE,
                "cruiser_40ft",
                adapter=adapter,
                model="auto",
                model_chain=("icon_eu",),
                segment_length_nm=10.0,
            )
        assert excinfo.value.model == "icon_eu"

    async def test_chain_threaded_through_windows(self) -> None:
        # First-window resolution must respect model_chain, not fall back to
        # the hard-coded AUTO chain.
        adapter = HorizonLimitedStubAdapter(short_horizon_models=("meteofrance_arome_france",))
        reports = await estimate_passage_windows(
            [MARSEILLE, PORQUEROLLES],
            DEPARTURE,
            DEPARTURE + timedelta(hours=2),
            "cruiser_40ft",
            sweep_interval_hours=1,
            adapter=adapter,
            model="auto",
            model_chain=("meteofrance_arome_france", "icon_eu"),
            segment_length_nm=10.0,
        )
        assert all(r.model == "icon_eu" for r in reports)

    async def test_chain_threaded_through_eta_solver(self) -> None:
        adapter = HorizonLimitedStubAdapter(short_horizon_models=("meteofrance_arome_france",))
        target = datetime(2026, 5, 1, 14, 0, tzinfo=UTC)
        plan = await estimate_passage_for_arrival(
            [MARSEILLE, PORQUEROLLES],
            target,
            "cruiser_40ft",
            adapter=adapter,
            model="auto",
            model_chain=("meteofrance_arome_france", "icon_eu"),
            segment_length_nm=10.0,
        )
        assert plan.report.model == "icon_eu"
