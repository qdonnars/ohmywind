// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Repair a drawn route that runs over land: the TypeScript twin of
 * `openwind_data.routing.auto_route.repair`, on the world lattice.
 *
 * Same rules as the server: a departure or an arrival ashore near open
 * water is moved there, a leg between two points at sea that crosses land
 * is retraced, that leg alone, and everything else (a waypoint ashore
 * between the ends, an end far inland, no passage, an absurd way round) is
 * a refusal: the route is then planned as drawn. Same steps in the same
 * order too, so that the app shows the route the server would have sent.
 */

import { haversineNm } from "../geo";
import { type Grid, type LatLon, cellCentre, cellOf, segmentSamples, suggestRoute } from "./engine";
import { MAX_LAT, colOf, pixelM, rowOf } from "./lattice";
import type { LandStore } from "./tiles";

const M_PER_NM = 1852;

// `RepairParams`, as on the server.
const MAX_SNAP_M = 3000.0;
const MAX_RATIO = 3.0;
const MARGIN_M = 12000.0;
const WIDE_MARGIN_RATIO = 0.75;
const MAX_PX = 2_000_000;

export type RepairNotice =
  | { code: "route.departure_moved" | "route.arrival_moved"; distanceM: string }
  | { code: "route.leg_retraced"; leg: number; retracedNm: string; straightNm: string };

export type RepairOutcome =
  /** No tile holds the route: nothing is known, nothing is done. */
  | { kind: "uncovered" }
  /** The route stays at sea as drawn. */
  | { kind: "unchanged" }
  /** The route cannot be repaired: it is planned as drawn. */
  | { kind: "refused" }
  | { kind: "repaired"; points: LatLon[]; added: number[]; notices: RepairNotice[] };

/** Position in the lattice, integers at the pixel centres, to a millionth
    of a pixel (see `_World.pixel`). */
function pixel(p: LatLon): [number, number] {
  return [
    Math.floor((rowOf(p.lat) - 0.5) * 1e6 + 0.5) / 1e6,
    Math.floor((colOf(p.lon) - 0.5) * 1e6 + 0.5) / 1e6,
  ];
}

async function isLand(store: LandStore, p: LatLon): Promise<boolean> {
  const [r, c] = pixel(p);
  const hit = await store.landAt(
    Int32Array.of(Math.floor(r + 0.5)),
    Int32Array.of(Math.floor(c + 0.5)),
  );
  return hit[0] === 1;
}

/** The lattice over the points' box widened by `marginM`, clipped to the
    archive, coarsened past `maxPx` pixels (see `_World.crop`). */
async function crop(
  store: LandStore,
  points: LatLon[],
  marginM: number,
  maxPx: number | null,
): Promise<Grid> {
  const lats = points.map((p) => p.lat);
  const pxM = pixelM(0.5 * (Math.min(...lats) + Math.max(...lats)));
  const m = marginM / pxM;
  const rows = points.map((p) => rowOf(p.lat));
  const cols = points.map((p) => colOf(p.lon));
  const [b0, b1, b2, b3] = store.bounds();
  let r0 = Math.max(b0, Math.floor(Math.min(...rows) - m));
  let r1 = Math.min(b1, Math.ceil(Math.max(...rows) + m));
  let c0 = Math.max(b2, Math.floor(Math.min(...cols) - m));
  let c1 = Math.min(b3, Math.ceil(Math.max(...cols) + m));
  let f = 1;
  if (maxPx !== null) f = Math.max(1, Math.ceil(Math.sqrt(((r1 - r0) * (c1 - c0)) / maxPx)));
  if (f > 1) {
    r0 = Math.floor(r0 / f) * f;
    c0 = Math.floor(c0 / f) * f;
    r1 = r0 + Math.ceil((r1 - r0) / f) * f;
    c1 = c0 + Math.ceil((c1 - c0) / f) * f;
  }
  const fine = await store.window(r0, r1, c0, c1);
  const nLat = (r1 - r0) / f;
  const nLon = (c1 - c0) / f;
  let land = fine;
  if (f > 1) {
    const width = c1 - c0;
    land = new Uint8Array(nLat * nLon);
    for (let r = 0; r < r1 - r0; r++) {
      const cr = Math.floor(r / f) * nLon;
      for (let c = 0; c < width; c++) {
        if (fine[r * width + c]) land[cr + Math.floor(c / f)] = 1;
      }
    }
  }
  return { nLat, nLon, land, row0: r0, col0: c0, factor: f, pitch: pxM * f };
}

/** The water of a window that reaches its edge (4-connected): 1 where open. */
function openWater(land: Uint8Array, nLat: number, nLon: number): Uint8Array {
  const sea = new Uint8Array(nLat * nLon);
  const queue: number[] = [];
  const seed = (i: number): void => {
    if (!land[i] && !sea[i]) {
      sea[i] = 1;
      queue.push(i);
    }
  };
  for (let c = 0; c < nLon; c++) {
    seed(c);
    seed((nLat - 1) * nLon + c);
  }
  for (let r = 0; r < nLat; r++) {
    seed(r * nLon);
    seed(r * nLon + nLon - 1);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const r = Math.floor(i / nLon);
    const c = i % nLon;
    if (r + 1 < nLat) seed(i + nLon);
    if (r >= 1) seed(i - nLon);
    if (c + 1 < nLon) seed(i + 1);
    if (c >= 1) seed(i - 1);
  }
  return sea;
}

/** The open cell nearest to (r, c), the first in row-major order among equals. */
function nearestOpen(
  sea: Uint8Array,
  nLat: number,
  nLon: number,
  r: number,
  c: number,
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let rr = 0; rr < nLat; rr++) {
    for (let cc = 0; cc < nLon; cc++) {
      if (!sea[rr * nLon + cc]) continue;
      const d = (rr - r) * (rr - r) + (cc - c) * (cc - c);
      if (d < bestD) {
        bestD = d;
        best = [rr, cc];
      }
    }
  }
  return best;
}

/** The centre of the cell of open water nearest to `p` on a coarsened grid
    (`_open_cell`). */
function openCell(grid: Grid, p: LatLon, radiusM: number): LatLon | null {
  const [r, c] = cellOf(grid, p);
  const rad = Math.ceil(radiusM / grid.pitch);
  const r0 = Math.max(0, r - rad);
  const r1 = Math.min(grid.nLat, r + rad + 1);
  const c0 = Math.max(0, c - rad);
  const c1 = Math.min(grid.nLon, c + rad + 1);
  if (r0 >= r1 || c0 >= c1) return null;
  const nLon = c1 - c0;
  const land = new Uint8Array((r1 - r0) * nLon);
  for (let rr = r0; rr < r1; rr++) {
    land.set(grid.land.subarray(rr * grid.nLon + c0, rr * grid.nLon + c1), (rr - r0) * nLon);
  }
  const hit = nearestOpen(openWater(land, r1 - r0, nLon), r1 - r0, nLon, r - r0, c - c0);
  return hit === null ? null : cellCentre(grid, hit[0] + r0, hit[1] + c0);
}

/** The open water nearest to `p` within `radiusM` and its distance in
    metres; `p` itself at distance 0 when it is in open water already. */
async function nearestSea(
  store: LandStore,
  p: LatLon,
  radiusM: number,
): Promise<{ point: LatLon; distanceM: number } | null> {
  const grid = await crop(store, [p], radiusM, null);
  const sea = openWater(grid.land, grid.nLat, grid.nLon);
  const [r, c] = cellOf(grid, p);
  if (r >= 0 && r < grid.nLat && c >= 0 && c < grid.nLon && sea[r * grid.nLon + c]) {
    return { point: p, distanceM: 0.0 };
  }
  const hit = nearestOpen(sea, grid.nLat, grid.nLon, r, c);
  if (hit === null) return null;
  const point = cellCentre(grid, hit[0], hit[1]);
  const distanceM = haversineNm(p, point) * M_PER_NM;
  return distanceM <= radiusM ? { point, distanceM } : null;
}

/** Whether the leg runs over land: two samples in a row on a land pixel. */
async function legCrossesLand(store: LandStore, a: LatLon, b: LatLon): Promise<boolean> {
  const [ra, ca] = pixel(a);
  const [rb, cb] = pixel(b);
  const [rs, cs] = segmentSamples(ra, ca, rb, cb);
  const rows = new Int32Array(rs.length);
  const cols = new Int32Array(rs.length);
  for (let i = 0; i < rs.length; i++) {
    rows[i] = Math.floor(rs[i] + 0.5);
    cols[i] = Math.floor(cs[i] + 0.5);
  }
  const hit = await store.landAt(rows, cols);
  for (let i = 1; i < hit.length; i++) {
    if (hit[i] && hit[i - 1]) return true;
  }
  return false;
}

/** The engine's route from `a` to `b` and the factor of the grid it ran on. */
async function search(
  store: LandStore,
  a: LatLon,
  b: LatLon,
  maxPx: number | null,
): Promise<{ waypoints: LatLon[]; factor: number } | null> {
  const margins = [MARGIN_M];
  const wide = WIDE_MARGIN_RATIO * haversineNm(a, b) * M_PER_NM;
  if (wide > MARGIN_M) margins.push(wide);
  for (const margin of margins) {
    const grid = await crop(store, [a, b], margin, maxPx);
    let start = a;
    let end = b;
    if (grid.factor > 1) {
      const nearA = openCell(grid, a, 2 * MAX_SNAP_M);
      const nearB = openCell(grid, b, 2 * MAX_SNAP_M);
      if (nearA === null || nearB === null) continue;
      start = nearA;
      end = nearB;
    }
    const waypoints = suggestRoute(grid, start, end);
    if (waypoints !== null) return { waypoints, factor: grid.factor };
  }
  return null;
}

async function retrace(store: LandStore, a: LatLon, b: LatLon): Promise<LatLon[] | null> {
  const found = await search(store, a, b, MAX_PX);
  if (found === null) return null;
  let wps = found.waypoints;
  if (found.factor > 1) {
    // The engine left from open water outside the harbours a coarsened
    // shoreline closes: each end is joined to it on the fine shoreline.
    if (await legCrossesLand(store, a, wps[0])) {
      const head = await search(store, a, wps[0], null);
      if (head === null) return null;
      wps = [...head.waypoints, ...wps.slice(1)];
    }
    if (await legCrossesLand(store, wps[wps.length - 1], b)) {
      const tail = await search(store, wps[wps.length - 1], b, null);
      if (tail === null) return null;
      wps = [...wps.slice(0, -1), ...tail.waypoints];
    }
  }
  const path = [a, ...wps, b];
  if (!(await legCrossesLand(store, a, path[2]))) path.splice(1, 1);
  if (!(await legCrossesLand(store, path[path.length - 3], b))) path.splice(path.length - 2, 1);
  for (let i = 1; i < path.length; i++) {
    if (await legCrossesLand(store, path[i - 1], path[i])) return null;
  }
  return path;
}

function lengthNm(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineNm(points[i - 1], points[i]);
  return total;
}

function holds(store: LandStore, points: LatLon[]): boolean {
  const lons = points.map((p) => p.lon);
  // A route across the antimeridian is left alone: its box would span the planet.
  if (Math.max(...lons) - Math.min(...lons) >= 180.0) return false;
  return points.every(
    (p) => Math.abs(p.lat) < MAX_LAT && store.covers(rowOf(p.lat), colOf(p.lon)),
  );
}

/** The route at sea, or why not (see `repair_route`). */
export async function repairRoute(store: LandStore, points: LatLon[]): Promise<RepairOutcome> {
  if (points.length < 2 || !holds(store, points)) return { kind: "uncovered" };
  const pts = points.slice();
  const notices: RepairNotice[] = [];

  for (let i = 1; i < pts.length - 1; i++) {
    if (await isLand(store, pts[i])) return { kind: "refused" };
  }

  const ends: [number, "route.departure_moved" | "route.arrival_moved"][] = [
    [0, "route.departure_moved"],
    [pts.length - 1, "route.arrival_moved"],
  ];
  for (const [index, code] of ends) {
    const near = await nearestSea(store, pts[index], 2 * MAX_SNAP_M);
    if (near !== null && near.distanceM === 0.0) continue;
    if (near === null || near.distanceM > MAX_SNAP_M) return { kind: "refused" };
    notices.push({ code, distanceM: near.distanceM.toFixed(0) });
    pts[index] = near.point;
  }

  const final = [pts[0]];
  const added: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!(await legCrossesLand(store, a, b))) {
      final.push(b);
      continue;
    }
    const path = await retrace(store, a, b);
    const straight = haversineNm(a, b);
    if (path === null) return { kind: "refused" };
    const retraced = lengthNm(path);
    if (retraced > MAX_RATIO * straight) return { kind: "refused" };
    const first = final.length;
    for (let k = 0; k < path.length - 2; k++) added.push(first + k);
    final.push(...path.slice(1));
    notices.push({
      code: "route.leg_retraced",
      leg: i + 1,
      retracedNm: retraced.toFixed(1),
      straightNm: straight.toFixed(1),
    });
  }
  if (notices.length === 0) return { kind: "unchanged" };
  return { kind: "repaired", points: final, added, notices };
}
