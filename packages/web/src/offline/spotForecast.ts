// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { MarineHourly, ModelForecast, Spot } from "../types";
import { fetchAllModels } from "../api/openmeteo";
import { fetchMarine } from "../api/marine";
import { nowParisHourPrefix } from "../domain/datetime";
import { forecastStore, spotKey, type ForecastStore } from "./forecastStore";
import { trimPastHours } from "./freshness";
import { requestPersistentStorage } from "./persistentStorage";

export interface SpotForecast {
  models: ModelForecast[];
  marine: MarineHourly | null;
  /** Epoch ms of the fetch when the forecast comes from the device, null
      when it was just fetched. The screens date the former. */
  cachedAt: number | null;
}

export interface SpotForecastDeps {
  fetchModels: (lat: number, lon: number) => Promise<ModelForecast[]>;
  fetchSea: (lat: number, lon: number) => Promise<MarineHourly | null>;
  store: ForecastStore;
  nowHour: () => string;
  now: () => number;
}

const defaultDeps: SpotForecastDeps = {
  fetchModels: fetchAllModels,
  fetchSea: fetchMarine,
  store: forecastStore,
  nowHour: nowParisHourPrefix,
  now: Date.now,
};

/**
 * The explorer's forecast for a spot: from the network when it answers, from
 * the device otherwise.
 *
 * - `online` false (the browser reports no link at all): straight to the
 *   device, without waiting for requests that cannot succeed.
 * - Otherwise the network first. A wind answer is kept on the device for the
 *   next time it cannot answer; an empty one (every model failed, quota
 *   spent, captive portal) falls back to the device.
 *
 * The forecast read back loses the hours already behind us
 * (`trimPastHours`); one with nothing left is no forecast.
 */
export async function loadSpotForecast(
  spot: Spot,
  options: { online: boolean; savedSpots: readonly Spot[] },
  deps: SpotForecastDeps = defaultDeps,
): Promise<SpotForecast> {
  const { latitude: lat, longitude: lon } = spot;
  let fetchedMarine: MarineHourly | null = null;
  if (options.online) {
    const [models, marine] = await Promise.all([deps.fetchModels(lat, lon), deps.fetchSea(lat, lon)]);
    if (models.length > 0) {
      const savedKeys = new Set(options.savedSpots.map((s) => spotKey(s.latitude, s.longitude)));
      void deps.store
        .save({ spot, models, marine, fetchedAt: deps.now() }, savedKeys)
        .then(() => requestPersistentStorage());
      return { models, marine, cachedAt: null };
    }
    fetchedMarine = marine;
  }
  const cached = await deps.store.load(lat, lon, deps.now());
  const trimmed = cached ? trimPastHours(cached.models, cached.marine, deps.nowHour()) : null;
  if (cached && trimmed) return { ...trimmed, cachedAt: cached.fetchedAt };
  return { models: [], marine: fetchedMarine, cachedAt: null };
}
