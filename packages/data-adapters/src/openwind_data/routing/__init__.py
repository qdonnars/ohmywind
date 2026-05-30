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
    Point,
    Segment,
    bearing,
    haversine_distance,
    interpolate_great_circle,
    midpoint,
    normalize_twa,
    segment_route,
)
from openwind_data.routing.passage import (
    EtaPassagePlan,
    PassageReport,
    SegmentReport,
    _build_conditions_summary,
    best_vmg_upwind,
    estimate_passage,
    estimate_passage_for_arrival,
    estimate_passage_windows,
)

__all__ = [
    "EARTH_RADIUS_NM",
    "BoatPolar",
    "ComplexityScore",
    "EtaPassagePlan",
    "PassageReport",
    "Point",
    "Segment",
    "SegmentReport",
    "_build_conditions_summary",
    "bearing",
    "best_vmg_upwind",
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
]
