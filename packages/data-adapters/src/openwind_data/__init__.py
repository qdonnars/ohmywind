"""OhMyWind domain logic — marine adapters, polars, routing, complexity."""

from openwind_data.adapters.base import (
    ForecastBundle,
    MarineDataAdapter,
    SeaPoint,
    SeaSeries,
    WindPoint,
    WindSeries,
)
from openwind_data.adapters.openmeteo import OpenMeteoAdapter
from openwind_data.routing import (
    BoatPolar,
    ComplexityScore,
    PassageReport,
    Point,
    Segment,
    SegmentReport,
    estimate_passage,
    get_polar,
    list_archetypes,
    score_complexity,
)

__all__ = [
    "BoatPolar",
    "ComplexityScore",
    "ForecastBundle",
    "MarineDataAdapter",
    "OpenMeteoAdapter",
    "PassageReport",
    "Point",
    "SeaPoint",
    "SeaSeries",
    "Segment",
    "SegmentReport",
    "WindPoint",
    "WindSeries",
    "estimate_passage",
    "get_polar",
    "list_archetypes",
    "score_complexity",
]
