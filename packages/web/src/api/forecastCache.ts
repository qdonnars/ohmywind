// Builds the `forecast_cache` payload posted to the backend so passage planning
// reads weather the BROWSER fetched (one Open-Meteo call per user IP) instead of
// the HF Space's single IP. The server keeps full authority over segmentation;
// it reads this cache through a nearest-neighbour adapter (see
// packages/data-adapters/.../adapters/cache_backed.py). The cache is optional:
// when absent or the build fails, the server falls back to its live fetch, and
// MCP clients (no browser) always use the live path.

import type { ModelForecast, MarineHourly } from "../types";
import type { ModelName } from "../config/modelConfig";
import { fetchAllModels } from "./openmeteo";
import { fetchMarine, parisIsoToUtcMs } from "./marine";
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

// Generous cap on corridor sample points. The browser has its own Open-Meteo
// quota (~600/min per IP), so we sample far denser than the server's ~10-segment
// budget; this only guards pathologically long routes from issuing hundreds of
// requests. Beyond it, spacing stretches.
const MAX_CORRIDOR_POINTS = 60;
const DEFAULT_SPACING_NM = 5;

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

function roundOrNull(v: number | null | undefined, dp: number): number | null {
  if (v == null) return null;
  return Number(v.toFixed(dp));
}

// Interpolate sample points along the waypoint polyline at ~spacingNm, denser
// than the server's segmentation so every server segment midpoint has a near
// corridor sample. Mirrors segment_route: n = max(1, ceil(d/spacing)) per leg,
// endpoints hit the waypoints, shared waypoints between legs are not duplicated.
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
// `window`), and index-aligns each per-model wind + sea series onto it. Throws
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
    return { lat: s.lat, lon: s.lon, wind_by_model: windByModel, sea: buildSea(s.marine, idxByMs, n) };
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
// fetchAllModels (multi-model wind, kn, 30-min cache, fallback chain) and
// fetchMarine (waves + SMOC currents + MARC overlay) — both already per-point
// cached and deduped. Throws on no mappable model so the caller can fall back.
export async function buildForecastCache(
  waypoints: [number, number][],
  opts: { spacingNm?: number; window?: CacheWindow } = {},
): Promise<ForecastCache> {
  const totalNm = routeLengthNm(waypoints);
  const spacing = Math.max(opts.spacingNm ?? DEFAULT_SPACING_NM, totalNm / MAX_CORRIDOR_POINTS);
  const corridor = interpolateCorridor(waypoints, spacing);
  const samples: SampledPoint[] = await Promise.all(
    corridor.map(async (p) => {
      const [models, marine] = await Promise.all([
        fetchAllModels(p.lat, p.lon),
        fetchMarine(p.lat, p.lon),
      ]);
      return { lat: p.lat, lon: p.lon, models, marine };
    }),
  );
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
