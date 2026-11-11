# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The one place that decides and names the state of the sea."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from openwind_data.routing.geometry import Point
from openwind_data.routing.passage import estimate_passage
from openwind_data.routing.sea_state import SEA_BANDS, SEA_NAMES, sea_flag, sea_level
from openwind_data.testing import DeterministicMarineAdapter


def _flag(
    *,
    twd_deg: float = 0.0,
    twa_deg: float = 90.0,
    hs_m: float | None = None,
    wave_period_s: float | None = None,
    current_speed_kn: float | None = None,
    current_direction_to_deg: float | None = None,
) -> str | None:
    return sea_flag(
        twd_deg=twd_deg,
        twa_deg=twa_deg,
        hs_m=hs_m,
        wave_period_s=wave_period_s,
        current_speed_kn=current_speed_kn,
        current_direction_to_deg=current_direction_to_deg,
    )


class TestSeaLevel:
    def test_none_without_a_wave_height(self) -> None:
        assert sea_level(None) is None

    @pytest.mark.parametrize(
        ("hs_m", "level"),
        [(0.0, 1), (0.44, 1), (0.5, 2), (1.24, 2), (1.25, 3), (2.5, 4), (4.0, 5), (9.0, 5)],
    )
    def test_levels(self, hs_m: float, level: int) -> None:
        assert sea_level(hs_m) == level

    @pytest.mark.parametrize(("hs_m", "level"), [(1.249, 2), (2.449, 3), (2.46, 4), (3.96, 5)])
    def test_reads_the_height_as_printed(self, hs_m: float, level: int) -> None:
        # 2.46 m is printed "2.5": a "Mer forte", like any 2.5.
        assert sea_level(hs_m) == level

    def test_every_warning_level_has_a_name_made_of_its_label(self) -> None:
        labels = {level: label for _, level, label in SEA_BANDS}
        for level, name in SEA_NAMES.items():
            assert labels[level] in name.lower(), level


class TestSeaFlag:
    def test_nothing_on_a_quiet_segment(self) -> None:
        assert _flag(hs_m=0.6, wave_period_s=6.0, current_speed_kn=0.4) is None

    def test_wind_against_current(self) -> None:
        # Wind from the west blows towards the east (90°); a current setting
        # west (270°) is dead against it.
        assert (
            _flag(twd_deg=270.0, current_speed_kn=1.5, current_direction_to_deg=270.0)
            == "wind_against_current"
        )

    def test_a_current_with_the_wind_is_not_flagged(self) -> None:
        assert _flag(twd_deg=270.0, current_speed_kn=3.0, current_direction_to_deg=90.0) is None

    def test_a_weak_opposed_current_is_not_flagged(self) -> None:
        assert _flag(twd_deg=270.0, current_speed_kn=1.4, current_direction_to_deg=270.0) is None

    def test_short_chop_on_the_beam_and_following_chop_from_behind(self) -> None:
        # 1.2 m at 4.5 s: steepness 0.059.
        assert _flag(hs_m=1.2, wave_period_s=4.5, twa_deg=90.0) == "chop_short"
        assert _flag(hs_m=1.2, wave_period_s=4.5, twa_deg=120.0) == "chop_following"
        assert _flag(hs_m=1.2, wave_period_s=4.5, twa_deg=-150.0) == "chop_following"

    def test_a_long_swell_and_a_ripple_are_not_chop(self) -> None:
        assert _flag(hs_m=1.8, wave_period_s=11.0) is None
        assert _flag(hs_m=0.4, wave_period_s=2.0) is None
        assert _flag(hs_m=1.5, wave_period_s=None) is None

    def test_wind_against_current_wins_over_chop(self) -> None:
        assert (
            _flag(
                twd_deg=270.0,
                hs_m=1.2,
                wave_period_s=4.5,
                current_speed_kn=2.5,
                current_direction_to_deg=270.0,
            )
            == "wind_against_current"
        )


class TestTheEngineStampsEverySegment:
    async def test_a_segment_carries_the_verdict_of_this_module(self) -> None:
        # Marseille to Porquerolles on the deterministic weather: the engine
        # writes on each segment what these functions say of its own values,
        # so the score, the MCP answer and the web app read one decision.
        report = await estimate_passage(
            [Point(43.30, 5.35), Point(43.00, 6.20)],
            datetime(2026, 5, 1, 6, 0, tzinfo=UTC),
            "cruiser_30ft",
            adapter=DeterministicMarineAdapter(),
        )
        assert len(report.segments) > 3
        for seg in report.segments:
            assert seg.sea_level == sea_level(seg.hs_m)
            assert seg.sea_flag == sea_flag(
                twd_deg=seg.twd_deg,
                twa_deg=seg.twa_deg,
                hs_m=seg.hs_m,
                wave_period_s=seg.wave_period_s,
                current_speed_kn=seg.current_speed_kn,
                current_direction_to_deg=seg.current_direction_to_deg,
            )
        assert {seg.sea_level for seg in report.segments} <= {1, 2, 3}
