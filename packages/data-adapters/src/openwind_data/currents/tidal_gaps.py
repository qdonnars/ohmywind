# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Where tidal currents are probably strong and no fine source is served.

``tidal_gaps.geojson`` next to this module holds two kinds of features,
produced by ``scripts/build_tidal_world_map.py`` from the 2026-09 exploration
(``docs/tidal-world/``): polygons where the current reconstructed from the
MARC ATLNE atlas exceeds 1.5 kt and no atlas at 1 km or finer is served,
and the known passes and races of the European target area that sit in the
same situation, with the spring current the literature publishes for them.

The engine asks :func:`tidal_gap_at` for every leg whose current does not
come from a fine source, and raises one ``currents.tidal_gap`` notice per
passage naming the zones hit. The data is a snapshot: adding an atlas means
regenerating the file, which the map builder does in one command.

numpy only, loaded once, no runtime dependency on the atlases.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources

import numpy as np

# A pass influences the flow around it; at 15 km a leg midpoint sampled on
# a 10 nm segment still lands in the race it crosses.
DEFAULT_PASS_RADIUS_KM = 15.0
_KM_PER_DEG = 111.0


@dataclass(frozen=True, slots=True)
class TidalGap:
    """One hit: the zone's name, the published spring current if known, the kind of feature."""

    zone: str
    max_spring_kt: float | None
    kind: str  # "pass" or "mask"
    distance_km: float


@dataclass(frozen=True, slots=True)
class _Pass:
    name: str
    lat: float
    lon: float
    max_spring_kt: float | None


@dataclass(frozen=True, slots=True)
class _Gaps:
    rings: tuple[tuple[np.ndarray, tuple[np.ndarray, ...]], ...]  # (outer, holes) per polygon
    passes: tuple[_Pass, ...]
    pass_lat: np.ndarray
    pass_lon: np.ndarray


def _polygons(geometry: dict) -> list[list[list[list[float]]]]:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return list(geometry["coordinates"])
    return []


@lru_cache(maxsize=1)
def _load() -> _Gaps:
    text = resources.files("openwind_data.currents").joinpath("tidal_gaps.geojson").read_text()
    fc = json.loads(text)
    rings = []
    passes = []
    for feat in fc["features"]:
        props = feat.get("properties") or {}
        if props.get("kind") == "mask":
            for poly in _polygons(feat["geometry"]):
                outer = np.asarray(poly[0], dtype=float)
                holes = tuple(np.asarray(h, dtype=float) for h in poly[1:])
                rings.append((outer, holes))
        elif props.get("kind") == "pass":
            lon, lat = feat["geometry"]["coordinates"]
            kt = props.get("max_spring_kt")
            passes.append(
                _Pass(str(props["name"]), float(lat), float(lon), None if kt is None else float(kt))
            )
    return _Gaps(
        rings=tuple(rings),
        passes=tuple(passes),
        pass_lat=np.array([p.lat for p in passes], dtype=float),
        pass_lon=np.array([p.lon for p in passes], dtype=float),
    )


def _in_ring(lon: float, lat: float, ring: np.ndarray) -> bool:
    """Ray casting, vectorised over the ring's edges."""
    x = ring[:, 0]
    y = ring[:, 1]
    xj = np.roll(x, 1)
    yj = np.roll(y, 1)
    crosses = (y > lat) != (yj > lat)
    with np.errstate(divide="ignore", invalid="ignore"):
        x_at = (xj - x) * (lat - y) / (yj - y) + x
    return bool(np.count_nonzero(crosses & (lon < x_at)) % 2)


def _in_polygon(lon: float, lat: float, outer: np.ndarray, holes: tuple[np.ndarray, ...]) -> bool:
    return _in_ring(lon, lat, outer) and not any(_in_ring(lon, lat, h) for h in holes)


def tidal_gap_at(
    lat: float, lon: float, *, pass_radius_km: float = DEFAULT_PASS_RADIUS_KM
) -> TidalGap | None:
    """The tidal gap a point falls in, or ``None``.

    A known pass within ``pass_radius_km`` wins over the mask, because it
    carries a name and a published current the notice can quote; the mask
    answers with a generic zone otherwise.
    """
    gaps = _load()
    if gaps.passes:
        d = np.hypot(
            (gaps.pass_lat - lat) * _KM_PER_DEG,
            (gaps.pass_lon - lon) * _KM_PER_DEG * np.cos(np.deg2rad(lat)),
        )
        i = int(np.argmin(d))
        if d[i] <= pass_radius_km:
            p = gaps.passes[i]
            return TidalGap(p.name, p.max_spring_kt, "pass", float(d[i]))
    for outer, holes in gaps.rings:
        if _in_polygon(lon, lat, outer, holes):
            return TidalGap("zone > 1,5 kt", None, "mask", 0.0)
    return None
