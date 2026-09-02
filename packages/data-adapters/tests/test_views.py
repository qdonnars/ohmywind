# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Unit coverage for the views and the shared waypoint parser.

The goldens in ``hf-space/tests`` and ``mcp-core/tests`` already pin what
these produce inside a full response. What they cannot show is the reason a
given rule exists, so the cases that are easy to get wrong on a rewrite live
here: the two waypoint notations reaching the same route, the ``target_eta``
filter returning everything rather than nothing when nothing matches, and the
key order that the sweep table depends on.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest

from openwind_data.routing.geometry import Point, parse_waypoints
from openwind_data.views import (
    TARGET_ETA_TOLERANCE,
    filter_windows_by_target_eta,
    skipped_windows_warning,
    sweep_view,
    widened_interval_warning,
)

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)


class TestParseWaypoints:
    """One parser, two notations, one wording."""

    def test_reads_the_web_client_pair_notation(self) -> None:
        assert parse_waypoints([[43.29, 5.37], [43.0, 6.2]]) == [
            Point(lat=43.29, lon=5.37),
            Point(lat=43.0, lon=6.2),
        ]

    def test_reads_the_mcp_object_notation(self) -> None:
        assert parse_waypoints([{"lat": 43.29, "lon": 5.37}, {"lat": 43.0, "lon": 6.2}]) == [
            Point(lat=43.29, lon=5.37),
            Point(lat=43.0, lon=6.2),
        ]

    def test_the_two_notations_describe_the_same_route(self) -> None:
        # The property that matters: an assistant and the web app planning the
        # same passage must hand the engine the same points.
        assert parse_waypoints([[43.29, 5.37], [43.0, 6.2]]) == parse_waypoints(
            [{"lat": 43.29, "lon": 5.37}, {"lat": 43.0, "lon": 6.2}]
        )

    def test_a_short_pair_is_named_as_a_waypoint_problem(self) -> None:
        # "invalid waypoints:" is the prefix the web client's error mapping
        # keys on; the detail after it comes from the failure itself.
        with pytest.raises(ValueError, match=r"^invalid waypoints: "):
            parse_waypoints([[43.29], [43.0, 6.2]])

    def test_a_missing_key_is_named_as_a_waypoint_problem(self) -> None:
        with pytest.raises(ValueError, match=r"^invalid waypoints: "):
            parse_waypoints([{"lat": 43.29}, {"lat": 43.0, "lon": 6.2}])

    def test_bounds_are_checked_before_returning(self) -> None:
        # Not an "invalid waypoints:" failure: the route parsed, it is simply
        # not on Earth. Letting it through used to produce a "forecast horizon
        # exceeded" from Open-Meteo, which named the wrong problem.
        with pytest.raises(ValueError, match=r"waypoint 1: lat=95.0 out of range"):
            parse_waypoints([[43.29, 5.37], [95.0, 6.2]])

    def test_a_single_waypoint_is_not_a_route(self) -> None:
        with pytest.raises(ValueError, match="at least 2 waypoints required"):
            parse_waypoints([[43.29, 5.37]])


def _window(arrival: datetime) -> dict:
    return {"departure": DEPARTURE.isoformat(), "arrival": arrival.isoformat()}


class TestTargetEtaFilter:
    def test_keeps_the_windows_inside_the_tolerance(self) -> None:
        target = DEPARTURE + timedelta(hours=10)
        windows = [
            _window(target - timedelta(hours=5)),
            _window(target - timedelta(minutes=30)),
            _window(target + timedelta(hours=1)),
            _window(target + timedelta(hours=6)),
        ]
        kept, warning = filter_windows_by_target_eta(windows, target, "T")
        assert kept == windows[1:3]
        assert warning is None

    def test_the_tolerance_is_inclusive_at_its_edge(self) -> None:
        target = DEPARTURE + timedelta(hours=10)
        kept, _ = filter_windows_by_target_eta(
            [_window(target + TARGET_ETA_TOLERANCE)], target, "T"
        )
        assert len(kept) == 1

    def test_nothing_matching_returns_everything_and_says_so(self) -> None:
        # An empty answer would read as "this passage is impossible". The
        # useful reply is "not at that hour, here is what there is".
        target = DEPARTURE + timedelta(days=3)
        windows = [_window(DEPARTURE + timedelta(hours=8))]
        kept, warning = filter_windows_by_target_eta(windows, target, "2026-05-04T06:00:00+00:00")
        assert kept == windows
        assert warning is not None
        assert "2026-05-04T06:00:00+00:00" in warning
        assert "toutes les 1 fenêtres retournées" in warning

    def test_the_label_is_echoed_verbatim(self) -> None:
        # The user reads back the string they sent, not a normalised rewrite
        # of it, which is what makes a typo visible.
        target = DEPARTURE + timedelta(days=3)
        _, warning = filter_windows_by_target_eta([_window(DEPARTURE)], target, "samedi 18h")
        assert warning is not None
        assert "target_eta=samedi 18h" in warning

    def test_an_offset_target_is_compared_in_utc(self) -> None:
        # 08:00+02:00 is 06:00 UTC. Comparing the wall clocks instead would
        # shift every Mediterranean plan by two hours.
        arrival = DEPARTURE + timedelta(hours=8)
        target = arrival.astimezone(timezone(timedelta(hours=2)))
        kept, warning = filter_windows_by_target_eta([_window(arrival)], target, "T")
        assert len(kept) == 1
        assert warning is None

    def test_a_naive_target_is_refused_rather_than_read_locally(self) -> None:
        # Audit Mo5. ``astimezone`` on a naive value silently adopts the
        # server's own offset, so the same request filtered differently on a
        # developer's machine and in the container. The guard sits here, in
        # the shared view, so neither shell can lose it.
        naive = (DEPARTURE + timedelta(hours=8)).replace(tzinfo=None)
        with pytest.raises(ValueError, match="target_eta must be timezone-aware"):
            filter_windows_by_target_eta([_window(DEPARTURE)], naive, "T")


class TestSweepEnvelope:
    def test_counts_the_windows_it_actually_carries(self) -> None:
        envelope = sweep_view(
            earliest=DEPARTURE,
            latest=DEPARTURE + timedelta(hours=5),
            interval_hours=1,
            windows=[_window(DEPARTURE + timedelta(hours=8))],
            meta_warnings=[],
        )
        assert envelope["sweep"]["window_count"] == 1

    def test_key_order_is_the_recorded_one(self) -> None:
        # The sweep table renders windows[] in the order it arrives and the
        # goldens compare bytes, so this is a contract, not a style.
        envelope = sweep_view(
            earliest=DEPARTURE,
            latest=DEPARTURE + timedelta(hours=5),
            interval_hours=1,
            windows=[],
            meta_warnings=[],
        )
        assert list(envelope) == ["mode", "sweep", "windows", "meta_warnings"]
        assert list(envelope["sweep"]) == [
            "earliest",
            "latest",
            "interval_hours",
            "window_count",
        ]


class TestMetaWarnings:
    def test_the_widened_interval_names_both_intervals_and_the_cause(self) -> None:
        message = widened_interval_warning(2, 1, 29)
        assert "2 h" in message and "1 h" in message and "29 tronçons" in message

    def test_the_skipped_windows_warning_names_both_counts(self) -> None:
        message = skipped_windows_warning(3, 21)
        assert "3 fenêtre(s) ignorée(s)" in message
        assert "21 restantes" in message
