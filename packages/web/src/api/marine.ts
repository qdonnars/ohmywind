// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type {
  MarineHourly,
} from "../types";
import { API_BASE } from "./config";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { parisIsoToUtcMs } from "../domain/datetime";
import {
  CURRENT_RELEVANCE_THRESHOLD_KN,
  TIDE_RANGE_RELEVANCE_THRESHOLD_M,
} from "../domain/thresholds";

const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";

// 8 vars on Marine endpoint (waves x5 + currents x2 + tide x1) — under the
// 10-var-per-call cap. Mirrors packages/data-adapters/.../openmeteo.py:_MARINE_VARS.
const MARINE_VARS =
  "wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height," +
  "ocean_current_velocity,ocean_current_direction,sea_level_height_msl";

// Open-Meteo Marine returns ocean_current_velocity in km/h by default.
// 1 nautical mile = 1852 m → 1 kn = 1.852 km/h.
const KMH_TO_KN = 1 / 1.852;

// MARC PREVIMER overlay served by our HF Space wrapper. Returns hourly tide
// + current resampled from harmonic constants when the spot lies inside one
// of the 7 published atlases (ATLNE, MANGA, FINIS, MANW, MANE, SUDBZH, AQUI).
// Outside coverage the response carries ``covered: false`` and we keep the
// Open-Meteo SMOC values.
const MARC_URL = `${API_BASE}/api/v1/marine/marc`;

const cache = new Map<string, { data: MarineHourly; fetchedAt: number }>();
const CACHE_TTL = 30 * 60 * 1000;

interface RawHourly {
  time?: string[];
  wave_height?: (number | null)[];
  wave_period?: (number | null)[];
  wave_direction?: (number | null)[];
  ocean_current_velocity?: (number | null)[];
  ocean_current_direction?: (number | null)[];
  sea_level_height_msl?: (number | null)[];
}

export interface MarcOverlay {
  covered: boolean;
  current_source?: string;
  atlas_resolution_m?: number;
  z0_hydro_m?: number;
  times?: string[];
  tide_height_m?: (number | null)[];
  current_speed_kn?: (number | null)[];
  current_direction_to_deg?: (number | null)[];
  // National tidal coefficient at the start of the requested window
  // (Brest-anchored, integer in [20, 120]). Surfaced by the server when
  // the SHOM registry has Brest constants loaded; null otherwise.
  tide_coefficient?: number | null;
}

function pad(arr: (number | null)[] | undefined, n: number): (number | null)[] {
  const out: (number | null)[] = new Array(n).fill(null);
  if (!arr) return out;
  for (let i = 0; i < Math.min(arr.length, n); i++) out[i] = arr[i] ?? null;
  return out;
}

async function fetchMarcOverlay(
  lat: number,
  lon: number,
  startUtcIso: string,
  endUtcIso: string,
): Promise<MarcOverlay | null> {
  const url =
    `${MARC_URL}?lat=${lat}&lon=${lon}` +
    `&start=${encodeURIComponent(startUtcIso)}` +
    `&end=${encodeURIComponent(endUtcIso)}` +
    `&step_minutes=60`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return (await resp.json()) as MarcOverlay;
  } catch {
    return null;
  }
}

// ── MARC coverage ────────────────────────────────────────────────────────────
//
// `/api/v1/marine/marc` answers 200 with `covered: false` outside the atlases,
// which is the right contract for one point and the wrong cost for a route: a
// Mediterranean plan measured 14 uncovered answers out of 14 calls, one per
// corridor point, none of which could ever have carried data. The Space now
// publishes the bounding boxes so a client can decide not to ask.
//
// The promise is one-directional, and the server says so: outside every box
// there is nothing to fetch, inside one there may still be nothing (the SHOM
// boxes wrap a scattered point cloud with land and gaps in it). Skipping
// outside them loses no data; assuming coverage inside them would be wrong,
// which is why the overlay is still fetched and still merged only when it
// reports `covered`.
//
// A bounding box alone is too coarse to be useful everywhere: MARC's ATLNE
// spans [39.98, -20.03] to [64.99, 15.00], which swallows the whole western
// Mediterranean while holding no data there. Entries therefore also carry
// `cells`, the exact union of their non-empty tiles, and that is what a point
// is tested against when it is present.

/** [lat_min, lon_min, lat_max, lon_max] in degrees WGS84, latitude first. */
export type CoverageRect = [number, number, number, number];

export interface MarcAtlasBox {
  name: string;
  source: string;
  bbox: CoverageRect;
  /** Non-empty tiles of this atlas. When present and non-empty it is what
      decides, the bbox merely wrapping it. Absent on a Space that predates
      the field, and the bbox then decides on its own. */
  cells?: CoverageRect[];
}

const COVERAGE_URL = `${MARC_URL}/coverage`;
const COVERAGE_STORAGE_KEY = LOCAL_STORAGE_KEYS.marcCoverage;
/** The server sends `max-age=86400` on a real answer. Mirrored here so a
    reload does not re-ask, and so the HTTP cache is not the only line of
    defence (Chrome on Android evicts it under pressure). */
const COVERAGE_TTL_MS = 24 * 3600 * 1000;
/** An empty list is what a Space that booted without the atlas dataset
    reports, and the server caches that answer for 5 minutes only. Persisting
    it for a day would tell a client to skip the atlases long after they came
    back. */
const COVERAGE_EMPTY_TTL_MS = 5 * 60 * 1000;

/** Four finite numbers, latitude first, mins before maxes. */
function toRect(value: unknown): CoverageRect | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const [latMin, lonMin, latMax, lonMax] = value as CoverageRect;
  if (latMin > latMax || lonMin > lonMax) return null;
  return [latMin, lonMin, latMax, lonMax];
}

function inRect(lat: number, lon: number, [latMin, lonMin, latMax, lonMax]: CoverageRect): boolean {
  return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax;
}

/**
 * Shape check on the coverage payload. Returns `null` for anything that is
 * not the documented body, which the callers read as "unknown coverage" and
 * therefore as "ask MARC, like before".
 *
 * An entry that does not parse is dropped rather than taken as grounds to
 * reject the whole answer: one atlas the client cannot read is no reason to
 * spend a request on every point of every other. Dropping it can only make
 * the client ask more often, never less.
 */
export function parseMarcCoverage(body: unknown): MarcAtlasBox[] | null {
  if (typeof body !== "object" || body === null) return null;
  const atlases = (body as { atlases?: unknown }).atlases;
  if (!Array.isArray(atlases)) return null;
  const out: MarcAtlasBox[] = [];
  for (const entry of atlases) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, source, bbox, cells } = entry as Record<string, unknown>;
    if (typeof name !== "string" || typeof source !== "string") continue;
    const box = toRect(bbox);
    if (!box) continue;
    const parsed: MarcAtlasBox = { name, source, bbox: box };
    if (Array.isArray(cells)) {
      const rects = cells.map(toRect).filter((r): r is CoverageRect => r !== null);
      // A `cells` list that survives validation is what decides. One that does
      // not (empty, or nothing readable in it) leaves the bbox in charge,
      // which is the coarser and safer of the two answers.
      if (rects.length > 0) parsed.cells = rects;
    }
    out.push(parsed);
  }
  return out;
}

/**
 * Whether the atlases could have anything to say at this point.
 *
 * `null` means we do not know (endpoint missing, offline, malformed body):
 * the answer is then "ask", which is exactly the behaviour that shipped
 * before this existed.
 */
export function marcMayCover(lat: number, lon: number, atlases: MarcAtlasBox[] | null): boolean {
  if (atlases === null) return true;
  return atlases.some((atlas) =>
    atlas.cells && atlas.cells.length > 0
      ? atlas.cells.some((cell) => inRect(lat, lon, cell))
      : inRect(lat, lon, atlas.bbox),
  );
}

function readStoredCoverage(now: number): MarcAtlasBox[] | null {
  try {
    const raw = localStorage.getItem(COVERAGE_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { fetchedAt?: unknown; atlases?: unknown };
    if (typeof stored.fetchedAt !== "number") return null;
    const atlases = parseMarcCoverage(stored);
    if (!atlases) return null;
    const ttl = atlases.length > 0 ? COVERAGE_TTL_MS : COVERAGE_EMPTY_TTL_MS;
    return now - stored.fetchedAt < ttl ? atlases : null;
  } catch {
    return null;
  }
}

function storeCoverage(atlases: MarcAtlasBox[]): void {
  try {
    localStorage.setItem(
      COVERAGE_STORAGE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), atlases }),
    );
  } catch {
    // Storage full or disabled. The session cache still saves the repeats.
  }
}

let coverageInFlight: Promise<MarcAtlasBox[] | null> | undefined;

/**
 * The atlas bounding boxes, once per session.
 *
 * Resolves to `null` when the endpoint is missing or unreadable, which is not
 * an error: a Space that predates the route answers 404, and every caller then
 * falls back to asking MARC per point. Memoised either way so a deploy lag
 * costs one request, not one per corridor point.
 */
export function fetchMarcCoverage(): Promise<MarcAtlasBox[] | null> {
  if (coverageInFlight) return coverageInFlight;
  coverageInFlight = (async () => {
    const stored = readStoredCoverage(Date.now());
    if (stored) return stored;
    try {
      const resp = await fetch(COVERAGE_URL);
      if (!resp.ok) return null;
      const atlases = parseMarcCoverage(await resp.json());
      if (!atlases) return null;
      storeCoverage(atlases);
      return atlases;
    } catch {
      return null;
    }
  })();
  return coverageInFlight;
}

/** Test seam: forget the session's coverage answer. Not used by the app. */
export function clearMarcCoverageCache(): void {
  coverageInFlight = undefined;
}

/** The overlay for one point, or nothing when the atlases cannot cover it. */
function fetchMarcOverlayIfCovered(
  lat: number,
  lon: number,
  startUtcIso: string,
  endUtcIso: string,
  atlases: MarcAtlasBox[] | null,
): Promise<MarcOverlay | null> {
  if (!marcMayCover(lat, lon, atlases)) return Promise.resolve(null);
  return fetchMarcOverlay(lat, lon, startUtcIso, endUtcIso);
}

// ── MARC overlays for a whole corridor ───────────────────────────────────────
//
// Coverage (#322) removed the calls that could never have carried data. What
// remains is an Atlantic route, where every corridor point *is* covered and
// each one was still a round trip of its own: fifteen requests, fifteen
// harmonic evaluations, fifteen rate-limit hits, for one route. The Space now
// takes the whole corridor in one POST and answers in the same order, one
// element per point, each element exactly the per-point GET's body. Same
// rate-limit bucket, one hit.
//
// Availability is discovered rather than configured: a deployment that
// predates the route answers 404 or 405, and the client falls back to the
// per-point path and remembers for the page load. Every other failure is
// treated as "no overlay", which is what a failed per-point GET already did:
// the corridor keeps its Open-Meteo SMOC values rather than losing its marine
// data altogether.

const MARC_BATCH_URL = `${MARC_URL}/batch`;

/** Server cap. A corridor is far under it; chunking is belt and braces. */
const MARC_BATCH_MAX_POINTS = 120;

/** `null` while nothing is known, then the verdict for this page load. */
let marcBatchAvailable: boolean | null = null;

/** Test seam: the verdict is a page-load fact, and tests need several. */
export function resetMarcBatchSupport(): void {
  marcBatchAvailable = null;
}

/**
 * One POST for up to `MARC_BATCH_MAX_POINTS` points.
 *
 * Returns `null` when the route is absent, so the caller can fall back;
 * returns an array of nulls when the route is there but the call failed, which
 * is the per-point behaviour on a failed GET.
 */
async function fetchMarcOverlayBatch(
  points: { lat: number; lon: number }[],
  startUtcIso: string,
  endUtcIso: string,
): Promise<(MarcOverlay | null)[] | null> {
  let resp: Response;
  try {
    resp = await fetch(MARC_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: points.map((p) => [p.lat, p.lon]),
        start: startUtcIso,
        end: endUtcIso,
        step_minutes: 60,
      }),
    });
  } catch {
    // Transport failure. Not a verdict on the route: the next corridor may
    // well succeed, so the availability flag is left alone.
    return points.map(() => null);
  }
  if (resp.status === 404 || resp.status === 405) return null;
  if (!resp.ok) return points.map(() => null);
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return points.map(() => null);
  }
  const overlays = (body as { overlays?: unknown })?.overlays;
  // A length mismatch would silently attach one point's tide to another's
  // position, so it is rejected whole.
  if (!Array.isArray(overlays) || overlays.length !== points.length) {
    return points.map(() => null);
  }
  return overlays.map((o) =>
    o && typeof o === "object" ? (o as MarcOverlay) : null,
  );
}

/**
 * Overlays for a corridor, aligned with `points`, `null` where none applies.
 *
 * Points the atlases cannot cover never leave the browser. When none is
 * covered, nothing is requested at all.
 */
async function fetchMarcOverlays(
  points: { lat: number; lon: number }[],
  startUtcIso: string,
  endUtcIso: string,
  atlases: MarcAtlasBox[] | null,
): Promise<(MarcOverlay | null)[]> {
  const out: (MarcOverlay | null)[] = points.map(() => null);
  const covered: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (marcMayCover(points[i].lat, points[i].lon, atlases)) covered.push(i);
  }
  if (covered.length === 0) return out;

  if (marcBatchAvailable !== false) {
    const chunks: number[][] = [];
    for (let i = 0; i < covered.length; i += MARC_BATCH_MAX_POINTS) {
      chunks.push(covered.slice(i, i + MARC_BATCH_MAX_POINTS));
    }
    const answers = await Promise.all(
      chunks.map((chunk) =>
        fetchMarcOverlayBatch(chunk.map((i) => points[i]), startUtcIso, endUtcIso),
      ),
    );
    if (answers.every((a) => a !== null)) {
      marcBatchAvailable = true;
      chunks.forEach((chunk, c) => {
        chunk.forEach((i, k) => {
          out[i] = answers[c]![k];
        });
      });
      return out;
    }
    marcBatchAvailable = false;
  }

  const perPoint = await Promise.all(
    covered.map((i) => fetchMarcOverlay(points[i].lat, points[i].lon, startUtcIso, endUtcIso)),
  );
  covered.forEach((i, k) => {
    out[i] = perPoint[k];
  });
  return out;
}

// Merge MARC overlay into the OM-shaped MarineHourly, index-by-index. Tide
// and current arrays from MARC override SMOC on matching hours; uncovered or
// non-matching hours keep SMOC. Always populates ``tide_height_zh_m`` when
// MARC covers (chart-datum reference, always ≥ 0 — what nautical charts and
// SHOM annuals display).
export function mergeMarcOverlay(
  data: MarineHourly,
  overlay: MarcOverlay | null,
): MarineHourly {
  if (!overlay || !overlay.covered) return data;
  if (
    !overlay.times ||
    !overlay.tide_height_m ||
    !overlay.current_speed_kn ||
    !overlay.current_direction_to_deg
  ) {
    return data;
  }
  const marcIdxByMinuteMs = new Map<number, number>();
  for (let i = 0; i < overlay.times.length; i++) {
    const ms = Date.parse(overlay.times[i]);
    if (Number.isFinite(ms)) {
      marcIdxByMinuteMs.set(Math.floor(ms / 60000) * 60000, i);
    }
  }

  const n = data.time.length;
  const tideMsl = data.tide_height_m.slice();
  const tideZh: (number | null)[] = new Array(n).fill(null);
  const speed = data.current_speed_kn.slice();
  const dirTo = data.current_direction_to_deg.slice();
  const z0 = overlay.z0_hydro_m;

  for (let i = 0; i < n; i++) {
    const utcMs = parisIsoToUtcMs(data.time[i]);
    const key = Math.floor(utcMs / 60000) * 60000;
    const j = marcIdxByMinuteMs.get(key);
    if (j == null) continue;
    const tm = overlay.tide_height_m[j];
    const sp = overlay.current_speed_kn[j];
    const dr = overlay.current_direction_to_deg[j];
    if (tm != null) {
      tideMsl[i] = tm;
      if (z0 != null) tideZh[i] = tm - z0;
    }
    if (sp != null) speed[i] = sp;
    if (dr != null) dirTo[i] = dr;
  }

  return {
    ...data,
    tide_height_m: tideMsl,
    tide_height_zh_m: tideZh,
    current_speed_kn: speed,
    current_direction_to_deg: dirTo,
    z0_hydro_m: z0,
    current_source: overlay.current_source,
    marc_resolution_m: overlay.atlas_resolution_m,
    tide_coefficient: overlay.tide_coefficient ?? null,
  };
}

// 7-day UTC window anchored at "today 00:00 Europe/Paris" — matches the OM
// forecast horizon so MARC and SMOC align hour-for-hour after merge.
function marcWindow(): [string, string] {
  const now = new Date();
  const dayParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const startMs = parisIsoToUtcMs(`${dayParis}T00:00`);
  const endMs = startMs + 7 * 24 * 3600 * 1000;
  return [new Date(startMs).toISOString(), new Date(endMs).toISOString()];
}

/** Cache key. 4 decimals is ~11 m: two points closer than that would have
    returned the same forecast anyway. Shared by the single-point and the
    corridor paths so one fills the other's cache. */
function marineCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/** Open-Meteo's hourly block, reshaped into our units and null-padded. */
function toMarineHourly(raw: { hourly?: RawHourly } | null): MarineHourly | null {
  const h = raw?.hourly;
  if (!h || !h.time) return null;
  const n = h.time.length;
  return {
    time: h.time,
    wave_height_m: pad(h.wave_height, n),
    wave_period_s: pad(h.wave_period, n),
    wave_direction_deg: pad(h.wave_direction, n),
    current_speed_kn: pad(h.ocean_current_velocity, n).map((v) =>
      v == null ? null : v * KMH_TO_KN
    ),
    current_direction_to_deg: pad(h.ocean_current_direction, n),
    tide_height_m: pad(h.sea_level_height_msl, n),
  };
}

const MARINE_QUERY = `hourly=${MARINE_VARS}&timezone=Europe/Paris&forecast_days=7`;

export async function fetchMarine(lat: number, lon: number): Promise<MarineHourly | null> {
  const key = marineCacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }
  const url = `${MARINE_URL}?latitude=${lat}&longitude=${lon}&${MARINE_QUERY}`;
  const [startIso, endIso] = marcWindow();
  let raw: { hourly?: RawHourly } | null;
  let overlay: MarcOverlay | null = null;
  try {
    // Coverage is resolved in parallel with the forecast, and the overlay
    // chains off it, so the only cost of asking is on a cold session: after
    // that the answer comes from memory or from localStorage.
    const [omResp, marcOverlay] = await Promise.all([
      fetch(url).then(async (r) =>
        r.ok ? ((await r.json()) as { hourly?: RawHourly }) : null,
      ),
      fetchMarcCoverage().then((atlases) =>
        fetchMarcOverlayIfCovered(lat, lon, startIso, endIso, atlases),
      ),
    ]);
    if (!omResp) return null;
    raw = omResp;
    overlay = marcOverlay;
  } catch {
    return null;
  }
  const baseData = toMarineHourly(raw);
  if (!baseData) return null;
  const data = mergeMarcOverlay(baseData, overlay);
  cache.set(key, { data, fetchedAt: Date.now() });
  return data;
}

/**
 * Marine data for a whole route corridor, in ONE Open-Meteo request.
 *
 * The Marine endpoint takes comma-separated coordinates and answers with an
 * array in the same order, exactly like the forecast endpoint the wind
 * corridor already uses. Asking point by point cost one request per corridor
 * point: 14 of them measured on a 63 NM Mediterranean leg, each a round trip
 * of its own on a browser that opens six connections at a time.
 *
 * The MARC overlay is per location by nature, but it no longer costs a request
 * per location: it is asked only where an atlas could answer, and those points
 * travel together in one POST (see `fetchMarcOverlays`).
 *
 * Results land in the same 30-minute per-point cache `fetchMarine` uses, so a
 * spot already looked at costs nothing here, and a corridor point looked at
 * here costs nothing on the spot page.
 */
export async function fetchMarineCorridor(
  coords: { lat: number; lon: number }[],
): Promise<(MarineHourly | null)[]> {
  const out: (MarineHourly | null)[] = coords.map(() => null);
  if (coords.length === 0) return out;

  // What the cache already holds, and what has to be asked for. Two plans
  // over the same route share most of their points, so a boat change or a
  // departure tweak usually finds everything here.
  const now = Date.now();
  const missing: number[] = [];
  const indicesByKey = new Map<string, number[]>();
  for (let i = 0; i < coords.length; i++) {
    const key = marineCacheKey(coords[i].lat, coords[i].lon);
    const hit = cache.get(key);
    if (hit && now - hit.fetchedAt < CACHE_TTL) {
      out[i] = hit.data;
      continue;
    }
    const seen = indicesByKey.get(key);
    if (seen) {
      // Same grid cell as an earlier point: one request answers both.
      seen.push(i);
      continue;
    }
    indicesByKey.set(key, [i]);
    missing.push(i);
  }
  if (missing.length === 0) return out;

  const coveragePromise = fetchMarcCoverage();
  const lats = missing.map((i) => coords[i].lat).join(",");
  const lons = missing.map((i) => coords[i].lon).join(",");
  const url = `${MARINE_URL}?latitude=${lats}&longitude=${lons}&${MARINE_QUERY}`;

  let byMissingIndex: ({ hourly?: RawHourly } | null)[];
  try {
    const resp = await fetch(url);
    if (!resp.ok) return out;
    const json: unknown = await resp.json();
    // Multi-coordinate answers with an array; a single coordinate may come
    // back as a bare object, so normalise before aligning to `missing`.
    const arr: unknown[] = Array.isArray(json) ? json : [json];
    byMissingIndex = missing.map((_, k) => (arr[k] ?? null) as { hourly?: RawHourly } | null);
  } catch {
    return out;
  }

  const [startIso, endIso] = marcWindow();
  const atlases = await coveragePromise;
  const overlays = await fetchMarcOverlays(
    missing.map((i) => coords[i]),
    startIso,
    endIso,
    atlases,
  );

  const fetchedAt = Date.now();
  for (let k = 0; k < missing.length; k++) {
    const i = missing[k];
    const baseData = toMarineHourly(byMissingIndex[k]);
    if (!baseData) continue;
    const data = mergeMarcOverlay(baseData, overlays[k]);
    const key = marineCacheKey(coords[i].lat, coords[i].lon);
    cache.set(key, { data, fetchedAt });
    for (const idx of indicesByKey.get(key) ?? [i]) out[idx] = data;
  }
  return out;
}

/** Test seam: drop every cached point. Not used by the app. */
export function clearMarineCache(): void {
  cache.clear();
}

export function isCurrentsRelevant(marine: MarineHourly | null): boolean {
  if (!marine) return false;
  return marine.current_speed_kn.some(
    (v): v is number => v != null && v >= CURRENT_RELEVANCE_THRESHOLD_KN
  );
}

export function isTidesRelevant(marine: MarineHourly | null): boolean {
  if (!marine) return false;
  // Prefer ZH (chart-datum) heights when MARC covers — same range as MSL since
  // ZH is a linear shift by z0, so the threshold check is unchanged.
  const series = marine.tide_height_zh_m ?? marine.tide_height_m;
  const valid = series.filter((v): v is number => v != null);
  if (valid.length === 0) return false;
  return Math.max(...valid) - Math.min(...valid) >= TIDE_RANGE_RELEVANCE_THRESHOLD_M;
}

export function isWavesRelevant(marine: MarineHourly | null): boolean {
  // Waves are always relevant offshore; show the pill whenever any Hs is
  // present. Coastal-only spots without Marine coverage will see the pill
  // hidden.
  if (!marine) return false;
  return marine.wave_height_m.some((v) => v != null);
}
