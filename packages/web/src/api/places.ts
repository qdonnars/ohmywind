import type { Spot } from "../types";
import { haversineNm } from "../utils/geo";

/** A single row in the search dropdown, whatever produced it. */
export interface PlaceResult {
  /** Stable within a result set; used as the React key and for dedup. */
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Secondary line: département, région, or the feature kind for the
      maritime entries that carry no administrative parent. */
  context: string;
  source: "saved" | "photon" | "openmeteo" | "coordinates";
  /** Great-circle distance from the reference point, when one is known. */
  distanceNm?: number;
}

/** Two results closer than this and sharing a name are the same place. */
const DEDUP_RADIUS_NM = 2;

/** Strip diacritics and case so "Ile d'Yeu" matches "île d'Yeu". */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Collapse the repeats OSM produces for linear features: a fairway or a
 * strait is stored as several ways, so a search for "Raz de Sein" comes back
 * four times within a few miles. Same name plus near-identical position means
 * one entry for the user.
 *
 * Order is preserved, so whichever ranking the caller applied survives.
 */
export function dedupePlaces(results: PlaceResult[]): PlaceResult[] {
  const kept: PlaceResult[] = [];
  for (const candidate of results) {
    const key = normalizeForMatch(candidate.name);
    const duplicate = kept.some(
      (k) =>
        normalizeForMatch(k.name) === key &&
        haversineNm(k.latitude, k.longitude, candidate.latitude, candidate.longitude) <
          DEDUP_RADIUS_NM,
    );
    if (!duplicate) kept.push(candidate);
  }
  return kept;
}

/** Annotate each result with its distance to the reference point. */
export function withDistances(
  results: PlaceResult[],
  near: { lat: number; lon: number } | null | undefined,
): PlaceResult[] {
  if (!near) return results;
  return results.map((r) => ({
    ...r,
    distanceNm: haversineNm(near.lat, near.lon, r.latitude, r.longitude),
  }));
}

/**
 * The user's own spots, matched locally.
 *
 * Searched before anything leaves the browser: these are the places someone
 * returns to, the match is instant, and it works with no network at all.
 */
export function matchSavedSpots(
  spots: Spot[],
  query: string,
  near: { lat: number; lon: number } | null | undefined,
  limit = 3,
): PlaceResult[] {
  const needle = normalizeForMatch(query);
  if (!needle) return [];
  const matches = spots
    .filter((s) => normalizeForMatch(s.name).includes(needle))
    .map<PlaceResult>((s) => ({
      id: `saved:${s.latitude},${s.longitude}`,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      context: "Spot enregistré",
      source: "saved",
    }));
  // A prefix match is a stronger signal of intent than a match buried in the
  // middle of the name, so it outranks it.
  matches.sort((a, b) => {
    const aStarts = normalizeForMatch(a.name).startsWith(needle) ? 0 : 1;
    const bStarts = normalizeForMatch(b.name).startsWith(needle) ? 0 : 1;
    return aStarts - bStarts;
  });
  return withDistances(matches, near).slice(0, limit);
}

/** "à 12 nm" for the dropdown. Below a mile the figure adds nothing. */
export function formatDistance(nm: number | undefined): string | null {
  if (nm == null || !Number.isFinite(nm)) return null;
  if (nm < 1) return "à moins d'1 nm";
  if (nm < 10) return `à ${nm.toFixed(1).replace(".", ",")} nm`;
  return `à ${Math.round(nm)} nm`;
}
