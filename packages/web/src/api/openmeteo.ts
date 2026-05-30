import type { ModelForecast, HourlyData, GeocodingResult } from "../types";
import {
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

export async function fetchAllModels(
  lat: number,
  lon: number
): Promise<ModelForecast[]> {
  const config = loadModelConfig();
  const selected = activeModels(config);
  // Cache key includes the active model list so that reordering or swapping
  // models in /config doesn't return a stale subset on the next page load.
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}|${selected.join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.models;
  }

  const base = `?latitude=${lat}&longitude=${lon}&${PARAMS}`;

  const results = await Promise.allSettled<ModelForecast>(
    selected.map((name) => {
      const model = MODEL_ENDPOINTS[name];
      return fetch(`${model.endpoint}${base}${model.extraParams || ""}`)
        .then((r) => r.json())
        .then((data): ModelForecast => ({
          modelName: name,
          hourly: data.hourly ? sanitizeHourly(data.hourly) : data.hourly,
        }));
    })
  );

  // Promise.allSettled preserves input order, so the user's configured order
  // flows through to the WindTable rendering loop.
  const models = results
    .filter(
      (r): r is PromiseFulfilledResult<ModelForecast> =>
        r.status === "fulfilled" && r.value.hourly != null
    )
    .map((r) => r.value);

  cache.set(cacheKey, { models, fetchedAt: Date.now() });
  return models;
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
