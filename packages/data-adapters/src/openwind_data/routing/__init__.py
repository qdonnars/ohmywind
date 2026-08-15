# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Routing — geometry, polars, and passage time estimation."""

from openwind_data.routing.archetypes import (
    BoatPolar,
    get_polar,
    list_archetypes,
    lookup_polar,
)
from openwind_data.routing.complexity import ComplexityScore, score_complexity
from openwind_data.routing.geometry import (
    EARTH_RADIUS_NM,
    MAX_WAYPOINTS,
    Point,
    Segment,
    bearing,
    haversine_distance,
    interpolate_great_circle,
    midpoint,
    normalize_twa,
    segment_route,
    validate_point,
    validate_waypoints,
)
from openwind_data.routing.passage import (
    EtaPassagePlan,
    NoModelCoveredError,
    PassageReport,
    SegmentReport,
    best_vmg_upwind,
    build_conditions_summary,
    estimate_passage,
    estimate_passage_for_arrival,
    estimate_passage_windows,
)

__all__ = [
    "EARTH_RADIUS_NM",
    "MAX_WAYPOINTS",
    "BoatPolar",
    "ComplexityScore",
    "EtaPassagePlan",
    "NoModelCoveredError",
    "PassageReport",
    "Point",
    "Segment",
    "SegmentReport",
    "bearing",
    "best_vmg_upwind",
    "build_conditions_summary",
    "estimate_passage",
    "estimate_passage_for_arrival",
    "estimate_passage_windows",
    "get_polar",
    "haversine_distance",
    "interpolate_great_circle",
    "list_archetypes",
    "lookup_polar",
    "midpoint",
    "normalize_twa",
    "score_complexity",
    "segment_route",
    "validate_point",
    "validate_waypoints",
]
