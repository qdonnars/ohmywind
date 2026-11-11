# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Boundary validation for waypoints and single points.

These guards run at the public boundary (REST handlers + MCP tools), so their
exact messages are part of the contract the web client's ``friendlyError``
matches on. Changing the wording here means changing ``web/src/api/passage.ts``
in the same commit.
"""

from __future__ import annotations

import math

import pytest

from openwind_data.routing.geometry import (
    EARTH_RADIUS_NM,
    MAX_ROUTE_NM,
    MAX_WAYPOINTS,
    Point,
    validate_point,
    validate_waypoints,
)

MARSEILLE = Point(43.30, 5.35)
PORQUEROLLES = Point(43.00, 6.20)


def test_valid_route_passes() -> None:
    validate_waypoints([MARSEILLE, PORQUEROLLES])


def test_extremes_are_inclusive() -> None:
    # Each pair shares a pole, so the route has no length: the test is about
    # the coordinate bounds, not about the length cap (pole to pole is 10 800 nm).
    validate_waypoints([Point(-90.0, -180.0), Point(-90.0, 180.0)])
    validate_waypoints([Point(90.0, 180.0), Point(90.0, -180.0)])


def test_single_waypoint_rejected() -> None:
    with pytest.raises(ValueError, match="at least 2 waypoints required"):
        validate_waypoints([MARSEILLE])


def test_message_for_too_few_is_byte_identical_to_legacy_rest_wording() -> None:
    # The web maps /at least 2 waypoints/i; keep it verbatim.
    with pytest.raises(ValueError) as excinfo:
        validate_waypoints([])
    assert str(excinfo.value) == "at least 2 waypoints required"


@pytest.mark.parametrize("lat", [999.0, 90.1, -90.1, -1e9])
def test_out_of_range_lat_rejected(lat: float) -> None:
    with pytest.raises(ValueError, match=r"waypoint 0: lat=.* out of range \[-90, 90\]"):
        validate_waypoints([Point(lat, 5.35), PORQUEROLLES])


@pytest.mark.parametrize("lon", [180.5, -180.5, 1e9])
def test_out_of_range_lon_rejected(lon: float) -> None:
    with pytest.raises(ValueError, match=r"waypoint 1: lon=.* out of range \[-180, 180\]"):
        validate_waypoints([MARSEILLE, Point(43.0, lon)])


def test_offending_index_is_reported() -> None:
    with pytest.raises(ValueError, match="waypoint 2:"):
        validate_waypoints([MARSEILLE, PORQUEROLLES, Point(91.0, 6.0)])


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf])
def test_non_finite_rejected(bad: float) -> None:
    # json.loads accepts the bare NaN/Infinity literals, so these really can
    # arrive from a POST body. Plain range comparisons let NaN through.
    with pytest.raises(ValueError, match="out of range"):
        validate_waypoints([Point(bad, 5.35), PORQUEROLLES])
    with pytest.raises(ValueError, match="out of range"):
        validate_waypoints([MARSEILLE, Point(43.0, bad)])


def test_waypoint_count_capped() -> None:
    route = [Point(43.0 + i * 0.001, 5.0) for i in range(MAX_WAYPOINTS + 1)]
    with pytest.raises(ValueError, match=f"too many waypoints: {MAX_WAYPOINTS + 1}"):
        validate_waypoints(route)


def test_waypoint_count_at_cap_allowed() -> None:
    validate_waypoints([Point(43.0 + i * 0.001, 5.0) for i in range(MAX_WAYPOINTS)])


def test_route_length_capped() -> None:
    # The 2026-11 audit: 50 waypoints zigzagging between 0 E and 179 E, a
    # 500 000 nm route the land check walked for 8 s, synchronously.
    zigzag = [Point(45.0, 0.0 if i % 2 == 0 else 179.0) for i in range(MAX_WAYPOINTS)]
    with pytest.raises(
        ValueError, match=r"^route too long: \d+ nm along the waypoints \(max 1500 nm\)"
    ):
        validate_waypoints(zigzag)
    # One leg is enough: Marseille to New York.
    with pytest.raises(ValueError, match="route too long"):
        validate_waypoints([MARSEILLE, Point(40.7, -74.0)])


def test_long_european_passages_stay_under_the_cap() -> None:
    # The longest single trips the product is asked for: Brest to Las Palmas
    # by Cape Finisterre (about 1 320 nm), Marseille to Athens through Messina
    # (about 980 nm). Neither may be refused.
    validate_waypoints([Point(48.35, -4.6), Point(43.1, -9.4), Point(28.1, -15.4)])
    validate_waypoints(
        [MARSEILLE, Point(41.0, 9.6), Point(38.2, 15.6), Point(36.8, 22.0), Point(37.9, 23.6)]
    )


def test_route_length_at_cap_allowed() -> None:
    # Due south along a meridian, so the length is exact: a hair under the cap.
    deg = (MAX_ROUTE_NM - 0.01) / EARTH_RADIUS_NM * 180.0 / math.pi
    validate_waypoints([Point(60.0, 0.0), Point(60.0 - deg, 0.0)])
    with pytest.raises(ValueError, match="route too long"):
        validate_waypoints([Point(60.0, 0.0), Point(60.0 - deg - 0.01, 0.0)])


def test_validate_point_accepts_and_rejects() -> None:
    validate_point(43.30, 5.35)
    with pytest.raises(ValueError, match=r"lat=999.0 out of range"):
        validate_point(999.0, 5.35)
    with pytest.raises(ValueError, match=r"lon=999.0 out of range"):
        validate_point(43.30, 999.0)
