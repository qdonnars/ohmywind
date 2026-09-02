// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { clearWindCorridorCache, sanitizeHourly, fetchWindCorridor } from "./openmeteo";
import type { HourlyData } from "../types";

function makeHourly(
  speeds: (number | null)[],
  gusts: (number | null)[]
): HourlyData {
  const times = speeds.map((_, i) => `2026-04-26T${String(i).padStart(2, "0")}:00`);
  return {
    time: times,
    wind_speed_10m: speeds,
    wind_direction_10m: speeds.map(() => 270),
    wind_gusts_10m: gusts,
    weather_code: speeds.map(() => 1),
  };
}

describe("sanitizeHourly", () => {
  it("drops gusts that are strictly lower than wind speed (impossible)", () => {
    // Real GFS Marseille payload shape: gust < wind across the board.
    const h = makeHourly(
      [3.9, 5.3, 6.4, 6.0, 4.7],
      [1.9, 3.1, 4.5, 4.9, 5.1] // last one is fine (5.1 >= 4.7)
    );
    const out = sanitizeHourly(h);
    expect(out.wind_gusts_10m).toEqual([null, null, null, null, 5.1]);
  });

  it("keeps gusts >= wind speed unchanged (physical case)", () => {
    const h = makeHourly([10, 12, 15], [12, 14, 18]);
    const out = sanitizeHourly(h);
    expect(out.wind_gusts_10m).toEqual([12, 14, 18]);
  });

  it("keeps gusts equal to wind speed (edge case, equality is physical)", () => {
    const h = makeHourly([10, 5], [10, 5]);
    const out = sanitizeHourly(h);
    expect(out.wind_gusts_10m).toEqual([10, 5]);
  });

  it("preserves null wind speeds without flagging gust", () => {
    const h = makeHourly([null, 5, null], [3, 8, 1]);
    const out = sanitizeHourly(h);
    // index 0: wind null → cannot compare, leave gust as-is
    // index 1: 8 >= 5 OK
    // index 2: wind null → leave gust as-is
    expect(out.wind_gusts_10m).toEqual([3, 8, 1]);
  });

  it("preserves null gusts (no fabrication, leaves null as null)", () => {
    const h = makeHourly([10, 12], [null, null]);
    const out = sanitizeHourly(h);
    expect(out.wind_gusts_10m).toEqual([null, null]);
  });

  it("does not mutate the input arrays", () => {
    const speeds = [10, 5];
    const gusts = [3, 8];
    const h = makeHourly(speeds, gusts);
    const out = sanitizeHourly(h);
    expect(gusts).toEqual([3, 8]);
    expect(out.wind_gusts_10m).toEqual([null, 8]);
    expect(out.wind_gusts_10m).not.toBe(gusts);
  });

  it("passes other series through unchanged (time, direction, weather_code)", () => {
    const h = makeHourly([10], [5]);
    const out = sanitizeHourly(h);
    expect(out.time).toBe(h.time);
    expect(out.wind_direction_10m).toBe(h.wind_direction_10m);
    expect(out.weather_code).toBe(h.weather_code);
    expect(out.wind_speed_10m).toBe(h.wind_speed_10m);
  });

  it("handles arrays of mismatched length without crashing", () => {
    const h: HourlyData = {
      time: ["t0", "t1", "t2"],
      wind_speed_10m: [10, 12, 15],
      wind_direction_10m: [270, 270, 270],
      wind_gusts_10m: [3, 14], // shorter
      weather_code: [1, 1, 1],
    };
    const out = sanitizeHourly(h);
    // Index 0: 3 < 10 → null. Index 1: 14 >= 12 → keep.
    expect(out.wind_gusts_10m).toEqual([null, 14]);
  });

  it("realistic GFS Mediterranean payload: drops the broken values, leaves OK ones", () => {
    // Sampled live from GFS Marseille 2026-04-26.
    const h = makeHourly(
      [3.9, 5.3, 6.4, 6.0, 4.7, 3.8, 1.8, 1.4],
      [1.9, 3.1, 4.5, 4.9, 5.1, 5.1, 3.3, 1.6]
    );
    const out = sanitizeHourly(h);
    // 0..3: gust < wind → null. 4..7: gust >= wind → kept.
    expect(out.wind_gusts_10m).toEqual([null, null, null, null, 5.1, 5.1, 3.3, 1.6]);
  });
});

describe("fetchWindCorridor", () => {
  // The point cache lives at module scope, so each test starts from cold.
  beforeEach(() => clearWindCorridorCache());
  afterEach(() => vi.restoreAllMocks());

  function elementWithHourly(speed: number): { hourly: HourlyData } {
    return {
      hourly: {
        time: ["2026-05-01T00:00", "2026-05-01T01:00"],
        wind_speed_10m: [speed, speed],
        wind_direction_10m: [180, 180],
        wind_gusts_10m: [speed + 2, speed + 2],
        weather_code: [1, 1],
      },
    };
  }

  it("returns one ModelForecast list per coordinate from a multi-coord array", async () => {
    // 2 coords; AROME covers coord 0 only (coord 1 has no `hourly`).
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [elementWithHourly(10), {}],
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchWindCorridor(
      [
        { lat: 43.3, lon: 5.35 },
        { lat: 43.0, lon: 6.2 },
      ],
      ["AROME"],
    );

    expect(fetchMock).toHaveBeenCalledTimes(1); // one request per model, not per point
    expect(out[0].map((m) => m.modelName)).toEqual(["AROME"]);
    expect(out[0][0].hourly.wind_speed_10m).toEqual([10, 10]);
    expect(out[1]).toEqual([]); // coord outside grid → omitted, server falls back
  });

  it("normalizes a single-coordinate object response into an array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => elementWithHourly(7), // bare object, not an array
    }));
    const out = await fetchWindCorridor([{ lat: 43.3, lon: 5.35 }], ["ICON"]);
    expect(out[0].map((m) => m.modelName)).toEqual(["ICON"]);
  });

  it("short-circuits with empty coords or models (no fetch)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchWindCorridor([], ["AROME"])).toEqual([]);
    expect(await fetchWindCorridor([{ lat: 1, lon: 2 }], [])).toEqual([[]]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves a fully cached corridor without a single request", async () => {
    const coords = [
      { lat: 43.3, lon: 5.35 },
      { lat: 43.0, lon: 6.2 },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [elementWithHourly(10), elementWithHourly(12)],
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchWindCorridor(coords, ["AROME"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await fetchWindCorridor(coords, ["AROME"]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second request
    expect(second[0][0].hourly.wind_speed_10m).toEqual([10, 10]);
    expect(second[1][0].hourly.wind_speed_10m).toEqual([12, 12]);
    expect(second).toEqual(first);
  });

  it("requests only the points it is missing, and maps them back in order", async () => {
    const a = { lat: 43.3, lon: 5.35 };
    const b = { lat: 43.0, lon: 6.2 };
    const c = { lat: 42.8, lon: 6.9 };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => [elementWithHourly(10), elementWithHourly(12)] })
      .mockResolvedValueOnce({ json: async () => [elementWithHourly(14)] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchWindCorridor([a, b], ["AROME"]);
    const out = await fetchWindCorridor([a, b, c], ["AROME"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second request carries the missing point only.
    const secondUrl = String(fetchMock.mock.calls[1][0]);
    expect(secondUrl).toContain("latitude=42.8&longitude=6.9");
    // ...and its single element lands on index 2, not index 0.
    expect(out[0][0].hourly.wind_speed_10m).toEqual([10, 10]);
    expect(out[1][0].hourly.wind_speed_10m).toEqual([12, 12]);
    expect(out[2][0].hourly.wind_speed_10m).toEqual([14, 14]);
  });

  it("keys the cache on the model chain, not on the coordinates alone", async () => {
    const coords = [{ lat: 43.3, lon: 5.35 }];
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => [elementWithHourly(9)] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchWindCorridor(coords, ["AROME"]);
    await fetchWindCorridor(coords, ["AROME", "ICON"]);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 for AROME, then 2 for the pair
  });

  it("does not cache a batch whose request threw", async () => {
    const coords = [{ lat: 43.3, lon: 5.35 }];
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ json: async () => [elementWithHourly(8)] });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchWindCorridor(coords, ["AROME"])).toEqual([[]]);
    const retry = await fetchWindCorridor(coords, ["AROME"]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // retried, not served from cache
    expect(retry[0][0].hourly.wind_speed_10m).toEqual([8, 8]);
  });

  it("caches an empty answer: a point outside every grid is a real answer", async () => {
    const coords = [{ lat: 55.7, lon: 12.6 }]; // Danish coast, outside AROME
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => [{}] });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchWindCorridor(coords, ["AROME"])).toEqual([[]]);
    expect(await fetchWindCorridor(coords, ["AROME"])).toEqual([[]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
