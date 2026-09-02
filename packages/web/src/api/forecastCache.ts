// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Builds the `forecast_cache` payload posted to the backend so passage planning
// reads weather the BROWSER fetched (one Open-Meteo call per user IP) instead of
// the HF Space's single IP. The server keeps full authority over segmentation;
// it reads this cache through a nearest-neighbour adapter (see
// packages/data-adapters/.../adapters/cache_backed.py). The cache is optional:
// when absent or the build fails, the server falls back to its live fetch, and
// MCP clients (no browser) always use the live path.

import type { ModelForecast, MarineHourly } from "../types";
import type { ModelName } from "../config/modelConfig";
import { activeModels, loadModelConfig } from "../config/modelConfig";
import { fetchWindCorridor } from "./openmeteo";
import { fetchMarineCorridor, parisIsoToUtcMs } from "./marine";
import { haversineNm, interpolateGreatCircle, type GeoPoint } from "../plan/geo";

export const CACHE_VERSION = 1;

// Web model name -> Open-Meteo backend slug. MUST mirror hf-space app.py
// `_MODEL_NAME_MAP` (a server test and the web test both assert this set). Only
// these four are validated end-to-end for passage timing; other active web
// models are display-only and excluded from the cache (matching the server's
// `_translate_models` silent-drop).
export const CACHE_MODEL_SLUGS: Partial<Record<ModelName, string>> = {
  AROME: "meteofrance_arome_france",
  ICON: "icon_eu",
  ECMWF: "ecmwf_ifs025",
  GFS: "gfs_seamless",
};
const GFS_SLUG = "gfs_seamless";

// Guard on corridor sample points, not the working rule: the corridor is now
// derived from the server's own segmentation (see serverSegmentLengthNm). It
// only catches routes where that rule cannot fit under the cap, typically a
// very long passage or so many waypoints that one point per leg already
// overflows. Beyond it, spacing stretches.
const MAX_CORRIDOR_POINTS = 60;
const DEFAULT_SPACING_NM = 5;

// Mirror of the server's sampling rule, `_resolve_segment_length` in
// packages/data-adapters/src/openwind_data/routing/passage.py. Keep these three
// in step with MAX_SAMPLED_SEGMENTS / MIN_SEG_LENGTH_NM / MAX_SEG_LENGTH_NM
// there; the test asserts the resulting geometry, not the constants.
const MAX_SAMPLED_SEGMENTS = 10;
const MIN_SEG_LENGTH_NM = 10;
const MAX_SEG_LENGTH_NM = 30;

// Default `segment_length_nm` of `estimate_passage`. The web never overrides
// it, so this is what the server will resolve against.
const SERVER_REQUESTED_SEGMENT_NM = 10;

export interface CacheWindSeries {
  speed_kn: (number | null)[];
  direction_deg: (number | null)[];
  gust_kn: (number | null)[];
}

export interface CacheSea {
  wave_height_m: (number | null)[];
  wave_period_s: (number | null)[];
  wave_direction_deg: (number | null)[];
  current_speed_kn: (number | null)[];
  current_direction_to_deg: (number | null)[];
  tide_height_m: (number | null)[];
  current_source: string | null;
}

export interface ForecastCachePoint {
  lat: number;
  lon: number;
  wind_by_model: Record<string, CacheWindSeries>;
  sea: CacheSea;
}

export interface ForecastCache {
  version: number;
  models: string[];
  times_ms: number[];
  points: ForecastCachePoint[];
}

// A corridor point with its already-fetched per-model wind + marine series.
export interface SampledPoint {
  lat: number;
  lon: number;
  models: ModelForecast[];
  marine: MarineHourly | null;
}

// Optional UTC-ms clamp on the cache time axis (keeps the payload small: a
// single-day plan needs ~1-2 days of hours, not the full 7-day fetch).
export interface CacheWindow {
  startMs?: number;
  endMs?: number;
}

// Numeric precision of the serialised cache, field by field. Every float that
// reaches the wire goes through one of these two helpers; nothing else in the
// payload is a float (times_ms are integer epoch-ms, models and current_source
// are strings). Why round at all: JSON.stringify writes the shortest decimal
// that round-trips the double, so an unrounded value costs up to 17 significant
// digits where 4 to 6 carry everything the server can act on.
//
//   lat / lon ..................... 4 dp (~11 m), see COORD_DP below
//   speed_kn / gust_kn ............ 1 dp (0.1 kn), the model's own resolution
//   direction_deg ................. 0 dp (1 deg)
//   wave_height_m / tide_height_m . 2 dp (1 cm)
//   wave_period_s ................. 1 dp (0.1 s)
//   wave_direction_deg ............ 0 dp (1 deg)
//   current_speed_kn .............. 2 dp (0.01 kn), the 0.3 kn reporting
//                                   threshold needs the centikn
//   current_direction_to_deg ...... 0 dp (1 deg)
function roundOrNull(v: number | null | undefined, dp: number): number | null {
  if (v == null) return null;
  return Number(v.toFixed(dp));
}

// Corridor coordinates: 4 decimals, about 11 m of latitude. The server never
// reads these as a position to compute from, only as a lookup key: it segments
// its own route from the full-precision waypoints of the request and resolves
// each segment midpoint by nearest neighbour over the cache points (see
// adapters/cache_backed.py). Corridor points are kilometres apart, so an 11 m
// nudge cannot change which one is nearest. Emitting them at double precision
// costs up to 17 significant digits twice per point for nothing.
const COORD_DP = 4;

function roundCoord(v: number): number {
  return Number(v.toFixed(COORD_DP));
}

// Interpolate sample points along the waypoint polyline at ~spacingNm. Mirrors
// segment_route: n = max(1, ceil(d/spacing)) per leg, endpoints hit the
// waypoints, shared waypoints between legs are not duplicated. Kept as the
// fallback path and for callers that pass an explicit spacing; the corridor a
// plan actually samples comes from planCorridor below.
export function interpolateCorridor(
  waypoints: [number, number][],
  spacingNm: number = DEFAULT_SPACING_NM,
): GeoPoint[] {
  if (waypoints.length < 2) throw new Error("need at least 2 waypoints");
  const out: GeoPoint[] = [];
  for (let leg = 0; leg < waypoints.length - 1; leg++) {
    const a: GeoPoint = { lat: waypoints[leg][0], lon: waypoints[leg][1] };
    const b: GeoPoint = { lat: waypoints[leg + 1][0], lon: waypoints[leg + 1][1] };
    const d = haversineNm(a, b);
    const n = Math.max(1, Math.ceil(d / spacingNm));
    for (let i = 0; i <= n; i++) {
      // Skip every leg's start except the first — it duplicates the previous
      // leg's end (the shared waypoint).
      if (i === 0 && leg > 0) continue;
      out.push(interpolateGreatCircle(a, b, i / n));
    }
  }
  return out;
}

export function routeLengthNm(waypoints: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += haversineNm(
      { lat: waypoints[i][0], lon: waypoints[i][1] },
      { lat: waypoints[i + 1][0], lon: waypoints[i + 1][1] },
    );
  }
  return total;
}

// Effective sub-segment length the server will use for this route, in NM.
//
// Mirrors `_resolve_segment_length`: the requested length is stretched so the
// route yields at most MAX_SAMPLED_SEGMENTS samples, clamped to
// [MIN_SEG_LENGTH_NM, MAX_SEG_LENGTH_NM], and never shortened below what was
// asked. In practice: 10 NM up to a 100 NM route, total/10 from there to 300
// NM, 30 NM beyond.
export function serverSegmentLengthNm(
  waypoints: [number, number][],
  requestedNm: number = SERVER_REQUESTED_SEGMENT_NM,
): number {
  const total = routeLengthNm(waypoints);
  const target = total / MAX_SAMPLED_SEGMENTS;
  if (target <= requestedNm) return requestedNm;
  const effective = Math.min(MAX_SEG_LENGTH_NM, Math.max(MIN_SEG_LENGTH_NM, target));
  return effective <= requestedNm ? requestedNm : effective;
}

// Corridor sampled so that every point the server will read sits exactly on a
// sample, rather than merely near one.
//
// The server splits each leg into n = max(1, ceil(d / L)) sub-segments of equal
// length (`segment_route`) and fetches at each sub-segment's midpoint, which
// the cache adapter resolves by nearest neighbour. Splitting the same leg into
// 2n instead of n therefore lands a corridor point on every sub-segment
// boundary AND on every midpoint: the nearest-neighbour lookup is exact, with
// no distance error to argue about. Halving a spacing and rounding up would
// not do it, since ceil(d / (L/2)) is not always 2 * ceil(d / L).
export function serverAlignedCorridor(
  waypoints: [number, number][],
  segmentNm: number,
): GeoPoint[] {
  if (waypoints.length < 2) throw new Error("need at least 2 waypoints");
  if (segmentNm <= 0) throw new Error("segmentNm must be > 0");
  const out: GeoPoint[] = [];
  for (let leg = 0; leg < waypoints.length - 1; leg++) {
    const a: GeoPoint = { lat: waypoints[leg][0], lon: waypoints[leg][1] };
    const b: GeoPoint = { lat: waypoints[leg + 1][0], lon: waypoints[leg + 1][1] };
    const n = Math.max(1, Math.ceil(haversineNm(a, b) / segmentNm)) * 2;
    for (let i = 0; i <= n; i++) {
      // Skip every leg's start except the first: it is the previous leg's end.
      if (i === 0 && leg > 0) continue;
      out.push(interpolateGreatCircle(a, b, i / n));
    }
  }
  return out;
}

// The corridor `buildForecastCache` actually samples. Server-aligned by
// default; falls back to plain spacing when the aligned corridor cannot fit
// under MAX_CORRIDOR_POINTS, which needs either a passage well past 800 NM or
// a route with dozens of legs.
export function planCorridor(waypoints: [number, number][]): GeoPoint[] {
  const aligned = serverAlignedCorridor(waypoints, serverSegmentLengthNm(waypoints));
  if (aligned.length <= MAX_CORRIDOR_POINTS) return aligned;
  const spacing = Math.max(DEFAULT_SPACING_NM, routeLengthNm(waypoints) / MAX_CORRIDOR_POINTS);
  return interpolateCorridor(waypoints, spacing);
}

// Coverage contract (mirrors the server): each segment fetch asks for
// [mid-90min, mid+90min]; the slowest plausible passage is bounded by a 2 kn
// floor (PREWARM_MIN_SPEED_KN). The window must therefore span the departure
// range plus that worst-case duration plus the +/-90 min fetch margin so every
// segment midtime the server computes falls inside the cached axis.
const MIN_SPEED_KN = 2.0;
const MARGIN_MS = 90 * 60 * 1000;

function worstCaseDurationMs(waypoints: [number, number][]): number {
  return (routeLengthNm(waypoints) / MIN_SPEED_KN) * 3600_000;
}

export function singleWindowMs(waypoints: [number, number][], departureMs: number): CacheWindow {
  return {
    startMs: departureMs - MARGIN_MS,
    endMs: departureMs + worstCaseDurationMs(waypoints) + MARGIN_MS,
  };
}

export function sweepWindowMs(
  waypoints: [number, number][],
  earliestMs: number,
  latestMs: number,
): CacheWindow {
  return {
    startMs: earliestMs - MARGIN_MS,
    endMs: latestMs + worstCaseDurationMs(waypoints) + MARGIN_MS,
  };
}

export function etaWindowMs(waypoints: [number, number][], arrivalMs: number): CacheWindow {
  return {
    startMs: arrivalMs - worstCaseDurationMs(waypoints) - MARGIN_MS,
    endMs: arrivalMs + MARGIN_MS,
  };
}

// Assemble a ForecastCache from already-fetched corridor samples. Pure (no
// network): converts every Open-Meteo Paris-naive timestamp to UTC epoch-ms via
// parisIsoToUtcMs, builds one shared ascending time axis (optionally clamped to
// `window`), index-aligns each per-model wind + sea series onto it and rounds
// every float to the precision table above. Throws
// when no sample carries a backend-mappable model, so the caller falls back to
// the live server path rather than posting an empty chain.
export function assembleForecastCache(
  samples: SampledPoint[],
  window: CacheWindow = {},
): ForecastCache {
  // 1. Shared time axis: union of every series' timestamps, clamped to window.
  const msSet = new Set<number>();
  const inWindow = (ms: number): boolean =>
    (window.startMs == null || ms >= window.startMs) &&
    (window.endMs == null || ms <= window.endMs);
  for (const s of samples) {
    for (const mf of s.models) {
      for (const t of mf.hourly.time) {
        const ms = parisIsoToUtcMs(t);
        if (inWindow(ms)) msSet.add(ms);
      }
    }
    if (s.marine) {
      for (const t of s.marine.time) {
        const ms = parisIsoToUtcMs(t);
        if (inWindow(ms)) msSet.add(ms);
      }
    }
  }
  const timesMs = Array.from(msSet).sort((a, b) => a - b);
  const n = timesMs.length;
  const idxByMs = new Map<number, number>();
  for (let i = 0; i < n; i++) idxByMs.set(timesMs[i], i);

  // 2. Per-point series, tracking slug priority by first appearance.
  const slugOrder: string[] = [];
  const seenSlug = new Set<string>();
  const points: ForecastCachePoint[] = samples.map((s) => {
    const windByModel: Record<string, CacheWindSeries> = {};
    for (const mf of s.models) {
      const slug = CACHE_MODEL_SLUGS[mf.modelName as ModelName];
      if (!slug || slug in windByModel) continue;
      const speed: (number | null)[] = new Array(n).fill(null);
      const direction: (number | null)[] = new Array(n).fill(null);
      const gust: (number | null)[] = new Array(n).fill(null);
      const h = mf.hourly;
      for (let i = 0; i < h.time.length; i++) {
        const j = idxByMs.get(parisIsoToUtcMs(h.time[i]));
        if (j == null) continue;
        speed[j] = roundOrNull(h.wind_speed_10m[i], 1);
        direction[j] = roundOrNull(h.wind_direction_10m[i], 0);
        gust[j] = roundOrNull(h.wind_gusts_10m[i], 1);
      }
      windByModel[slug] = { speed_kn: speed, direction_deg: direction, gust_kn: gust };
      if (!seenSlug.has(slug)) {
        seenSlug.add(slug);
        slugOrder.push(slug);
      }
    }
    return {
      lat: roundCoord(s.lat),
      lon: roundCoord(s.lon),
      wind_by_model: windByModel,
      sea: buildSea(s.marine, idxByMs, n),
    };
  });

  // 3. Model chain: priority by first appearance, gfs_seamless as last resort
  //    (mirrors the server's _translate_models append).
  const models = [...slugOrder];
  if (!models.includes(GFS_SLUG)) models.push(GFS_SLUG);
  if (slugOrder.length === 0) {
    throw new Error("no backend-mappable model in forecast — fall back to live fetch");
  }

  return { version: CACHE_VERSION, models, times_ms: timesMs, points };
}

function buildSea(
  marine: MarineHourly | null,
  idxByMs: Map<number, number>,
  n: number,
): CacheSea {
  const sea: CacheSea = {
    wave_height_m: new Array(n).fill(null),
    wave_period_s: new Array(n).fill(null),
    wave_direction_deg: new Array(n).fill(null),
    current_speed_kn: new Array(n).fill(null),
    current_direction_to_deg: new Array(n).fill(null),
    tide_height_m: new Array(n).fill(null),
    current_source: marine?.current_source ?? null,
  };
  if (!marine) return sea;
  for (let i = 0; i < marine.time.length; i++) {
    const j = idxByMs.get(parisIsoToUtcMs(marine.time[i]));
    if (j == null) continue;
    sea.wave_height_m[j] = roundOrNull(marine.wave_height_m[i], 2);
    sea.wave_period_s[j] = roundOrNull(marine.wave_period_s[i], 1);
    sea.wave_direction_deg[j] = roundOrNull(marine.wave_direction_deg[i], 0);
    sea.current_speed_kn[j] = roundOrNull(marine.current_speed_kn[i], 2);
    sea.current_direction_to_deg[j] = roundOrNull(marine.current_direction_to_deg[i], 0);
    sea.tide_height_m[j] = roundOrNull(marine.tide_height_m[i], 2);
  }
  return sea;
}

// Sample the route corridor in the browser and assemble the cache. Reuses
// fetchWindCorridor (multi-model wind, kn, 30-min cache, fallback chain) and
// fetchMarineCorridor (waves + SMOC currents + MARC overlay) — both one request
// for the whole corridor, both per-point cached and deduped. Throws on no
// mappable model so the caller can fall back.
// Backend-mappable models among the user's active set, in priority order. The
// cache only carries models the server can route on; an empty result means the
// user disabled every mappable model, so buildForecastCache yields no usable
// cache and the caller falls back to the live server fetch.
function mappableActiveModels(): ModelName[] {
  return activeModels(loadModelConfig()).filter((m) => CACHE_MODEL_SLUGS[m] !== undefined);
}

export async function buildForecastCache(
  waypoints: [number, number][],
  opts: { spacingNm?: number; window?: CacheWindow } = {},
): Promise<ForecastCache> {
  // An explicit spacing still wins (nothing in the app passes one today); the
  // default is the server-aligned corridor.
  const corridor =
    opts.spacingNm === undefined
      ? planCorridor(waypoints)
      : interpolateCorridor(
          waypoints,
          Math.max(opts.spacingNm, routeLengthNm(waypoints) / MAX_CORRIDOR_POINTS),
        );
  const models = mappableActiveModels();
  // Wind: ONE request per model for the whole corridor (multi-coordinate).
  // Marine: ONE request for the whole corridor too, the endpoint taking the
  // same comma-separated coordinates. The per-location MARC/SHOM overlay stays
  // per point, but is only asked for where an atlas could answer. Far fewer
  // requests than models×points → fewer browser connection waves → faster.
  const [windByCoord, marineByCoord] = await Promise.all([
    fetchWindCorridor(corridor, models),
    fetchMarineCorridor(corridor),
  ]);
  const samples: SampledPoint[] = corridor.map((p, i) => ({
    lat: p.lat,
    lon: p.lon,
    models: windByCoord[i],
    marine: marineByCoord[i],
  }));
  return assembleForecastCache(samples, opts.window);
}

// Graceful wrapper: returns undefined instead of throwing so the caller can
// fall back to the live server fetch (browser offline / rate-limited / no
// mappable model / too few waypoints). The server then fetches as before.
export async function buildForecastCacheSafe(
  waypoints: [number, number][],
  opts: { spacingNm?: number; window?: CacheWindow } = {},
): Promise<ForecastCache | undefined> {
  try {
    return await buildForecastCache(waypoints, opts);
  } catch {
    return undefined;
  }
}
