// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import {
  FORECAST_STALE_WARNING_HOURS,
  forecastAgeHours,
  isForecastStale,
  trimPastHours,
} from "./freshness";
import type { MarineHourly, ModelForecast } from "../types";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 17, 8, 0);

const times = ["2026-11-16T22:00", "2026-11-16T23:00", "2026-11-17T00:00", "2026-11-17T01:00"];

function model(): ModelForecast {
  return {
    modelName: "AROME",
    hourly: {
      time: times,
      wind_speed_10m: [10, 11, 12, 13],
      wind_direction_10m: [200, 210, 220, 230],
      wind_gusts_10m: [15, 16, 17, 18],
      weather_code: [0, 1, 2, 3],
      is_day: [0, 0, 0, 0],
    },
  };
}

const marine: MarineHourly = {
  time: times,
  wave_height_m: [1, 1.1, 1.2, 1.3],
  wave_period_s: [6, 6, 7, 7],
  wave_direction_deg: [250, 250, 260, 260],
  current_speed_kn: [0.1, 0.2, 0.3, 0.4],
  current_direction_to_deg: [10, 20, 30, 40],
  tide_height_m: [0.5, 0.2, -0.1, -0.3],
  tide_height_zh_m: [3.5, 3.2, 2.9, 2.7],
  z0_hydro_m: 3,
  current_source: "marc_finis_250m",
};

describe("staleness", () => {
  it("warns only past the threshold", () => {
    const limit = FORECAST_STALE_WARNING_HOURS * HOUR;
    expect(isForecastStale(NOW - limit, NOW)).toBe(false);
    expect(isForecastStale(NOW - limit - 1, NOW)).toBe(true);
  });

  it("counts whole hours, never below zero", () => {
    expect(forecastAgeHours(NOW - 49.5 * HOUR, NOW)).toBe(49);
    expect(forecastAgeHours(NOW + HOUR, NOW)).toBe(0);
  });
});

describe("trimPastHours", () => {
  it("masks the hours behind us, the current one kept, on every aligned series", () => {
    const out = trimPastHours([model()], marine, "2026-11-17T00");
    expect(out).not.toBeNull();
    const h = out!.models[0].hourly;
    expect(h.time).toEqual(["2026-11-17T00:00", "2026-11-17T01:00"]);
    expect(h.wind_speed_10m).toEqual([12, 13]);
    expect(h.wind_gusts_10m).toEqual([17, 18]);
    expect(h.is_day).toEqual([0, 0]);
    expect(out!.marine!.tide_height_zh_m).toEqual([2.9, 2.7]);
    expect(out!.marine!.current_speed_kn).toEqual([0.3, 0.4]);
    // Scalars are not series.
    expect(out!.marine!.z0_hydro_m).toBe(3);
    expect(out!.marine!.current_source).toBe("marc_finis_250m");
  });

  it("leaves a forecast that starts now untouched", () => {
    const out = trimPastHours([model()], marine, "2026-11-16T20");
    expect(out!.models[0].hourly.time).toEqual(times);
  });

  it("has nothing to show once every hour has passed", () => {
    expect(trimPastHours([model()], marine, "2026-11-18T00")).toBeNull();
  });

  it("drops the sea alone when only the sea has run out", () => {
    const shortSea = { ...marine, time: times.slice(0, 2), wave_height_m: [1, 1.1] };
    const out = trimPastHours([model()], shortSea, "2026-11-17T00");
    expect(out!.marine).toBeNull();
    expect(out!.models).toHaveLength(1);
  });
});
