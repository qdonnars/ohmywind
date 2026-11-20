# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Repair a drawn route that runs over land, on a fine shoreline (prototype).

The rules:

- a departure or an arrival ashore with open water within ``max_snap_m`` is
  moved there, and the move is said; further inland, the route is refused
  with the distance to the sea;
- an intermediate waypoint ashore is refused outright; the refusal carries
  the route from departure to arrival without it, and the open water nearest
  to it, so the caller can keep a stop it meant;
- a leg between two points at sea that crosses land is retraced at sea by the
  auto-route engine, that leg alone: the rest of the route stays as drawn;
- a leg with no passage at sea, or one more than ``max_ratio`` times its
  straight line, is refused with those facts.

"At sea" for an end of the route means in water connected to the open sea,
that is reached from the edge of a window around the point: a marina basin
the 45 m pixels close, or an enclosed pocket, counts as land. The shoreline
is OSM land plus breakwaters (``FineLand``), no bathymetry.
"""

from __future__ import annotations

import math
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from itertools import pairwise
from pathlib import Path

import numpy as np

from openwind_data.routing.auto_route.engine import RouteParams, _segment_samples, suggest_route
from openwind_data.routing.auto_route.grid import M_PER_DEG_LAT, NavGrid
from openwind_data.routing.geometry import Point, haversine_distance

M_PER_NM = 1852.0


@dataclass(frozen=True)
class _Region:
    """One land grid, packed along rows (row 0 at the south edge)."""

    lat0: float
    lon0: float
    dlat: float
    dlon: float
    n_lat: int
    n_lon: int
    packed: np.ndarray

    def contains(self, p: Point) -> bool:
        r, c = (p.lat - self.lat0) / self.dlat, (p.lon - self.lon0) / self.dlon
        return 0 <= r < self.n_lat and 0 <= c < self.n_lon

    def pixel(self, p: Point) -> tuple[float, float]:
        """Fractional pixel position, integers at the pixel centres (the engine's convention)."""
        # Rounded so a pixel centre the engine returned is an exact integer
        # again, and samples on a pixel edge pick the same pixel as the engine.
        return (
            round((p.lat - self.lat0) / self.dlat - 0.5, 6),
            round((p.lon - self.lon0) / self.dlon - 0.5, 6),
        )

    def centre(self, p: Point) -> Point:
        r, c = (round(x) for x in self.pixel(p))
        return Point(self.lat0 + (r + 0.5) * self.dlat, self.lon0 + (c + 0.5) * self.dlon)

    def land_at(self, r: np.ndarray, c: np.ndarray) -> np.ndarray:
        r = np.clip(np.floor(r + 0.5).astype(np.int64), 0, self.n_lat - 1)
        c = np.clip(np.floor(c + 0.5).astype(np.int64), 0, self.n_lon - 1)
        return ((self.packed[r, c >> 3] >> (7 - (c & 7))) & 1).astype(bool)

    def is_land(self, p: Point) -> bool:
        r, c = self.pixel(p)
        return bool(self.land_at(np.array([r]), np.array([c]))[0])

    def crop(self, center: Sequence[Point], margin_m: float) -> NavGrid:
        """The grid over the points' box widened by ``margin_m``, clipped to the region."""
        mlat = margin_m / M_PER_DEG_LAT
        mlon = mlat * self.dlon / self.dlat  # the pixels are square in metres
        lat_min = min(p.lat for p in center) - mlat
        lat_max = max(p.lat for p in center) + mlat
        lon_min = min(p.lon for p in center) - mlon
        lon_max = max(p.lon for p in center) + mlon
        r0 = max(0, math.floor((lat_min - self.lat0) / self.dlat))
        r1 = min(self.n_lat, math.ceil((lat_max - self.lat0) / self.dlat))
        c0 = max(0, math.floor((lon_min - self.lon0) / self.dlon))
        c1 = min(self.n_lon, math.ceil((lon_max - self.lon0) / self.dlon))
        bits = np.unpackbits(self.packed[r0:r1, c0 >> 3 : (c1 + 7) >> 3], axis=1)
        land = bits[:, c0 & 7 : (c0 & 7) + (c1 - c0)].astype(bool)
        return NavGrid(
            lat0=self.lat0 + r0 * self.dlat,
            lon0=self.lon0 + c0 * self.dlon,
            dlat=self.dlat,
            dlon=self.dlon,
            land=land,
            coast_source="osm",
        )


class FineLand:
    """The fine land grids, one per region; a route is repaired when one region holds it."""

    def __init__(self, regions: Sequence[_Region] = ()) -> None:
        self.regions = list(regions)

    @classmethod
    def from_directory(cls, path: Path | str | None) -> FineLand:
        if not path or not Path(path).is_dir():
            return cls()
        regions = []
        for f in sorted(Path(path).glob("*.npz")):
            with np.load(f) as z:
                if "land" not in z or "meta" not in z:
                    continue
                lat0, lon0, dlat, dlon, n_lat, n_lon = z["meta"].tolist()
                regions.append(_Region(lat0, lon0, dlat, dlon, int(n_lat), int(n_lon), z["land"]))
        return cls(regions)

    @classmethod
    def from_grid(cls, grid: NavGrid) -> FineLand:
        """One region from an unpacked grid (tests)."""
        n_lat, n_lon = grid.shape
        return cls(
            [
                _Region(
                    grid.lat0,
                    grid.lon0,
                    grid.dlat,
                    grid.dlon,
                    n_lat,
                    n_lon,
                    np.packbits(grid.land, axis=1),
                )
            ]
        )

    def region_for(self, points: Sequence[Point]) -> _Region | None:
        return next((g for g in self.regions if all(g.contains(p) for p in points)), None)


@dataclass(frozen=True)
class RepairParams:
    # Furthest a departure or an arrival ashore is moved to the sea (see the
    # bench distribution in the prototype's report).
    max_snap_m: float = 3000.0
    # A retraced leg longer than this many times its straight line is refused.
    max_ratio: float = 3.0
    # Room around a leg's box for its retrace. On the bench's 307 retraced
    # legs the way round never left the box by more than 9.7 km.
    margin_m: float = 12000.0
    route: RouteParams = field(
        default_factory=lambda: RouteParams(use_depth=False, hard_clearance_m=0.0)
    )


@dataclass
class Repair:
    points: list[Point]
    added: list[int] = field(default_factory=list)  # indices of the server's waypoints
    changes: list[str] = field(default_factory=list)
    retraced: list[dict] = field(default_factory=list)  # per leg, for the bench
    refusal: str | None = None
    seconds: float = 0.0


def nearest_sea(region: _Region, p: Point, radius_m: float) -> tuple[Point, float] | None:
    """The open water nearest to ``p`` within ``radius_m`` and its distance in metres.

    ``(p, 0.0)`` when ``p`` is already in water connected to the edge of the
    window; None when the window holds no such water.
    """
    grid = region.crop([p], radius_m)
    water = ~grid.land
    sea = np.zeros_like(water)
    sea[0], sea[-1], sea[:, 0], sea[:, -1] = water[0], water[-1], water[:, 0], water[:, -1]
    while True:  # 4-connected flood from the window's edge
        grown = sea.copy()
        grown[1:] |= sea[:-1]
        grown[:-1] |= sea[1:]
        grown[:, 1:] |= sea[:, :-1]
        grown[:, :-1] |= sea[:, 1:]
        grown &= water
        if grown.sum() == sea.sum():
            break
        sea = grown
    r, c = grid.rc(p.lat, p.lon)
    if grid.inside(r, c) and sea[r, c]:
        return p, 0.0
    rr, cc = np.nonzero(sea)
    if rr.size == 0:
        return None
    k = int(np.argmin((rr - r) ** 2 + (cc - c) ** 2))
    q = Point(*grid.latlon(int(rr[k]), int(cc[k])))
    d = haversine_distance(p, q) * M_PER_NM
    return (q, d) if d <= radius_m else None


def leg_crosses_land(region: _Region, a: Point, b: Point) -> bool:
    """Whether the leg runs over land: two samples in a row on a land pixel.

    Sampled as the engine checks its own shortcuts (every third of a pixel,
    straight in the grid). One sample alone is a leg grazing the corner of a
    pixel by less than 15 m, under what a 45 m grid can tell: the engine
    never draws even that, so the route it returns, rounded by whoever sends
    it back, still passes.
    """
    rs, cs = _segment_samples(region.pixel(a), region.pixel(b))
    hit = region.land_at(rs, cs)
    return bool((hit[1:] & hit[:-1]).any())


def _retrace(region: _Region, a: Point, b: Point, rp: RepairParams) -> list[Point] | None:
    route = suggest_route(region.crop([a, b], rp.margin_m), a, b, params=rp.route)
    if route is None:
        return None
    # The engine runs from the centre of a's pixel to the centre of b's, not
    # from a to b: keep a centre only where the stretch from the exact point
    # would graze a corner of land.
    path = [a, region.centre(a), *route.waypoints[1:-1], region.centre(b), b]
    if not leg_crosses_land(region, a, path[2]):
        path.pop(1)
    if not leg_crosses_land(region, path[-3], b):
        path.pop(-2)
    if any(leg_crosses_land(region, p, q) for p, q in pairwise(path)):
        return None
    return path


def _fmt(p: Point) -> str:
    return f"{p.lat:.4f}, {p.lon:.4f}"


def _length(pts: Sequence[Point]) -> float:
    return sum(haversine_distance(a, b) for a, b in pairwise(pts))


def repair_route(
    fine: FineLand, points: Sequence[Point], rp: RepairParams | None = None
) -> Repair | None:
    """The route at sea, or why not; None when no fine grid holds the route."""
    rp = rp or RepairParams()
    region = fine.region_for(points)
    if region is None:
        return None
    t0 = time.perf_counter()
    pts = list(points)
    out = Repair(points=pts)

    # Intermediate waypoints ashore: strict, the caller decides what it meant.
    inland = [i for i in range(1, len(pts) - 1) if region.is_land(pts[i])]
    if inland:
        parts = []
        for i in inland:
            near = nearest_sea(region, pts[i], 2 * rp.max_snap_m)
            where = (
                f"the nearest open water is at {_fmt(near[0])}, {near[1]:.0f} m away"
                if near
                else f"no open water within {2 * rp.max_snap_m / 1000:g} km"
            )
            parts.append(f"waypoint {i + 1} ({_fmt(pts[i])}) is on land ({where})")
        msg = "This route has a waypoint on land, so no forecast was requested: " + "; ".join(parts)
        rest = repair_route(fine, [p for i, p in enumerate(pts) if i not in inland], rp)
        if rest is not None and rest.refusal is None:
            msg += (
                ". Without it, a route at sea from departure to arrival is: "
                + waypoints_json(rest.points)
                + ". Send that route as waypoints, or move the waypoint to the open water "
                "named above if it is a stop the user wants."
            )
        else:
            msg += ". Move it to open water and call plan_passage again."
        out.refusal = msg
        out.seconds = time.perf_counter() - t0
        return out

    # Departure and arrival: moved to the nearest open water within reach.
    for idx, name in ((0, "departure"), (len(pts) - 1, "arrival")):
        near = nearest_sea(region, pts[idx], 2 * rp.max_snap_m)
        if near is not None and near[1] == 0.0:
            continue
        if near is None or near[1] > rp.max_snap_m:
            far = (
                f"{near[1] / 1000:.1f} km" if near else f"more than {2 * rp.max_snap_m / 1000:g} km"
            )
            out.refusal = (
                f"The {name} ({_fmt(pts[idx])}) is on land, {far} from the sea, so no forecast "
                f"was requested. Place it in the harbour or at sea and call plan_passage again."
            )
            out.seconds = time.perf_counter() - t0
            return out
        out.changes.append(
            f"The {name} was on land: moved {near[1]:.0f} m to the nearest open water, "
            f"{_fmt(near[0])}."
        )
        pts[idx] = near[0]

    # Legs between points at sea: each one that crosses land is retraced alone.
    final = [pts[0]]
    for i, (a, b) in enumerate(pairwise(pts)):
        if not leg_crosses_land(region, a, b):
            final.append(b)
            continue
        t1 = time.perf_counter()
        path = _retrace(region, a, b, rp)
        straight = haversine_distance(a, b)
        new = _length(path) if path else math.inf
        out.retraced.append(
            {
                "leg": i,
                "straight_nm": round(straight, 2),
                "retraced_nm": round(new, 2),
                "seconds": round(time.perf_counter() - t1, 3),
                "a": (a.lat, a.lon),
                "b": (b.lat, b.lon),
                "path": [(p.lat, p.lon) for p in path] if path else None,
            }
        )
        leg = f"leg {i + 1} (waypoint {i + 1} to {i + 2})"
        if path is None or new > rp.max_ratio * straight:
            why = (
                "no passage at sea was found around it"
                if path is None
                else f"the way round at sea is {new:.1f} nm against {straight:.1f} nm in a "
                "straight line"
            )
            out.refusal = (
                f"This route crosses land, so no forecast was requested: {leg} runs over land "
                f"and {why}. Redraw that leg at sea and call plan_passage again."
            )
            out.seconds = time.perf_counter() - t0
            return out
        first = len(final)
        out.added += list(range(first, first + len(path) - 2))
        final += path[1:]
        out.changes.append(
            f"Leg {i + 1} (waypoint {i + 1} to {i + 2}) crossed land: the server retraced it at "
            f"sea, {new:.1f} nm instead of "
            f"{straight:.1f} nm in a straight line, through {len(path) - 2} added waypoints "
            f"(now waypoints {first + 1} to {first + len(path) - 2})."
        )
    out.points = final
    out.seconds = time.perf_counter() - t0
    return out


def waypoints_json(pts: Sequence[Point]) -> str:
    return "[" + ", ".join(f'{{"lat": {p.lat:.5f}, "lon": {p.lon:.5f}}}' for p in pts) + "]"
