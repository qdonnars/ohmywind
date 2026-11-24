// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { loadSpotForecast, type SpotForecastDeps } from "./spotForecast";
import type { CachedForecast, ForecastStore } from "./forecastStore";
import type { ModelForecast, Spot } from "../types";

const NOW = Date.UTC(2026, 10, 17, 8, 0);
const spot: Spot = { name: "Porquerolles", latitude: 43.0, longitude: 6.2 };

function model(times: string[]): ModelForecast {
  return {
    modelName: "AROME",
    hourly: {
      time: times,
      wind_speed_10m: times.map(() => 12),
      wind_direction_10m: times.map(() => 300),
      wind_gusts_10m: times.map(() => 20),
      weather_code: times.map(() => 0),
    },
  };
}

function deps(overrides: Partial<SpotForecastDeps> & { cached?: CachedForecast | null } = {}): SpotForecastDeps {
  const store: ForecastStore = {
    save: vi.fn(() => Promise.resolve()),
    load: vi.fn(() => Promise.resolve(overrides.cached ?? null)),
  };
  return {
    fetchModels: vi.fn(() => Promise.resolve([model(["2026-11-17T09:00"])])),
    fetchSea: vi.fn(() => Promise.resolve(null)),
    store,
    nowHour: () => "2026-11-17T09",
    now: () => NOW,
    ...overrides,
  };
}

const cached: CachedForecast = {
  v: 1,
  key: "43.0000,6.2000",
  spot,
  models: [model(["2026-11-16T09:00", "2026-11-17T09:00", "2026-11-17T10:00"])],
  marine: null,
  fetchedAt: NOW - 30 * 3_600_000,
  last: true,
};

describe("loadSpotForecast", () => {
  it("keeps a fresh answer on the device and shows it undated", async () => {
    const d = deps();
    const out = await loadSpotForecast(spot, { online: true, savedSpots: [] }, d);
    expect(out.cachedAt).toBeNull();
    expect(out.models).toHaveLength(1);
    expect(d.store.save).toHaveBeenCalledTimes(1);
  });

  it("offline: reads the device without asking the network, dated and trimmed", async () => {
    const d = deps({ cached });
    const out = await loadSpotForecast(spot, { online: false, savedSpots: [] }, d);
    expect(d.fetchModels).not.toHaveBeenCalled();
    expect(out.cachedAt).toBe(cached.fetchedAt);
    expect(out.models[0].hourly.time).toEqual(["2026-11-17T09:00", "2026-11-17T10:00"]);
  });

  it("falls back to the device when the network gives nothing", async () => {
    const d = deps({ cached, fetchModels: vi.fn(() => Promise.resolve([])) });
    const out = await loadSpotForecast(spot, { online: true, savedSpots: [] }, d);
    expect(out.cachedAt).toBe(cached.fetchedAt);
    expect(d.store.save).not.toHaveBeenCalled();
  });

  it("answers empty with nothing anywhere", async () => {
    const out = await loadSpotForecast(spot, { online: false, savedSpots: [] }, deps());
    expect(out).toEqual({ models: [], marine: null, cachedAt: null });
  });
});
