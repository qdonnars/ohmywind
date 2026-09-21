// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Where tidal currents are probably strong and no fine source is served.
 *
 * The same snapshot the server ships (``openwind_data/currents/tidal_gaps.geojson``):
 * the known passes of the European target area without a fine or medium
 * current source, and the zones over 1.5 kt reconstructed from the 2 km
 * atlas that no fine atlas covers. The explore view asks it for a spot whose
 * currents come from the global model, so the small print under the
 * currents table can warn before the numbers are believed. Loaded on first
 * use, since most spots never need it.
 */
import type { Feature, FeatureCollection, Geometry, Point, Polygon, MultiPolygon } from "geojson";

import { describeCurrentSource } from "./currentSource";

export interface TidalGap {
  zone: string;
  maxSpringKt: number | null;
  kind: "pass" | "mask";
  distanceKm: number;
}

type GapProps =
  | { kind: "mask"; threshold_kt: number }
  | { kind: "pass"; name: string; max_spring_kt: number | null; unresolved_by?: string[] };

/** A pass influences the flow around it; 15 km matches the server's rule. */
export const PASS_RADIUS_KM = 15;
/** The blind spot of a fine grid around a channel it does not resolve; the server's rule too. */
export const UNRESOLVED_RADIUS_KM = 3;

let loading: Promise<FeatureCollection<Geometry, GapProps>> | null = null;
function load(): Promise<FeatureCollection<Geometry, GapProps>> {
  loading ??= import("./tidalGaps.json").then((m) => (m.default ?? m) as unknown as FeatureCollection<Geometry, GapProps>);
  return loading;
}

function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.hypot((lat2 - lat1) * 111, (lon2 - lon1) * 111 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)));
}

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, coords: number[][][]): boolean {
  return inRing(x, y, coords[0]) && !coords.slice(1).some((h) => inRing(x, y, h));
}

function inGeometry(lon: number, lat: number, g: Geometry): boolean {
  if (g.type === "Polygon") return inPolygon(lon, lat, (g as Polygon).coordinates);
  if (g.type === "MultiPolygon") return (g as MultiPolygon).coordinates.some((c) => inPolygon(lon, lat, c));
  return false;
}

/** Pure lookup over an already loaded collection; ``tidalGapAt`` is the async front. */
export function findTidalGap(lat: number, lon: number, gaps: FeatureCollection<Geometry, GapProps>, passRadiusKm = PASS_RADIUS_KM): TidalGap | null {
  let best: TidalGap | null = null;
  for (const f of gaps.features) {
    if (f.properties.kind !== "pass") continue;
    const [plon, plat] = (f as Feature<Point>).geometry.coordinates;
    const km = kmBetween(lat, lon, plat, plon);
    if (km <= passRadiusKm && (!best || km < best.distanceKm)) {
      best = { zone: f.properties.name, maxSpringKt: f.properties.max_spring_kt, kind: "pass", distanceKm: km };
    }
  }
  if (best) return best;
  for (const f of gaps.features) {
    if (f.properties.kind === "mask" && inGeometry(lon, lat, f.geometry)) {
      return { zone: "", maxSpringKt: null, kind: "mask", distanceKm: 0 };
    }
  }
  return null;
}

export async function tidalGapAt(lat: number, lon: number): Promise<TidalGap | null> {
  return findTidalGap(lat, lon, await load());
}

/**
 * The nearest pass within `radiusKm` that the atlas behind `source` misses:
 * the map builder measured its maximum there at under half the published
 * spring current (an 800 m grid has no cell in a 150 m channel), so a fine
 * pitch does not clear the warning. Pure lookup over a loaded collection.
 */
export function findUnresolvedPass(lat: number, lon: number, source: string, gaps: FeatureCollection<Geometry, GapProps>, radiusKm = UNRESOLVED_RADIUS_KM): TidalGap | null {
  let best: TidalGap | null = null;
  for (const f of gaps.features) {
    if (f.properties.kind !== "pass" || !f.properties.unresolved_by?.includes(source)) continue;
    const [plon, plat] = (f as Feature<Point>).geometry.coordinates;
    const km = kmBetween(lat, lon, plat, plon);
    if (km <= radiusKm && (!best || km < best.distanceKm)) {
      best = { zone: f.properties.name, maxSpringKt: f.properties.max_spring_kt, kind: "pass", distanceKm: km };
    }
  }
  return best;
}

/**
 * Whether the currents shown for a spot deserve the tidal-gap warning: they
 * come from the global model (or from nothing) and the spot sits in a gap,
 * or from a fine atlas beside a pass it is blind to.
 */
export async function tidalGapForSource(lat: number, lon: number, source: string | null | undefined, resolutionM: number | null | undefined): Promise<TidalGap | null> {
  const kind = describeCurrentSource(source, resolutionM, null);
  if (kind.kind === "shom") return null;
  if (kind.kind === "marc" && kind.resolutionM <= 1000) {
    return source ? findUnresolvedPass(lat, lon, source, await load()) : null;
  }
  return tidalGapAt(lat, lon);
}
