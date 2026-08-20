# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Spherical geometry helpers — all distances in nautical miles, angles in degrees.

Earth radius is taken as 3440.065 NM (mean radius 6371.0088 km / 1.852).
For Mediterranean trips (max ~1000 NM), the WGS84 ellipsoid correction is
under 0.5% and is ignored.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from itertools import pairwise

EARTH_RADIUS_NM = 3440.065

# Upper bound on route complexity accepted at the public boundary. Well above
# any realistic hand-drawn coastal route (the web map has no client-side cap),
# but low enough that a hostile caller cannot inflate the corridor sampling
# fan-out. The sweep fan-out is bounded separately by ``MAX_SWEEP_WINDOWS``.
MAX_WAYPOINTS = 50


@dataclass(frozen=True, slots=True)
class Point:
    lat: float
    lon: float


@dataclass(frozen=True, slots=True)
class Segment:
    start: Point
    end: Point
    distance_nm: float
    bearing_deg: float


def validate_waypoints(points: list[Point]) -> None:
    """Reject routes that are out of range, non-finite, or unreasonably long.

    Called at the public boundary (REST handlers and MCP tools) so both shells
    surface the same wording. ``Point`` itself stays unvalidated on purpose:
    the engines build interpolated points internally and must not pay a
    validation cost per sub-segment.

    NaN and infinity are rejected explicitly — plain range comparisons let NaN
    through (every comparison against NaN is false), and it would only surface
    much later as an opaque upstream error.

    Raises:
        ValueError: fewer than 2 points, more than ``MAX_WAYPOINTS``, or any
            coordinate non-finite or outside [-90, 90] / [-180, 180].
    """
    if len(points) < 2:
        raise ValueError("at least 2 waypoints required")
    if len(points) > MAX_WAYPOINTS:
        raise ValueError(f"too many waypoints: {len(points)} (max {MAX_WAYPOINTS})")
    for i, p in enumerate(points):
        if not math.isfinite(p.lat) or not -90.0 <= p.lat <= 90.0:
            raise ValueError(f"waypoint {i}: lat={p.lat} out of range [-90, 90]")
        if not math.isfinite(p.lon) or not -180.0 <= p.lon <= 180.0:
            raise ValueError(f"waypoint {i}: lon={p.lon} out of range [-180, 180]")


def validate_point(lat: float, lon: float) -> None:
    """Single-point variant of ``validate_waypoints`` for forecast endpoints."""
    if not math.isfinite(lat) or not -90.0 <= lat <= 90.0:
        raise ValueError(f"lat={lat} out of range [-90, 90]")
    if not math.isfinite(lon) or not -180.0 <= lon <= 180.0:
        raise ValueError(f"lon={lon} out of range [-180, 180]")


def _angular_distance_rad(a: Point, b: Point) -> float:
    lat1, lon1 = math.radians(a.lat), math.radians(a.lon)
    lat2, lon2 = math.radians(b.lat), math.radians(b.lon)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * math.asin(min(1.0, math.sqrt(h)))


def haversine_distance(a: Point, b: Point) -> float:
    """Great-circle distance in nautical miles."""
    return EARTH_RADIUS_NM * _angular_distance_rad(a, b)


def bearing(a: Point, b: Point) -> float:
    """Initial true bearing from a to b, in degrees [0, 360)."""
    lat1, lon1 = math.radians(a.lat), math.radians(a.lon)
    lat2, lon2 = math.radians(b.lat), math.radians(b.lon)
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def interpolate_great_circle(a: Point, b: Point, fraction: float) -> Point:
    """Spherical linear interpolation along the great circle from a to b.

    fraction=0 returns a, fraction=1 returns b.
    """
    delta = _angular_distance_rad(a, b)
    if delta < 1e-12:
        return a
    lat1, lon1 = math.radians(a.lat), math.radians(a.lon)
    lat2, lon2 = math.radians(b.lat), math.radians(b.lon)
    sin_delta = math.sin(delta)
    a_coef = math.sin((1.0 - fraction) * delta) / sin_delta
    b_coef = math.sin(fraction * delta) / sin_delta
    x = a_coef * math.cos(lat1) * math.cos(lon1) + b_coef * math.cos(lat2) * math.cos(lon2)
    y = a_coef * math.cos(lat1) * math.sin(lon1) + b_coef * math.cos(lat2) * math.sin(lon2)
    z = a_coef * math.sin(lat1) + b_coef * math.sin(lat2)
    lat = math.atan2(z, math.sqrt(x * x + y * y))
    lon = math.atan2(y, x)
    return Point(lat=math.degrees(lat), lon=math.degrees(lon))


def midpoint(a: Point, b: Point) -> Point:
    return interpolate_great_circle(a, b, 0.5)


def normalize_twa(twd: float, course: float) -> float:
    """True wind angle relative to course, in [0, 180].

    V1 ignores tack (port/starboard); polars are symmetric around the wind axis.
    """
    diff = (twd - course + 540.0) % 360.0 - 180.0
    return abs(diff)


def segment_route(waypoints: list[Point], segment_length_nm: float) -> list[Segment]:
    """Split a polyline into segments of approximately segment_length_nm length.

    Each leg between consecutive waypoints is divided into n = max(1, ceil(d/L))
    sub-segments of equal great-circle length d/n. Endpoints exactly hit the
    waypoints (no rounding drift).
    """
    if segment_length_nm <= 0:
        raise ValueError("segment_length_nm must be > 0")
    if len(waypoints) < 2:
        raise ValueError("need at least 2 waypoints")
    segments: list[Segment] = []
    for a, b in pairwise(waypoints):
        d = haversine_distance(a, b)
        n = max(1, math.ceil(d / segment_length_nm))
        for i in range(n):
            f1 = i / n
            f2 = (i + 1) / n
            start = a if i == 0 else interpolate_great_circle(a, b, f1)
            end = b if i == n - 1 else interpolate_great_circle(a, b, f2)
            seg_d = haversine_distance(start, end)
            seg_b = bearing(start, end)
            segments.append(Segment(start=start, end=end, distance_nm=seg_d, bearing_deg=seg_b))
    return segments
