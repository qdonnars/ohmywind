// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import {
  FORECAST_CACHE_VERSION,
  MAX_AGE_MS,
  MAX_SAVED_SPOTS,
  createForecastStore,
  entriesToPurge,
  parseCachedForecast,
  spotKey,
  type ForecastBackend,
} from "./forecastStore";
import type { MarineHourly, ModelForecast, Spot } from "../types";

const NOW = Date.UTC(2026, 10, 17, 8, 0);
const HOUR = 3_600_000;

function model(name = "AROME"): ModelForecast {
  return {
    modelName: name,
    hourly: {
      time: ["2026-11-17T09:00", "2026-11-17T10:00"],
      wind_speed_10m: [12, 14],
      wind_direction_10m: [270, 280],
      wind_gusts_10m: [18, 20],
      weather_code: [1, 2],
    },
  };
}

const marine: MarineHourly = {
  time: ["2026-11-17T09:00", "2026-11-17T10:00"],
  wave_height_m: [1.2, 1.4],
  wave_period_s: [7, 7],
  wave_direction_deg: [260, 260],
  current_speed_kn: [0.4, 0.5],
  current_direction_to_deg: [90, 95],
  tide_height_m: [0.3, 0.6],
};

const spot = (lat: number, lon: number, name = "spot"): Spot => ({ name, latitude: lat, longitude: lon });

/** The backend as a Map, with what JSON would do to it (IndexedDB clones). */
function memoryBackend(map = new Map<string, unknown>()): ForecastBackend & { map: Map<string, unknown> } {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    map,
    async get(key) {
      return map.has(key) ? clone(map.get(key)) : undefined;
    },
    async getAll() {
      return [...map.values()].map(clone);
    },
    async write(put, remove) {
      for (const v of put) map.set((v as { key: string }).key, clone(v));
      for (const k of remove) map.delete(k);
    },
  };
}

describe("parseCachedForecast", () => {
  it("round-trips an entry through serialisation", () => {
    const entry = {
      v: FORECAST_CACHE_VERSION,
      key: spotKey(48.39, -4.49),
      spot: spot(48.39, -4.49, "Brest"),
      models: [model()],
      marine,
      fetchedAt: NOW,
      last: true,
    };
    expect(parseCachedForecast(JSON.parse(JSON.stringify(entry)))).toEqual(entry);
  });

  it("keeps a spot whose sea forecast failed", () => {
    const entry = { v: 1, key: "k", spot: spot(1, 2), models: [model()], marine: null, fetchedAt: NOW };
    expect(parseCachedForecast(entry)?.marine).toBeNull();
  });

  it("refuses what this build cannot read", () => {
    const ok = { v: 1, key: "k", spot: spot(1, 2), models: [model()], marine: null, fetchedAt: NOW };
    expect(parseCachedForecast(null)).toBeNull();
    expect(parseCachedForecast({ ...ok, v: 2 })).toBeNull();
    expect(parseCachedForecast({ ...ok, fetchedAt: "yesterday" })).toBeNull();
    expect(parseCachedForecast({ ...ok, models: [{ modelName: "X" }] })).toBeNull();
    expect(parseCachedForecast({ ...ok, marine: { time: "nope" } })).toBeNull();
    expect(parseCachedForecast({ ...ok, spot: { name: "x" } })).toBeNull();
  });
});

describe("entriesToPurge", () => {
  it("keeps the last spot even unsaved, drops the other unsaved ones", () => {
    const drop = entriesToPurge(
      [
        { key: "last", fetchedAt: NOW, last: true },
        { key: "preview", fetchedAt: NOW - HOUR },
        { key: "saved", fetchedAt: NOW - HOUR },
      ],
      new Set(["saved"]),
      NOW,
    );
    expect(drop).toEqual(["preview"]);
  });

  it("drops anything past the forecast horizon, saved or last", () => {
    const old = NOW - MAX_AGE_MS;
    const drop = entriesToPurge(
      [
        { key: "last", fetchedAt: old, last: true },
        { key: "saved", fetchedAt: old },
        { key: "broken", fetchedAt: -Infinity },
      ],
      new Set(["saved"]),
      NOW,
    );
    expect(drop.sort()).toEqual(["broken", "last", "saved"]);
  });

  it("caps the saved spots, the most recently fetched first", () => {
    const entries = Array.from({ length: MAX_SAVED_SPOTS + 3 }, (_, i) => ({ key: `s${i}`, fetchedAt: NOW - i * HOUR }));
    const drop = entriesToPurge(entries, new Set(entries.map((e) => e.key)), NOW);
    expect(drop).toEqual([`s${MAX_SAVED_SPOTS}`, `s${MAX_SAVED_SPOTS + 1}`, `s${MAX_SAVED_SPOTS + 2}`]);
  });
});

describe("createForecastStore", () => {
  it("writes, reads back and purges on the next write", async () => {
    const backend = memoryBackend();
    const store = createForecastStore(backend);
    const a = spot(43.1, 5.9, "A");
    const b = spot(43.2, 6.0, "B");

    await store.save({ spot: a, models: [model()], marine, fetchedAt: NOW }, new Set(), NOW);
    const read = await store.load(43.1, 5.9, NOW);
    expect(read?.spot.name).toBe("A");
    expect(read?.models[0].hourly.wind_speed_10m).toEqual([12, 14]);
    expect(read?.fetchedAt).toBe(NOW);

    // A is neither saved nor last any more: gone.
    await store.save({ spot: b, models: [model()], marine: null, fetchedAt: NOW }, new Set(), NOW);
    expect(await store.load(43.1, 5.9, NOW)).toBeNull();
    expect((await store.load(43.2, 6.0, NOW))?.last).toBe(true);
    expect(backend.map.size).toBe(1);
  });

  it("keeps a saved spot after another one is looked at", async () => {
    const backend = memoryBackend();
    const store = createForecastStore(backend);
    const a = spot(43.1, 5.9, "A");
    await store.save({ spot: a, models: [model()], marine, fetchedAt: NOW }, new Set(), NOW);
    await store.save(
      { spot: spot(43.2, 6.0), models: [model()], marine, fetchedAt: NOW },
      new Set([spotKey(43.1, 5.9)]),
      NOW,
    );
    const kept = await store.load(43.1, 5.9, NOW);
    expect(kept?.spot.name).toBe("A");
    expect(kept?.last).toBe(false);
  });

  it("answers null for a forecast past its horizon, and on a broken storage", async () => {
    const store = createForecastStore(memoryBackend());
    await store.save({ spot: spot(1, 1), models: [model()], marine, fetchedAt: NOW }, new Set(), NOW);
    expect(await store.load(1, 1, NOW + MAX_AGE_MS)).toBeNull();

    const broken = createForecastStore({
      get: () => Promise.reject(new Error("no idb")),
      getAll: () => Promise.reject(new Error("no idb")),
      write: () => Promise.reject(new Error("no idb")),
    });
    await expect(broken.save({ spot: spot(1, 1), models: [], marine: null, fetchedAt: NOW }, new Set())).resolves.toBeUndefined();
    expect(await broken.load(1, 1)).toBeNull();
  });

  it("clears an unreadable entry left by another build", async () => {
    const backend = memoryBackend(new Map([["old", { key: "old", v: 99 }]]));
    const store = createForecastStore(backend);
    await store.save({ spot: spot(2, 2), models: [model()], marine, fetchedAt: NOW }, new Set(["old"]), NOW);
    expect(backend.map.has("old")).toBe(false);
  });
});
