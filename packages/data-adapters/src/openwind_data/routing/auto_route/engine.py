# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Propose a route at sea between two points: cost grid, A*, then smoothing.

The steps, all on one :class:`~.grid.NavGrid`:

1. **Cost grid.** Land is forbidden, and so is water closer to land than
   ``hard_clearance_m`` and water shallower than ``draft_m + depth_margin_m``
   when a bathymetry is loaded. Elsewhere a pixel costs 1, plus a penalty
   that grows quadratically as the shore gets closer than ``cape_margin_m``
   (this is the "marge aux caps") and as the depth gets within
   ``shallow_band_m`` of the forbidden depth. Around the departure, the
   arrival and the intent points (``endpoint_radius_m``) only land is
   forbidden and the shore penalty is softened: a harbour is close to land
   and often shallow, which is reported, not avoided.
2. **Search.** A* 8-connected with an octile heuristic, coarse first (a few
   hundred metres) to find a corridor, then at the grid's pitch inside it.
   When no route exists with the depth rule, the search is redone with the
   depth as a penalty only, and the result says so.
3. **Smoothing.** Cost-aware string pulling (a shortcut is taken only when
   it crosses nothing forbidden and costs no more than the stretch it
   replaces), then Douglas-Peucker with the same check, its tolerance grown
   until the route fits ``max_waypoints``.
4. **Report.** Per leg, sampled every few metres: the smallest depth met and
   where, the smallest distance to land, and a data quality: ``fine`` (deep
   water, away from the shore: the resolution does not matter there),
   ``coarse`` (shallow water or close to the shore, where a cell of the
   bathymetry can hide a rock), ``unknown`` (no depth there).

No verdict: the route is a draft, a leg in doubt is flagged, never hidden.
Spike code for issue #540, wired to nothing.
"""

from __future__ import annotations

import heapq
import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from itertools import pairwise

import numpy as np

from openwind_data.routing.auto_route.grid import NavGrid, chamfer_distance
from openwind_data.routing.geometry import Point, haversine_distance

INF = float("inf")
SQ2 = math.sqrt(2.0)
M_PER_NM = 1852.0


@dataclass(frozen=True)
class RouteParams:
    draft_m: float = 1.8
    depth_margin_m: float = 1.0
    cape_margin_m: float = 0.5 * M_PER_NM
    coast_weight: float = 3.0
    hard_clearance_m: float = 60.0
    shallow_band_m: float = 5.0
    shallow_weight: float = 1.0
    endpoint_radius_m: float = 600.0
    max_waypoints: int = 50
    dp_tolerance_m: float = 60.0
    coarse_factor: int = 6
    corridor_m: float = 2500.0
    snap_max_m: float = 2500.0
    use_depth: bool = True
    # Above this depth (metres below chart datum) and this far from the
    # shore, the bathymetry's cell size does not matter for a yacht.
    fine_depth_m: float = 10.0
    # Weighted A*: the heuristic times this factor. 1.0 is the cheapest path;
    # above, far fewer pixels are expanded for a path at most this much dearer,
    # which the smoothing then straightens anyway.
    heuristic_weight: float = 1.0
    # Height of the water above chart datum the route is drawn for (0 = the
    # lowest astronomical tide, the prudent default). A predicted height at
    # the time of passage, from the tide at departure and arrival, turns a
    # channel that dries at LAT into the passage a sailor takes at half tide.
    water_level_m: float = 0.0


@dataclass
class Leg:
    index: int
    length_nm: float
    quality: str  # "fine" | "coarse" | "unknown"
    min_depth_m: float | None  # below chart datum; <= 0 drying or ashore in the bathymetry
    min_depth_at: tuple[float, float] | None
    min_shore_m: float
    below_draft: bool
    reasons: list[str] = field(default_factory=list)


@dataclass
class AutoRoute:
    waypoints: list[Point]
    legs: list[Leg]
    distance_nm: float
    straight_nm: float
    snapped_m: dict[str, float]
    depth_relaxed: bool
    notes: list[str]
    timings_s: dict[str, float]
    raw_path_px: int


# --------------------------------------------------------------------------- #
# cost grid


def cost_grid(
    grid: NavGrid, anchors: Sequence[tuple[int, int]], p: RouteParams, *, depth_block: bool
) -> tuple[np.ndarray, np.ndarray]:
    """``(cost, blocked)``: float32 cost per pixel (inf where forbidden) and the mask."""
    dist = grid.distance_to_land()
    n_lat, n_lon = grid.shape
    near_end = np.zeros(grid.shape, dtype=bool)
    rad = math.ceil(p.endpoint_radius_m / grid.pitch_m)
    rr, cc = np.ogrid[-rad : rad + 1, -rad : rad + 1]
    disk = rr * rr + cc * cc <= rad * rad
    for r, c in anchors:
        r0, r1 = max(0, r - rad), min(n_lat, r + rad + 1)
        c0, c1 = max(0, c - rad), min(n_lon, c + rad + 1)
        near_end[r0:r1, c0:c1] |= disk[r0 - r + rad : r1 - r + rad, c0 - c + rad : c1 - c + rad]

    # The margin is kept from a danger, land or water shallower than the
    # boat needs: a plateau of rocks the shoreline does not draw (Meloine,
    # Sept-Iles) is given the same berth as a cape.
    danger_dist = dist
    shallow = None
    if grid.depth is not None and p.use_depth:
        need = p.draft_m + p.depth_margin_m - p.water_level_m
        known = np.isfinite(grid.depth)
        shallow = known & (grid.depth < need)
        danger_dist = chamfer_distance(grid.land | shallow, grid.pitch_m)
    closeness = np.clip(1.0 - danger_dist / p.cape_margin_m, 0.0, 1.0) ** 2
    weight = np.where(near_end, 0.2 * p.coast_weight, p.coast_weight)
    cost = 1.0 + weight * closeness
    blocked = grid.land | ((dist < p.hard_clearance_m) & ~near_end)
    if shallow is not None and grid.depth is not None:
        depth = grid.depth
        known = np.isfinite(depth)
        band = np.clip(1.0 - (np.where(known, depth, 1e3) - need) / p.shallow_band_m, 0.0, 1.0)
        cost = cost + p.shallow_weight * band
        if depth_block:
            blocked |= (shallow | (danger_dist < p.hard_clearance_m)) & ~near_end
        else:
            # No way round: shallow water costs as much as a long detour, so
            # the route crosses it only where it must, and says so.
            cost = cost + np.where(shallow & ~near_end, 100.0, 0.0)
    cost = np.where(blocked, np.inf, cost).astype(np.float32)
    # A one-pixel frame of forbidden cells spares A* any bounds check.
    cost[0, :] = cost[-1, :] = cost[:, 0] = cost[:, -1] = np.inf
    return cost, np.isinf(cost)


# --------------------------------------------------------------------------- #
# search


def astar(
    cost: np.ndarray, start: tuple[int, int], goal: tuple[int, int], weight: float = 1.0
) -> list[int] | None:
    """Cheapest 8-connected path from ``start`` to ``goal`` as flat indices, or None.

    Step cost is the step length (1 or sqrt 2 pixels) times the mean cost of
    its two ends; a diagonal step may not squeeze between two forbidden
    pixels. The octile heuristic is admissible because no pixel costs < 1.
    """
    n_lat, n_lon = cost.shape
    c = cost.ravel().tolist()
    s = start[0] * n_lon + start[1]
    t = goal[0] * n_lon + goal[1]
    if c[s] == INF or c[t] == INF:
        return None
    gr, gc = goal
    k = SQ2 - 2.0
    wh = weight
    steps = [
        (1, 1.0, 0, 0),
        (-1, 1.0, 0, 0),
        (n_lon, 1.0, 0, 0),
        (-n_lon, 1.0, 0, 0),
        (n_lon + 1, SQ2, n_lon, 1),
        (n_lon - 1, SQ2, n_lon, -1),
        (-n_lon + 1, SQ2, -n_lon, 1),
        (-n_lon - 1, SQ2, -n_lon, -1),
    ]
    g = {s: 0.0}
    parent = {s: -1}
    closed = bytearray(n_lat * n_lon)
    heap = [(0.0, 0.0, s)]
    push, pop = heapq.heappush, heapq.heappop
    while heap:
        _, gu, u = pop(heap)
        if closed[u]:
            continue
        if u == t:
            path = []
            while u != -1:
                path.append(u)
                u = parent[u]
            return path[::-1]
        closed[u] = 1
        cu = c[u]
        for d, w, a, b in steps:
            v = u + d
            cv = c[v]
            if cv == INF or closed[v]:
                continue
            if a and (c[u + a] == INF or c[u + b] == INF):
                continue
            ng = gu + w * 0.5 * (cu + cv)
            if ng < g.get(v, INF):
                g[v] = ng
                parent[v] = u
                vr, vc = divmod(v, n_lon)
                dr, dc = abs(vr - gr), abs(vc - gc)
                h = dr + dc + k * (dr if dr < dc else dc)
                push(heap, (ng + wh * h, ng, v))
    return None


def _block_reduce(cost: np.ndarray, f: int) -> np.ndarray:
    """Coarse cost: mean of a block, forbidden when half the block or more is."""
    n_lat, n_lon = cost.shape
    nr, nc = n_lat // f, n_lon // f
    blk = cost[: nr * f, : nc * f].reshape(nr, f, nc, f)
    finite = ~np.isinf(blk)
    bad = 1.0 - finite.mean(axis=(1, 3))
    m = np.where(finite, blk, 0.0).sum(axis=(1, 3)) / np.maximum(finite.sum(axis=(1, 3)), 1)
    out = np.where(bad >= 0.5, np.inf, m).astype(np.float32)
    out[0, :] = out[-1, :] = out[:, 0] = out[:, -1] = np.inf
    return out


def _nearest_free(cost: np.ndarray, r: int, c: int, max_px: int) -> tuple[int, int] | None:
    n_lat, n_lon = cost.shape
    r0, r1 = max(1, r - max_px), min(n_lat - 1, r + max_px + 1)
    c0, c1 = max(1, c - max_px), min(n_lon - 1, c + max_px + 1)
    win = np.isfinite(cost[r0:r1, c0:c1])
    if not win.any():
        return None
    rr, cc = np.nonzero(win)
    k = int(np.argmin((rr + r0 - r) ** 2 + (cc + c0 - c) ** 2))
    return int(rr[k] + r0), int(cc[k] + c0)


def search(
    cost: np.ndarray, a: tuple[int, int], b: tuple[int, int], p: RouteParams, grid: NavGrid
) -> list[tuple[int, int]] | None:
    """Coarse A* for a corridor, then fine A* inside it (whole grid as a fallback)."""
    f = p.coarse_factor
    n_lat, n_lon = cost.shape
    if f > 1:
        coarse = _block_reduce(cost, f)
        ca = _nearest_free(coarse, a[0] // f, a[1] // f, 6)
        cb = _nearest_free(coarse, b[0] // f, b[1] // f, 6)
        cpath = astar(coarse, ca, cb, p.heuristic_weight) if ca and cb else None
        if cpath is not None:
            corridor = np.zeros(coarse.shape, dtype=bool)
            ncl = coarse.shape[1]
            for i in cpath:
                corridor[i // ncl, i % ncl] = True
            grow = math.ceil(p.corridor_m / (grid.pitch_m * f))
            for _ in range(grow):
                g2 = corridor.copy()
                g2[1:] |= corridor[:-1]
                g2[:-1] |= corridor[1:]
                g2[:, 1:] |= corridor[:, :-1]
                g2[:, :-1] |= corridor[:, 1:]
                corridor = g2
            full = np.zeros((n_lat, n_lon), dtype=bool)
            full[: coarse.shape[0] * f, : coarse.shape[1] * f] = np.repeat(
                np.repeat(corridor, f, axis=0), f, axis=1
            )
            # The endpoints' own neighbourhoods always count as corridor.
            for r, c in (a, b):
                rad = 2 * f
                full[max(0, r - rad) : r + rad + 1, max(0, c - rad) : c + rad + 1] = True
            # Search only the corridor's bounding box: A* copies its cost
            # grid into a Python list, the crop is what keeps that small.
            rows = np.flatnonzero(full.any(axis=1))
            cols = np.flatnonzero(full.any(axis=0))
            r0, r1 = max(0, rows[0] - 1), min(n_lat, rows[-1] + 2)
            c0, c1 = max(0, cols[0] - 1), min(n_lon, cols[-1] + 2)
            sub = np.where(full[r0:r1, c0:c1], cost[r0:r1, c0:c1], np.inf).astype(np.float32)
            sub[0, :] = sub[-1, :] = sub[:, 0] = sub[:, -1] = np.inf
            path = astar(sub, (a[0] - r0, a[1] - c0), (b[0] - r0, b[1] - c0), p.heuristic_weight)
            if path is not None:
                w = c1 - c0
                return [(i // w + r0, i % w + c0) for i in path]
    path = astar(cost, a, b, p.heuristic_weight)
    if path is None:
        return None
    return [divmod(i, n_lon) for i in path]


# --------------------------------------------------------------------------- #
# smoothing


def _segment_samples(p0: tuple[float, float], p1: tuple[float, float], step: float = 0.33):
    dr, dc = p1[0] - p0[0], p1[1] - p0[1]
    n = max(2, math.ceil(math.hypot(dr, dc) / step) + 1)
    t = np.linspace(0.0, 1.0, n)
    return p0[0] + t * dr, p0[1] + t * dc


def _segment_cost(cost: np.ndarray, p0, p1) -> float:
    """Integrated cost of the straight segment between two pixel centres, inf if it hits a wall."""
    rs, cs = _segment_samples(p0, p1)
    # floor(x + 0.5), not rint: rint rounds a sample on a pixel edge to the
    # even side, so the pixel it picks would depend on the grid's offset.
    vals = cost[np.floor(rs + 0.5).astype(np.int64), np.floor(cs + 0.5).astype(np.int64)]
    if np.isinf(vals).any():
        return INF
    return float(vals.mean()) * math.hypot(p1[0] - p0[0], p1[1] - p0[1])


def _path_cumcost(cost: np.ndarray, pts: list[tuple[int, int]]) -> np.ndarray:
    out = np.zeros(len(pts))
    for k in range(1, len(pts)):
        (r0, c0), (r1, c1) = pts[k - 1], pts[k]
        out[k] = out[k - 1] + math.hypot(r1 - r0, c1 - c0) * 0.5 * (
            float(cost[r0, c0]) + float(cost[r1, c1])
        )
    return out


def string_pull(cost: np.ndarray, pts: list[tuple[int, int]], tol: float = 0.01) -> list[int]:
    """Indices of ``pts`` kept by greedy line-of-sight shortcuts that do not cost more."""
    cum = _path_cumcost(cost, pts)
    n = len(pts)
    keep = [0]
    i = 0

    def ok(i: int, j: int) -> bool:
        sc = _segment_cost(cost, pts[i], pts[j])
        return sc <= (cum[j] - cum[i]) * (1.0 + tol) + 1e-9

    while i < n - 1:
        lo, step = i + 1, 1
        while lo + step < n and ok(i, lo + step):
            lo += step
            step *= 2
        hi = min(n - 1, lo + step)
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if ok(i, mid):
                lo = mid
            else:
                hi = mid
        if hi != lo and ok(i, hi):
            lo = hi
        keep.append(lo)
        i = lo
    return keep


def douglas_peucker(cost: np.ndarray, pts: list[tuple[float, float]], eps_px: float, tol: float):
    """Douglas-Peucker where a span is replaced only by a collision-free, no-dearer segment."""
    cum = _path_cumcost(cost, [(int(r), int(c)) for r, c in pts])
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        p0, p1 = np.array(pts[i]), np.array(pts[j])
        seg = p1 - p0
        seg_len = float(np.hypot(*seg)) or 1e-9
        mid = np.array(pts[i + 1 : j])
        dev = np.abs(seg[0] * (mid[:, 1] - p0[1]) - seg[1] * (mid[:, 0] - p0[0])) / seg_len
        k = int(np.argmax(dev)) + i + 1
        sc = _segment_cost(cost, pts[i], pts[j])
        if dev.max() > eps_px or sc > (cum[j] - cum[i]) * (1.0 + tol) + 1e-9:
            keep[k] = True
            stack += [(i, k), (k, j)]
    return [pt for pt, kp in zip(pts, keep, strict=True) if kp]


# --------------------------------------------------------------------------- #
# report


def leg_report(
    grid: NavGrid, a: Point, b: Point, index: int, p: RouteParams, anchors: Sequence[Point] = ()
) -> Leg:
    length_m = haversine_distance(a, b) * M_PER_NM
    n = max(3, math.ceil(length_m / (grid.pitch_m / 3)))
    t = np.linspace(0.0, 1.0, n)
    lats = a.lat + t * (b.lat - a.lat)
    lons = a.lon + t * (b.lon - a.lon)
    r, c = grid.rc_float(lats, lons)
    r = np.clip(np.floor(r).astype(np.int64), 0, grid.shape[0] - 1)
    c = np.clip(np.floor(c).astype(np.int64), 0, grid.shape[1] - 1)
    shore = grid.distance_to_land()[r, c]
    min_shore = float(shore.min())
    reasons: list[str] = []
    quality = "fine"
    min_depth = None
    at = None
    below = False
    if grid.depth is None:
        quality = "unknown"
        reasons.append("pas de bathymetrie")
    else:
        dep = grid.depth[r, c].astype(np.float64)
        # In the approaches of a harbour or an anchorage the 115 m cells mix
        # quay and water: their depths say nothing. Left out of the minimum,
        # said in the reasons.
        in_port = np.zeros(n, dtype=bool)
        for q in anchors:
            dy = (lats - q.lat) * 111_195.0
            dx = (lons - q.lon) * 111_195.0 * math.cos(math.radians(q.lat))
            in_port |= dx * dx + dy * dy < p.endpoint_radius_m**2
        if in_port.any():
            reasons.append("abords du port : sondes non significatives, ignorees")
            dep[in_port] = np.inf
        if in_port.all():
            dep[:] = np.nan
        if np.isnan(dep).mean() > 0.0 and not in_port.all():
            quality = "unknown"
            reasons.append(f"profondeur inconnue sur {np.isnan(dep).mean():.0%} du troncon")
        if np.isfinite(dep).any():
            k = int(np.nanargmin(np.where(np.isfinite(dep), dep, np.nan)))
            min_depth = round(float(dep[k]), 1)
            at = (round(float(lats[k]), 5), round(float(lons[k]), 5))
            below = min_depth + p.water_level_m < p.draft_m + p.depth_margin_m
            if min_depth < p.fine_depth_m and quality == "fine":
                quality = "coarse"
                reasons.append(f"petits fonds (min {min_depth:.1f} m)")
            if below:
                reasons.append(
                    f"sonde + hauteur d'eau ({p.water_level_m:.1f} m) sous tirant d'eau + marge "
                    f"({p.draft_m + p.depth_margin_m:.1f} m)"
                )
            # Water for the shoreline, dry for the bathymetry over most of the
            # leg: a river or a basin the bathymetry does not resolve.
            usable = np.isfinite(dep)
            dry = float((dep[usable] <= 0.0).mean()) if usable.any() else 0.0
            if dry > 0.5:
                quality = "unknown"
                reasons.append(f"la bathymetrie voit terre ou estran sur {dry:.0%} du troncon")
    near = 2 * (grid.depth_pitch_m or 115.0)
    if min_shore < near and quality == "fine":
        quality = "coarse"
    if min_shore < near:
        reasons.append(f"a {min_shore:.0f} m de la cote")
    return Leg(
        index=index,
        length_nm=round(length_m / M_PER_NM, 2),
        quality=quality,
        min_depth_m=min_depth,
        min_depth_at=at,
        min_shore_m=round(min_shore),
        below_draft=below,
        reasons=reasons,
    )


# --------------------------------------------------------------------------- #
# entry point


def suggest_route(
    grid: NavGrid,
    start: Point,
    end: Point,
    via: Sequence[Point] = (),
    params: RouteParams | None = None,
) -> AutoRoute | None:
    """A draft route from ``start`` to ``end`` through the intent points ``via``, or None."""
    import time

    p = params or RouteParams()
    t0 = time.perf_counter()
    anchors_pt = [start, *via, end]
    anchors = [grid.rc(q.lat, q.lon) for q in anchors_pt]
    grid.distance_to_land()
    t_dist = time.perf_counter() - t0
    notes: list[str] = []
    depth_relaxed = False
    cost, _ = cost_grid(grid, anchors, p, depth_block=True)
    snapped: dict[str, float] = {}
    snapped_anchors = []
    max_px = int(p.snap_max_m / grid.pitch_m)
    for name, (r, cc) in zip(
        ["depart", *[f"via{i + 1}" for i in range(len(via))], "arrivee"], anchors, strict=True
    ):
        q = _nearest_free(cost, r, cc, max_px)
        if q is None:
            notes.append(f"{name}: aucune eau navigable a moins de {p.snap_max_m:.0f} m")
            return None
        if q != (r, cc):
            snapped[name] = round(math.hypot(q[0] - r, q[1] - cc) * grid.pitch_m)
        snapped_anchors.append(q)
    t1 = time.perf_counter()

    pixels: list[tuple[int, int]] = []
    segments: list[list[tuple[int, int]]] = []
    for a, b in pairwise(snapped_anchors):
        seg = search(cost, a, b, p, grid)
        if seg is None and grid.depth is not None and p.use_depth:
            depth_relaxed = True
            cost_r, _ = cost_grid(grid, anchors, p, depth_block=False)
            seg = search(cost_r, a, b, p, grid)
            if seg is not None:
                notes.append(
                    "aucune route avec la regle de profondeur : fonds trop faibles franchis, "
                    "signales par troncon"
                )
        if seg is None:
            notes.append("aucune route en mer trouvee")
            return None
        segments.append(seg)
        pixels.extend(seg if not pixels else seg[1:])
    t2 = time.perf_counter()

    if depth_relaxed:
        cost, _ = cost_grid(grid, anchors, p, depth_block=False)
    smooth: list[tuple[float, float]] = []
    for seg in segments:
        keep = string_pull(cost, seg)
        pts = [(float(seg[k][0]), float(seg[k][1])) for k in keep]
        smooth.extend(pts if not smooth else pts[1:])
    # Douglas-Peucker per anchor-to-anchor span so intent points stay.
    anchor_idx = [0]
    for a in snapped_anchors[1:-1]:
        anchor_idx.append(smooth.index((float(a[0]), float(a[1]))))
    anchor_idx.append(len(smooth) - 1)
    eps = p.dp_tolerance_m / grid.pitch_m
    while True:
        out: list[tuple[float, float]] = []
        for i, j in pairwise(anchor_idx):
            part = douglas_peucker(cost, smooth[i : j + 1], eps, 0.02)
            out.extend(part if not out else part[1:])
        if len(out) <= p.max_waypoints or eps > 5000 / grid.pitch_m:
            break
        eps *= 1.5
    if len(out) > p.max_waypoints:
        notes.append(f"{len(out)} points, au-dela du plafond de {p.max_waypoints}")
    t3 = time.perf_counter()

    wps = [Point(*grid.latlon(r, c)) for r, c in out]
    legs = [leg_report(grid, a, b, i, p, anchors_pt) for i, (a, b) in enumerate(pairwise(wps))]
    dist = sum(haversine_distance(a, b) for a, b in pairwise(wps))
    straight = sum(haversine_distance(a, b) for a, b in pairwise(anchors_pt))
    t4 = time.perf_counter()
    return AutoRoute(
        waypoints=wps,
        legs=legs,
        distance_nm=round(dist, 2),
        straight_nm=round(straight, 2),
        snapped_m=snapped,
        depth_relaxed=depth_relaxed,
        notes=notes,
        timings_s={
            "distance_to_land": round(t_dist, 3),
            "cost_grid": round(t1 - t0 - t_dist, 3),
            "search": round(t2 - t1, 3),
            "smoothing": round(t3 - t2, 3),
            "report": round(t4 - t3, 3),
            "total": round(t4 - t0, 3),
        },
        raw_path_px=len(pixels),
    )
