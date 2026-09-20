// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Geometry and classification behind the tidal-sources map of /methodologie.
 *
 * Pure functions, no Leaflet: the map component feeds them GeoJSON it
 * fetched and the answer the API gave for a click, and renders what comes
 * back. The class boundaries mirror the server's confidence rule
 * (``narrow_pass.confidence_for_point``): an atlas at 1 km or finer resolves
 * a race or an estuary mouth and is tagged high; coarser only says "there is
 * tide here".
 */
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Point, Polygon } from "geojson";

export type PrecisionClass = "fine" | "medium" | "coarse" | "global";

export const FINE_MAX_M = 500;
export const MEDIUM_MAX_M = 1000;
export const COARSE_MAX_M = 3000;

/** Precision class of an atlas from its grid size in metres; ``null`` is SMOC. */
export function precisionClass(resolutionM: number | null | undefined): PrecisionClass {
  if (resolutionM == null || resolutionM > COARSE_MAX_M) return "global";
  if (resolutionM <= FINE_MAX_M) return "fine";
  if (resolutionM <= MEDIUM_MAX_M) return "medium";
  return "coarse";
}

/**
 * What the API answered for a point, reduced to what the popup says.
 * ``source`` is the runtime label (``marc_finis_250m``, ``shom_c2d_558_morbihan``,
 * ``openmeteo_smoc``); ``covered: false`` and an absent label both mean SMOC.
 */
export interface SourceAnswer {
  kind: "shom" | "atlas" | "smoc";
  label: string;
  precision: PrecisionClass;
  resolutionM: number | null;
  shomDistanceM: number | null;
}

export function classifyAnswer(overlay: {
  covered?: boolean;
  current_source?: string;
  atlas_resolution_m?: number | null;
  shom_nearest_km?: number | null;
}): SourceAnswer {
  const label = overlay.covered && overlay.current_source ? overlay.current_source : "openmeteo_smoc";
  if (label.startsWith("shom_c2d_")) {
    const km = overlay.shom_nearest_km ?? null;
    return {
      kind: "shom",
      label,
      precision: "fine",
      resolutionM: null,
      shomDistanceM: km == null ? null : Math.round((km * 1000) / 10) * 10,
    };
  }
  if (label === "openmeteo_smoc") {
    return { kind: "smoc", label, precision: "global", resolutionM: null, shomDistanceM: null };
  }
  const fromLabel = /_(\d+)m$/.exec(label);
  const res = overlay.atlas_resolution_m ?? (fromLabel ? Number(fromLabel[1]) : null);
  return { kind: "atlas", label, precision: precisionClass(res), resolutionM: res, shomDistanceM: null };
}

/** Flat-earth distance in kilometres, good to a few metres over a few degrees. */
export function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 111;
  const dLon = (lon2 - lon1) * 111 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
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
  if (!inRing(x, y, coords[0])) return false;
  for (let k = 1; k < coords.length; k++) if (inRing(x, y, coords[k])) return false;
  return true;
}

/** Ray casting on a GeoJSON Polygon or MultiPolygon, holes honoured. */
export function pointInGeometry(lon: number, lat: number, geometry: Geometry | null | undefined): boolean {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return inPolygon(lon, lat, (geometry as Polygon).coordinates);
  if (geometry.type === "MultiPolygon") {
    return (geometry as MultiPolygon).coordinates.some((c) => inPolygon(lon, lat, c));
  }
  return false;
}

/**
 * A source whose extent spans more than half the globe (FES, TPXO): the
 * fallback tier of the cascade, never a candidate that could cover a zone.
 */
export function isGlobalExtent(geometry: Geometry | null | undefined): boolean {
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return false;
  let min = Infinity;
  let max = -Infinity;
  const rings = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of rings) {
    for (const [lon] of poly[0]) {
      if (lon < min) min = lon;
      if (lon > max) max = lon;
    }
  }
  return max - min > 180;
}

export type CurrentBand = "over15" | "over05" | "under05" | "unknown";

/**
 * The computed "where the current matters" band at a point. The 1.5 kt and
 * 0.5 kt masks come from the MARC ATLNE atlas (North-East Atlantic) and,
 * when built, from FES2014 for the whole world: with a worldwide mask
 * loaded (a feature flagged ``global``), a point outside both bands is
 * calm; with ATLNE alone, outside its footprint the answer is ``unknown``.
 */
export function currentBand(
  lon: number,
  lat: number,
  masks: FeatureCollection<Geometry, { threshold_kt: number; global?: boolean }> | null,
  atlneFootprint: Geometry | null,
): CurrentBand {
  if (!masks) return "unknown";
  const over15 = masks.features.some(
    (f) => f.properties.threshold_kt >= 1.5 && pointInGeometry(lon, lat, f.geometry),
  );
  if (over15) return "over15";
  const over05 = masks.features.some(
    (f) => f.properties.threshold_kt < 1.5 && pointInGeometry(lon, lat, f.geometry),
  );
  if (over05) return "over05";
  if (masks.features.some((f) => f.properties.global)) return "under05";
  return atlneFootprint && pointInGeometry(lon, lat, atlneFootprint) ? "under05" : "unknown";
}

/**
 * The four colours of the map, computed by ``build_tidal_world_map.py`` for
 * the 1.5 kt areas and for each known pass: served by a tidal source,
 * not served but an open source exists, not served and the known data is
 * closed or unclear, not served and nothing is known.
 */
export type ZoneStatus = "calm" | "covered" | "target" | "blocked" | "unknown";
/** Legend order; ``calm`` is covered water under 0.5 kt, drawn pale. */
export const ZONE_STATUSES: readonly ZoneStatus[] = ["covered", "calm", "target", "blocked", "unknown"];

export interface ZoneProperties {
  status: ZoneStatus;
  /** Lower bound of the green band, in knots, on ``covered`` features only. */
  min_kt?: number;
}

/** The thresholds of the green gradient, as the map builder contours them. */
export const BAND_THRESHOLDS_KT: readonly number[] = [0.5, 1, 1.5, 2, 3, 5];

/** The green of a covered band: the stronger the tide, the darker. */
export function bandColor(minKt: number | null | undefined): string {
  const ramp = ["#a8d9b5", "#7fc797", "#56b177", "#339c5c", "#1f7f46", "#0f5f31"];
  if (minKt == null) return ramp[0];
  let i = 0;
  for (let k = 0; k < BAND_THRESHOLDS_KT.length; k++) if (minKt >= BAND_THRESHOLDS_KT[k]) i = k;
  return ramp[i];
}

/** The upper bound of the band that starts at ``minKt``, ``null`` for the last one. */
export function bandUpper(minKt: number): number | null {
  const i = BAND_THRESHOLDS_KT.indexOf(minKt);
  return i >= 0 && i + 1 < BAND_THRESHOLDS_KT.length ? BAND_THRESHOLDS_KT[i + 1] : null;
}

/** The zone under a point: its status and, for covered water, its band. */
export function statusAt(
  lon: number,
  lat: number,
  status: FeatureCollection<Geometry, ZoneProperties> | null,
): ZoneProperties | null {
  if (!status) return null;
  const hit = status.features.find((f) => pointInGeometry(lon, lat, f.geometry));
  return hit ? hit.properties : null;
}

export interface PassProperties {
  name: string;
  status: ZoneStatus;
  country: string;
  max_spring_kt: number | null;
  max_spring_text: string | null;
  confidence: string;
  source_url: string | null;
  coverage_class: PrecisionClass;
  best_source: string | null;
  candidates: string[];
  in_objective: boolean;
}

/** The engine's own radius for "this leg passes a known race"
    (``tidal_gaps.tidal_gap_at(pass_radius_km)``), so the card and the
    warning name the same pass for the same point. */
export const PASS_RADIUS_KM = 15;

/** The known pass nearest to a point within ``maxKm``, or ``null``. */
export function nearestPass(
  lat: number,
  lon: number,
  passes: FeatureCollection<Point, PassProperties> | null,
  maxKm = PASS_RADIUS_KM,
): { feature: Feature<Point, PassProperties>; km: number } | null {
  if (!passes) return null;
  let best: { feature: Feature<Point, PassProperties>; km: number } | null = null;
  for (const f of passes.features) {
    const [plon, plat] = f.geometry.coordinates;
    const km = kmBetween(lat, lon, plat, plon);
    if (km <= maxKm && (!best || km < best.km)) best = { feature: f, km };
  }
  return best;
}

/** HTML-escape for popup strings built from data files. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
