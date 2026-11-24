// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * A route at sea between two points of a land grid: cost grid, A*, then
 * smoothing. The TypeScript twin of
 * `openwind_data.routing.auto_route.engine`, for the one use the app has of
 * it: retracing a leg that crosses land (no bathymetry, no hard clearance).
 *
 * It must return the route the server returns. So every step is the Python
 * step, in its order, with its rounding: single precision where numpy holds
 * a float32 (`Math.fround`), sums in the order Python adds them, ties broken
 * as Python breaks them. A corpus of routes computed by the server guards
 * that (`tests/route-repair-parity.test.ts`); change one side and the other's test
 * fails.
 */

import { colOf, latOf, lonOf, rowOf } from "./lattice";

export interface LatLon {
  lat: number;
  lon: number;
}

/** A window of the world lattice, each cell `factor` pixels a side
    (`MercatorGrid` on the server). `land` is row-major, row 0 at the south. */
export interface Grid {
  nLat: number;
  nLon: number;
  land: Uint8Array;
  row0: number;
  col0: number;
  factor: number;
  /** Side of a cell in metres at the window's middle latitude. */
  pitch: number;
}

const SQ2 = Math.sqrt(2);
const M_PER_NM = 1852;

// `RouteParams` as the repair sets them (`RepairParams.route`).
const CAPE_MARGIN_M = 0.5 * M_PER_NM;
const COAST_WEIGHT = 3.0;
const ENDPOINT_RADIUS_M = 600.0;
const MAX_WAYPOINTS = 50;
const DP_TOLERANCE_M = 60.0;
const COARSE_FACTOR = 6;
const CORRIDOR_M = 2500.0;
const SNAP_MAX_M = 2500.0;

type Cell = [number, number];

export function cellOf(grid: Grid, p: LatLon): Cell {
  return [
    Math.floor((rowOf(p.lat) - grid.row0) / grid.factor),
    Math.floor((colOf(p.lon) - grid.col0) / grid.factor),
  ];
}

/** Centre of cell (r, c). */
export function cellCentre(grid: Grid, r: number, c: number): LatLon {
  return {
    lat: latOf(grid.row0 + (r + 0.5) * grid.factor),
    lon: lonOf(grid.col0 + (c + 0.5) * grid.factor),
  };
}

function hypot(dr: number, dc: number): number {
  return Math.sqrt(dr * dr + dc * dc);
}

/** Metres from each cell to the nearest land cell: the two-pass chamfer of
    `grid.chamfer_distance`, in double precision, stored in single. */
function chamferDistance(mask: Uint8Array, nLat: number, nLon: number, pitch: number): Float32Array {
  const d = new Float64Array(nLat * nLon);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0.0 : 1e9;
  const row = new Float64Array(nLon);
  const fwd = new Float64Array(nLon);
  for (let pass = 0; pass < 2; pass++) {
    let prev = -1;
    for (let n = 0; n < nLat; n++) {
      const i = pass === 0 ? n : nLat - 1 - n;
      const base = i * nLon;
      if (prev < 0) {
        for (let j = 0; j < nLon; j++) row[j] = d[base + j];
      } else {
        const pb = prev * nLon;
        for (let j = 0; j < nLon; j++) {
          let v = d[base + j];
          const straight = d[pb + j] + 1.0;
          if (straight < v) v = straight;
          if (j >= 1) {
            const diagonal = d[pb + j - 1] + SQ2;
            if (diagonal < v) v = diagonal;
          }
          if (j <= nLon - 2) {
            const diagonal = d[pb + j + 1] + SQ2;
            if (diagonal < v) v = diagonal;
          }
          row[j] = v;
        }
      }
      let m = Infinity;
      for (let j = 0; j < nLon; j++) {
        const t = row[j] - j;
        if (t < m) m = t;
        fwd[j] = m + j;
      }
      m = Infinity;
      for (let j = nLon - 1; j >= 0; j--) {
        const t = row[j] + j;
        if (t < m) m = t;
        const bwd = m - j;
        d[base + j] = fwd[j] < bwd ? fwd[j] : bwd;
      }
      prev = i;
    }
  }
  const out = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = d[i] * pitch;
  return out;
}

/** Cost per cell, infinite on land and on the frame. */
function costGrid(grid: Grid, anchors: Cell[]): Float32Array {
  const { nLat, nLon, land, pitch } = grid;
  const dist = chamferDistance(land, nLat, nLon, pitch);
  const nearEnd = new Uint8Array(nLat * nLon);
  const rad = Math.ceil(ENDPOINT_RADIUS_M / pitch);
  for (const [r, c] of anchors) {
    const r0 = Math.max(0, r - rad);
    const r1 = Math.min(nLat, r + rad + 1);
    const c0 = Math.max(0, c - rad);
    const c1 = Math.min(nLon, c + rad + 1);
    for (let rr = r0; rr < r1; rr++) {
      for (let cc = c0; cc < c1; cc++) {
        if ((rr - r) * (rr - r) + (cc - c) * (cc - c) <= rad * rad) nearEnd[rr * nLon + cc] = 1;
      }
    }
  }
  const nearWeight = 0.2 * COAST_WEIGHT;
  const cost = new Float32Array(nLat * nLon);
  for (let i = 0; i < cost.length; i++) {
    if (land[i]) {
      cost[i] = Infinity;
      continue;
    }
    let closeness = Math.fround(1.0 - Math.fround(dist[i] / CAPE_MARGIN_M));
    closeness = closeness < 0 ? 0 : closeness > 1 ? 1 : closeness;
    closeness = Math.fround(closeness * closeness);
    cost[i] = 1.0 + (nearEnd[i] ? nearWeight : COAST_WEIGHT) * closeness;
  }
  frame(cost, nLat, nLon);
  return cost;
}

function frame(cost: Float32Array, nLat: number, nLon: number): void {
  for (let c = 0; c < nLon; c++) {
    cost[c] = Infinity;
    cost[(nLat - 1) * nLon + c] = Infinity;
  }
  for (let r = 0; r < nLat; r++) {
    cost[r * nLon] = Infinity;
    cost[r * nLon + nLon - 1] = Infinity;
  }
}

/** A binary heap of (f, g, node), ordered as Python orders the tuples. */
class Heap {
  private f = new Float64Array(1024);
  private g = new Float64Array(1024);
  private v = new Int32Array(1024);
  size = 0;
  topG = 0;
  topV = 0;

  private less(i: number, j: number): boolean {
    if (this.f[i] !== this.f[j]) return this.f[i] < this.f[j];
    if (this.g[i] !== this.g[j]) return this.g[i] < this.g[j];
    return this.v[i] < this.v[j];
  }

  private swap(i: number, j: number): void {
    const f = this.f[i];
    const g = this.g[i];
    const v = this.v[i];
    this.f[i] = this.f[j];
    this.g[i] = this.g[j];
    this.v[i] = this.v[j];
    this.f[j] = f;
    this.g[j] = g;
    this.v[j] = v;
  }

  push(f: number, g: number, v: number): void {
    if (this.size === this.f.length) {
      const grow = <T extends Float64Array | Int32Array>(a: T): T => {
        const b = new (a.constructor as new (n: number) => T)(a.length * 2);
        b.set(a);
        return b;
      };
      this.f = grow(this.f);
      this.g = grow(this.g);
      this.v = grow(this.v);
    }
    let i = this.size++;
    this.f[i] = f;
    this.g[i] = g;
    this.v[i] = v;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Remove the smallest entry; its g and node are left in `topG`, `topV`. */
  pop(): void {
    this.topG = this.g[0];
    this.topV = this.v[0];
    const last = --this.size;
    if (last === 0) return;
    this.f[0] = this.f[last];
    this.g[0] = this.g[last];
    this.v[0] = this.v[last];
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let least = i;
      if (left < last && this.less(left, least)) least = left;
      if (right < last && this.less(right, least)) least = right;
      if (least === i) break;
      this.swap(i, least);
      i = least;
    }
  }
}

/**
 * Cheapest 8-connected path from `start` to `goal` as flat indices, or null.
 * Step cost is the step length times the mean cost of its two ends; a
 * diagonal step may not squeeze between two forbidden cells.
 */
function astar(cost: Float32Array, nLat: number, nLon: number, start: Cell, goal: Cell): number[] | null {
  const s = start[0] * nLon + start[1];
  const t = goal[0] * nLon + goal[1];
  if (cost[s] === Infinity || cost[t] === Infinity) return null;
  const gr = goal[0];
  const gc = goal[1];
  const k = SQ2 - 2.0;
  const stepD = [1, -1, nLon, -nLon, nLon + 1, nLon - 1, -nLon + 1, -nLon - 1];
  const stepW = [1.0, 1.0, 1.0, 1.0, SQ2, SQ2, SQ2, SQ2];
  const stepA = [0, 0, 0, 0, nLon, nLon, -nLon, -nLon];
  const stepB = [0, 0, 0, 0, 1, -1, 1, -1];
  const g = new Float64Array(nLat * nLon).fill(Infinity);
  const parent = new Int32Array(nLat * nLon).fill(-1);
  const closed = new Uint8Array(nLat * nLon);
  const heap = new Heap();
  g[s] = 0.0;
  heap.push(0.0, 0.0, s);
  while (heap.size > 0) {
    heap.pop();
    const gu = heap.topG;
    let u = heap.topV;
    if (closed[u]) continue;
    if (u === t) {
      const path: number[] = [];
      while (u !== -1) {
        path.push(u);
        u = parent[u];
      }
      return path.reverse();
    }
    closed[u] = 1;
    const cu = cost[u];
    for (let i = 0; i < 8; i++) {
      const v = u + stepD[i];
      const cv = cost[v];
      if (cv === Infinity || closed[v]) continue;
      if (stepA[i] !== 0 && (cost[u + stepA[i]] === Infinity || cost[u + stepB[i]] === Infinity)) {
        continue;
      }
      const ng = gu + stepW[i] * 0.5 * (cu + cv);
      if (ng < g[v]) {
        g[v] = ng;
        parent[v] = u;
        const dr = Math.abs(Math.floor(v / nLon) - gr);
        const dc = Math.abs((v % nLon) - gc);
        const h = dr + dc + k * (dr < dc ? dr : dc);
        heap.push(ng + 1.0 * h, ng, v);
      }
    }
  }
  return null;
}

/** Coarse cost: mean of a block, forbidden when half the block or more is. */
function blockReduce(
  cost: Float32Array,
  nLat: number,
  nLon: number,
  f: number,
): { coarse: Float32Array; nr: number; nc: number } {
  const nr = Math.floor(nLat / f);
  const nc = Math.floor(nLon / f);
  const coarse = new Float32Array(nr * nc);
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) {
      let total = 0.0;
      let count = 0;
      for (let i = 0; i < f; i++) {
        const base = (r * f + i) * nLon + c * f;
        for (let j = 0; j < f; j++) {
          const v = cost[base + j];
          if (v !== Infinity) {
            total += v;
            count++;
          }
        }
      }
      const bad = 1.0 - count / (f * f);
      coarse[r * nc + c] = bad >= 0.5 ? Infinity : total / Math.max(count, 1);
    }
  }
  frame(coarse, nr, nc);
  return { coarse, nr, nc };
}

function nearestFree(
  cost: Float32Array,
  nLat: number,
  nLon: number,
  r: number,
  c: number,
  maxPx: number,
): Cell | null {
  const r0 = Math.max(1, r - maxPx);
  const r1 = Math.min(nLat - 1, r + maxPx + 1);
  const c0 = Math.max(1, c - maxPx);
  const c1 = Math.min(nLon - 1, c + maxPx + 1);
  let best: Cell | null = null;
  let bestD = Infinity;
  for (let rr = r0; rr < r1; rr++) {
    for (let cc = c0; cc < c1; cc++) {
      if (cost[rr * nLon + cc] === Infinity) continue;
      const d = (rr - r) * (rr - r) + (cc - c) * (cc - c);
      if (d < bestD) {
        bestD = d;
        best = [rr, cc];
      }
    }
  }
  return best;
}

/** Coarse A* for a corridor, then fine A* inside it (whole grid as a fallback). */
function search(cost: Float32Array, grid: Grid, a: Cell, b: Cell): Cell[] | null {
  const { nLat, nLon } = grid;
  const f = COARSE_FACTOR;
  const { coarse, nr, nc } = blockReduce(cost, nLat, nLon, f);
  const ca = nearestFree(coarse, nr, nc, Math.floor(a[0] / f), Math.floor(a[1] / f), 6);
  const cb = nearestFree(coarse, nr, nc, Math.floor(b[0] / f), Math.floor(b[1] / f), 6);
  const coarsePath = ca && cb ? astar(coarse, nr, nc, ca, cb) : null;
  if (coarsePath !== null) {
    let corridor = new Uint8Array(nr * nc);
    for (const i of coarsePath) corridor[i] = 1;
    const grow = Math.ceil(CORRIDOR_M / (grid.pitch * f));
    for (let n = 0; n < grow; n++) {
      const grown = corridor.slice();
      for (let r = 0; r < nr; r++) {
        for (let c = 0; c < nc; c++) {
          if (!corridor[r * nc + c]) continue;
          if (r + 1 < nr) grown[(r + 1) * nc + c] = 1;
          if (r >= 1) grown[(r - 1) * nc + c] = 1;
          if (c + 1 < nc) grown[r * nc + c + 1] = 1;
          if (c >= 1) grown[r * nc + c - 1] = 1;
        }
      }
      corridor = grown;
    }
    const full = new Uint8Array(nLat * nLon);
    for (let r = 0; r < nr * f; r++) {
      const cr = Math.floor(r / f) * nc;
      for (let c = 0; c < nc * f; c++) full[r * nLon + c] = corridor[cr + Math.floor(c / f)];
    }
    // The endpoints' own neighbourhoods always count as corridor.
    for (const [r, c] of [a, b]) {
      const rad = 2 * f;
      for (let rr = Math.max(0, r - rad); rr < Math.min(nLat, r + rad + 1); rr++) {
        full.fill(1, rr * nLon + Math.max(0, c - rad), rr * nLon + Math.min(nLon, c + rad + 1));
      }
    }
    let rFirst = nLat;
    let rLast = -1;
    let cFirst = nLon;
    let cLast = -1;
    for (let r = 0; r < nLat; r++) {
      for (let c = 0; c < nLon; c++) {
        if (!full[r * nLon + c]) continue;
        if (r < rFirst) rFirst = r;
        if (r > rLast) rLast = r;
        if (c < cFirst) cFirst = c;
        if (c > cLast) cLast = c;
      }
    }
    const r0 = Math.max(0, rFirst - 1);
    const r1 = Math.min(nLat, rLast + 2);
    const c0 = Math.max(0, cFirst - 1);
    const c1 = Math.min(nLon, cLast + 2);
    const w = c1 - c0;
    const sub = new Float32Array((r1 - r0) * w);
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        sub[(r - r0) * w + c - c0] = full[r * nLon + c] ? cost[r * nLon + c] : Infinity;
      }
    }
    frame(sub, r1 - r0, w);
    const path = astar(sub, r1 - r0, w, [a[0] - r0, a[1] - c0], [b[0] - r0, b[1] - c0]);
    if (path !== null) return path.map((i) => [Math.floor(i / w) + r0, (i % w) + c0]);
  }
  const path = astar(cost, nLat, nLon, a, b);
  if (path === null) return null;
  return path.map((i) => [Math.floor(i / nLon), i % nLon]);
}

/** Positions sampled along the straight segment between two cell positions,
    every third of a cell: `[rows, cols]`. */
export function segmentSamples(
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): [Float64Array, Float64Array] {
  const dr = r1 - r0;
  const dc = c1 - c0;
  const n = Math.max(2, Math.ceil(hypot(dr, dc) / 0.33) + 1);
  const step = 1.0 / (n - 1);
  const rs = new Float64Array(n);
  const cs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i === n - 1 ? 1.0 : i * step;
    rs[i] = r0 + t * dr;
    cs[i] = c0 + t * dc;
  }
  return [rs, cs];
}

/** Integrated cost of the straight segment between two cell centres,
    infinite if it hits a wall. */
function segmentCost(cost: Float32Array, nLon: number, p0: Cell, p1: Cell): number {
  const [rs, cs] = segmentSamples(p0[0], p0[1], p1[0], p1[1]);
  let total = 0.0;
  let wall = false;
  for (let i = 0; i < rs.length; i++) {
    const v = cost[Math.floor(rs[i] + 0.5) * nLon + Math.floor(cs[i] + 0.5)];
    if (v === Infinity) wall = true;
    total += v;
  }
  if (wall) return Infinity;
  return (total / rs.length) * hypot(p1[0] - p0[0], p1[1] - p0[1]);
}

function pathCumcost(cost: Float32Array, nLon: number, pts: Cell[]): Float64Array {
  const out = new Float64Array(pts.length);
  for (let k = 1; k < pts.length; k++) {
    const [r0, c0] = pts[k - 1];
    const [r1, c1] = pts[k];
    out[k] =
      out[k - 1] + hypot(r1 - r0, c1 - c0) * 0.5 * (cost[r0 * nLon + c0] + cost[r1 * nLon + c1]);
  }
  return out;
}

/** Indices of `pts` kept by greedy line-of-sight shortcuts that do not cost more. */
function stringPull(cost: Float32Array, nLon: number, pts: Cell[]): number[] {
  const tol = 0.01;
  const cum = pathCumcost(cost, nLon, pts);
  const n = pts.length;
  const keep = [0];
  const ok = (i: number, j: number): boolean =>
    segmentCost(cost, nLon, pts[i], pts[j]) <= (cum[j] - cum[i]) * (1.0 + tol) + 1e-9;
  let i = 0;
  while (i < n - 1) {
    let lo = i + 1;
    let step = 1;
    while (lo + step < n && ok(i, lo + step)) {
      lo += step;
      step *= 2;
    }
    let hi = Math.min(n - 1, lo + step);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (ok(i, mid)) lo = mid;
      else hi = mid;
    }
    if (hi !== lo && ok(i, hi)) lo = hi;
    keep.push(lo);
    i = lo;
  }
  return keep;
}

/** Douglas-Peucker where a span is replaced only by a collision-free,
    no-dearer segment. */
function douglasPeucker(cost: Float32Array, nLon: number, pts: Cell[], epsPx: number): Cell[] {
  const tol = 0.02;
  const cum = pathCumcost(cost, nLon, pts);
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Cell[] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [i, j] = stack.pop() as Cell;
    if (j <= i + 1) continue;
    const seg0 = pts[j][0] - pts[i][0];
    const seg1 = pts[j][1] - pts[i][1];
    const segLen = hypot(seg0, seg1) || 1e-9;
    let k = i + 1;
    let devMax = -Infinity;
    for (let m = i + 1; m < j; m++) {
      const dev =
        Math.abs(seg0 * (pts[m][1] - pts[i][1]) - seg1 * (pts[m][0] - pts[i][0])) / segLen;
      if (dev > devMax) {
        devMax = dev;
        k = m;
      }
    }
    const sc = segmentCost(cost, nLon, pts[i], pts[j]);
    if (devMax > epsPx || sc > (cum[j] - cum[i]) * (1.0 + tol) + 1e-9) {
      keep[k] = 1;
      stack.push([i, k], [k, j]);
    }
  }
  return pts.filter((_, m) => keep[m] === 1);
}

/** A route at sea from `start` to `end` on `grid`, as waypoints at cell
    centres, or null when there is none. */
export function suggestRoute(grid: Grid, start: LatLon, end: LatLon): LatLon[] | null {
  const anchors = [cellOf(grid, start), cellOf(grid, end)];
  const cost = costGrid(grid, anchors);
  const maxPx = Math.trunc(SNAP_MAX_M / grid.pitch);
  const snapped: Cell[] = [];
  for (const [r, c] of anchors) {
    const q = nearestFree(cost, grid.nLat, grid.nLon, r, c, maxPx);
    if (q === null) return null;
    snapped.push(q);
  }
  const cells = search(cost, grid, snapped[0], snapped[1]);
  if (cells === null) return null;
  const smooth = stringPull(cost, grid.nLon, cells).map((k) => cells[k]);
  let eps = DP_TOLERANCE_M / grid.pitch;
  let out: Cell[];
  for (;;) {
    out = douglasPeucker(cost, grid.nLon, smooth, eps);
    if (out.length <= MAX_WAYPOINTS || eps > 5000 / grid.pitch) break;
    eps *= 1.5;
  }
  return out.map(([r, c]) => cellCentre(grid, r, c));
}
