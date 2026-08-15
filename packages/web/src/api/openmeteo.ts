// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ModelForecast, HourlyData, GeocodingResult } from "../types";
import {
  ACTIVE_LIMIT,
  activeModels,
  loadModelConfig,
  type ModelName,
} from "../config/modelConfig";

const MODEL_ENDPOINTS: Record<ModelName, { endpoint: string; extraParams?: string }> = {
  AROME: {
    // arome_france_hd is the 1.5 km high-resolution Météo-France AROME. The
    // 2.5 km arome_france variant was dropped: same horizon, same cadence,
    // lower resolution, and 1.5 km better captures coastal sheltering and
    // thermal effects on complex terrain (Med, Bretagne sud).
    endpoint: "https://api.open-meteo.com/v1/meteofrance",
    extraParams: "&models=arome_france_hd",
  },
  ARPEGE_EU: {
    endpoint: "https://api.open-meteo.com/v1/meteofrance",
    extraParams: "&models=arpege_europe",
  },
  ARPEGE_W: {
    endpoint: "https://api.open-meteo.com/v1/meteofrance",
    extraParams: "&models=arpege_world",
  },
  ICON: { endpoint: "https://api.open-meteo.com/v1/dwd-icon" },
  ICON_GLOBAL: {
    endpoint: "https://api.open-meteo.com/v1/dwd-icon",
    extraParams: "&models=icon_global",
  },
  ICON_D2: {
    endpoint: "https://api.open-meteo.com/v1/dwd-icon",
    extraParams: "&models=icon_d2",
  },
  ECMWF: { endpoint: "https://api.open-meteo.com/v1/ecmwf" },
  ECMWF_AIFS: {
    endpoint: "https://api.open-meteo.com/v1/ecmwf",
    extraParams: "&models=ecmwf_aifs025",
  },
  GFS: { endpoint: "https://api.open-meteo.com/v1/gfs" },
  UKMO: {
    endpoint: "https://api.open-meteo.com/v1/ukmo",
    extraParams: "&models=ukmo_global_deterministic_10km",
  },
  UKMO_UK: {
    endpoint: "https://api.open-meteo.com/v1/ukmo",
    extraParams: "&models=ukmo_uk_deterministic_2km",
  },
  GEM: { endpoint: "https://api.open-meteo.com/v1/gem" },
  DMI_HARMONIE: {
    // DMI has no dedicated /v1/dmi endpoint on Open-Meteo; we route via the
    // unified /v1/forecast endpoint with an explicit `&models=` filter. A
    // single-model request still returns unsuffixed `hourly.*` keys, so the
    // existing payload parser works unchanged.
    endpoint: "https://api.open-meteo.com/v1/forecast",
    extraParams: "&models=dmi_harmonie_arome_europe",
  },
  METNO_NORDIC: { endpoint: "https://api.open-meteo.com/v1/metno" },
};

const PARAMS =
  "hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day&wind_speed_unit=kn&timezone=Europe/Paris&forecast_days=7";

const cache = new Map<string, { models: ModelForecast[]; fetchedAt: number }>();
const CACHE_TTL = 30 * 60 * 1000;

/**
 * Sanitize the gust series so that physically impossible values (gust < wind)
 * are dropped to `null`.
 *
 * Why this is needed: GFS surface gust diagnostics are unreliable in the
 * Mediterranean at low-to-moderate wind speeds — Open-Meteo passes them through
 * as-is, so we can routinely observe `wind_gusts_10m < wind_speed_10m` in the
 * upstream payload (verified live, see PR 1.1). A gust by definition is the
 * maximum wind over the preceding interval, so it cannot be lower than the
 * mean wind speed.
 *
 * We do not fabricate a value (no clamping to wind speed): we drop the gust
 * to `null`, and the front renders the cell with the wind speed only. This
 * keeps the UI honest about missing data rather than displaying a synthetic
 * gust equal to the mean wind.
 *
 * Mutates a shallow copy of `hourly` and returns it. Other arrays (time,
 * direction, weather_code) are passed through unchanged.
 */
export function sanitizeHourly(hourly: HourlyData): HourlyData {
  const speeds = hourly.wind_speed_10m;
  const gusts = hourly.wind_gusts_10m;
  const len = Math.min(speeds.length, gusts.length);

  const cleanedGusts: (number | null)[] = new Array(gusts.length);
  for (let i = 0; i < gusts.length; i++) {
    cleanedGusts[i] = gusts[i];
  }
  for (let i = 0; i < len; i++) {
    const w = speeds[i];
    const g = gusts[i];
    if (w != null && g != null && g < w) {
      cleanedGusts[i] = null;
    }
  }

  return {
    ...hourly,
    wind_gusts_10m: cleanedGusts,
  };
}

// Fetch a single model's wind forecast. Returns null when the upstream call
// fails OR when the payload has no ``hourly`` block (typical Open-Meteo
// response shape when the requested point is outside the model grid, e.g.
// AROME France queried at the Danish coast). The caller uses null to drive
// the per-slot fallback to the next priority model.
async function fetchOneModel(
  name: ModelName,
  base: string,
): Promise<ModelForecast | null> {
  const endpoint = MODEL_ENDPOINTS[name];
  try {
    const resp = await fetch(`${endpoint.endpoint}${base}${endpoint.extraParams || ""}`);
    const data = await resp.json();
    if (!data.hourly) return null;
    return { modelName: name, hourly: sanitizeHourly(data.hourly) };
  } catch {
    return null;
  }
}

export async function fetchAllModels(
  lat: number,
  lon: number
): Promise<ModelForecast[]> {
  const config = loadModelConfig();
  const top = activeModels(config);
  const fallbackPool = config.order.slice(ACTIVE_LIMIT);
  // Cache key includes the FULL order (not just the active subset) because
  // the fallback chain depends on what comes after the top N. Two users with
  // the same top 4 but different "Ignorés" lists would resolve to different
  // tables on a spot where one of the top 4 doesn't cover.
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}|${config.order.join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.models;
  }

  const base = `?latitude=${lat}&longitude=${lon}&${PARAMS}`;

  // Phase 1: fire the top N models in parallel (preserves the previous
  // behaviour when the spot is fully covered).
  const phase1 = await Promise.all(top.map((m) => fetchOneModel(m, base)));

  // Phase 2: for each top slot that came back null, walk the user's
  // "Ignorés" list sequentially until one returns data. Each fallback
  // model is consumed at most once (so two failed top slots won't both
  // try to claim the same fallback).
  const pool = [...fallbackPool];
  const slots: (ModelForecast | null)[] = phase1.slice();
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] != null) continue;
    const originalSlot = top[i];
    while (pool.length > 0) {
      const candidate = pool.shift() as ModelName;
      const data = await fetchOneModel(candidate, base);
      if (data != null) {
        slots[i] = { ...data, fellBackFrom: originalSlot };
        break;
      }
    }
  }

  // Drop slots where even the full fallback pool didn't yield a covering
  // model (rare: would need a spot outside every grid in the user's config).
  const models = slots.filter((s): s is ModelForecast => s != null);
  cache.set(cacheKey, { models, fetchedAt: Date.now() });
  return models;
}

// Fetch wind for a whole route corridor in one request PER MODEL, using
// Open-Meteo's multi-coordinate support (comma-separated latitude/longitude →
// a JSON array, one element per coordinate, order preserved). This collapses
// the corridor's wind fetch from models×points requests down to `models`
// requests, which matters because the browser caps ~6 concurrent connections
// per host: fewer requests = fewer serialized waves = lower wall-clock.
//
// Returns, per coordinate (same order as `coords`), the list of ModelForecast
// that returned data there. A model with no `hourly` at a coordinate (point
// outside its grid) is simply omitted for that coordinate; the server's
// per-segment fallback chain handles the gap. No per-slot substitution here
// (unlike fetchAllModels) — the corridor cache carries the full model chain,
// so coverage falls back server-side instead.
export async function fetchWindCorridor(
  coords: { lat: number; lon: number }[],
  models: ModelName[],
): Promise<ModelForecast[][]> {
  const out: ModelForecast[][] = coords.map(() => []);
  if (coords.length === 0 || models.length === 0) return out;

  const lats = coords.map((c) => c.lat).join(",");
  const lons = coords.map((c) => c.lon).join(",");
  const base = `?latitude=${lats}&longitude=${lons}&${PARAMS}`;

  const perModel = await Promise.all(
    models.map(async (name) => {
      const endpoint = MODEL_ENDPOINTS[name];
      try {
        const resp = await fetch(`${endpoint.endpoint}${base}${endpoint.extraParams || ""}`);
        const data = await resp.json();
        // Multi-coordinate → array; a 1-coord request may come back as a bare
        // object, so normalize to an array aligned to `coords`.
        const arr: unknown[] = Array.isArray(data) ? data : [data];
        return { name, arr };
      } catch {
        return { name, arr: [] as unknown[] };
      }
    }),
  );

  for (const { name, arr } of perModel) {
    for (let i = 0; i < coords.length; i++) {
      const el = arr[i] as { hourly?: HourlyData } | undefined;
      if (el && el.hourly) {
        out[i].push({ modelName: name, hourly: sanitizeHourly(el.hourly) });
      }
    }
  }
  return out;
}

export async function searchSpots(
  query: string
): Promise<GeocodingResult[]> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=fr`
  );
  const data = await res.json();
  return data.results || [];
}
