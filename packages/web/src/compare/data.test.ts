// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import type { MarineHourly, ModelForecast, Spot } from "../types";
import {
  aggregateWaves,
  aggregateWind,
  buildTimeIndex,
  circularMean,
  clampWindow,
  compareColumns,
  compareDays,
  nowColumnKey,
  rowKey,
  sameSpot,
  waveLevel,
  windLabel,
  type CompareRow,
} from "./data";

const marseille: Spot = { name: "Marseille", latitude: 43.3, longitude: 5.35 };
const toulon: Spot = { name: "Toulon", latitude: 43.1, longitude: 5.93 };

function hours(day: string, count: number): string[] {
  return Array.from({ length: count }, (_, h) => `${day}T${String(h).padStart(2, "0")}:00`);
}

function forecast(times: string[], speed: (h: number) => number | null): ModelForecast {
  return {
    modelName: "AROME",
    hourly: {
      time: times,
      wind_speed_10m: times.map((_, i) => speed(i)),
      wind_direction_10m: times.map((_, i) => (speed(i) == null ? null : 270)),
      wind_gusts_10m: times.map((_, i) => {
        const s = speed(i);
        return s == null ? null : s + 5;
      }),
      weather_code: times.map(() => 0),
    },
  };
}

describe("rowKey / sameSpot", () => {
  it("identifies a spot by its position, not its name", () => {
    expect(rowKey(marseille)).toBe("43.3,5.35");
    expect(sameSpot(marseille, { ...marseille, name: "Vieux-Port" })).toBe(true);
    expect(sameSpot(marseille, toulon)).toBe(false);
    expect(sameSpot(null, toulon)).toBe(false);
  });
});

describe("clampWindow", () => {
  it("keeps a window inside the day and at least two hours wide", () => {
    expect(clampWindow([6, 22])).toEqual([6, 22]);
    expect(clampWindow([-3, 30])).toEqual([0, 24]);
    expect(clampWindow([10, 10])).toEqual([10, 12]);
    expect(clampWindow([23, 24])).toEqual([22, 24]);
    expect(clampWindow([6.4, 21.6])).toEqual([6, 22]);
  });
});

describe("compareDays / compareColumns", () => {
  it("lists the dates of the longest series, rows without data ignored", () => {
    const rows: CompareRow[] = [
      { spot: marseille, forecast: null, marine: null },
      {
        spot: toulon,
        forecast: forecast([...hours("2026-09-06", 24), ...hours("2026-09-07", 24)], () => 8),
        marine: null,
      },
    ];
    expect(compareDays(rows)).toEqual(["2026-09-06", "2026-09-07"]);
    expect(compareDays([{ spot: marseille, forecast: null, marine: null }])).toEqual([]);
  });

  it("cuts each day's window by the step, the last column possibly shorter", () => {
    const cols = compareColumns(["2026-09-06"], 3, [6, 22]);
    expect(cols.map((c) => `${c.from}-${c.to}`)).toEqual([
      "6-9",
      "9-12",
      "12-15",
      "15-18",
      "18-21",
      "21-22",
    ]);
    expect(cols[0].first).toBe(true);
    expect(cols[1].first).toBe(false);
    expect(cols[5].times).toEqual(["2026-09-06T21:00"]);
  });

  it("gives one column per hour at the finest step, over every day", () => {
    const cols = compareColumns(["2026-09-06", "2026-09-07"], 1, [8, 14]);
    expect(cols).toHaveLength(12);
    expect(cols[6].day).toBe("2026-09-07");
    expect(cols[6].first).toBe(true);
    expect(cols[6].key).toBe("2026-09-07T08");
  });

  it("finds the column holding the current hour", () => {
    const cols = compareColumns(["2026-09-06"], 3, [6, 22]);
    expect(nowColumnKey(cols, "2026-09-06T13")).toBe("2026-09-06T12");
    expect(nowColumnKey(cols, "2026-09-06T03")).toBeNull();
  });
});

describe("circularMean", () => {
  it("averages on the circle", () => {
    expect(circularMean([350, 10])).toBe(0);
    expect(circularMean([90])).toBe(90);
    expect(circularMean([170, 190])).toBe(180);
    expect(circularMean([])).toBeNull();
    // Opposite directions cancel out: there is no mean to give.
    expect(circularMean([0, 180])).toBeNull();
  });
});

describe("aggregateWind", () => {
  const times = hours("2026-09-06", 24);
  const index = buildTimeIndex(times);

  it("folds the column into a range, its strongest gust and a mean direction", () => {
    const f = forecast(times, (h) => h);
    const agg = aggregateWind(f, index, ["2026-09-06T06:00", "2026-09-06T07:00", "2026-09-06T08:00"]);
    expect(agg).toEqual({ lo: 6, hi: 8, mid: 7, gust: 13, dir: 270 });
    expect(windLabel(agg!, 3)).toBe("6–8");
    expect(windLabel(agg!, 1)).toBe("7");
  });

  it("prints a single value when the hours agree, whatever the step", () => {
    const f = forecast(times, () => 12);
    const agg = aggregateWind(f, index, ["2026-09-06T06:00", "2026-09-06T07:00"]);
    expect(windLabel(agg!, 3)).toBe("12");
  });

  it("answers null beyond the horizon and without a forecast", () => {
    const f = forecast(times, (h) => (h < 12 ? 5 : null));
    expect(aggregateWind(f, index, ["2026-09-06T18:00", "2026-09-06T19:00"])).toBeNull();
    expect(aggregateWind(null, index, ["2026-09-06T06:00"])).toBeNull();
    // A column half inside the horizon reads the hours it has.
    expect(aggregateWind(f, index, ["2026-09-06T11:00", "2026-09-06T12:00"])?.mid).toBe(5);
  });
});

describe("aggregateWaves", () => {
  it("folds height, direction and period, one decimal each", () => {
    const times = hours("2026-09-06", 4);
    const marine: MarineHourly = {
      time: times,
      wave_height_m: [0.4, 0.6, 0.5, null],
      wave_period_s: [5, 6, null, null],
      wave_direction_deg: [180, 200, null, null],
      current_speed_kn: [null, null, null, null],
      current_direction_to_deg: [null, null, null, null],
      tide_height_m: [null, null, null, null],
    };
    const agg = aggregateWaves(marine, buildTimeIndex(times), times.slice(0, 3));
    expect(agg).toEqual({ hs: 0.5, dir: 190, period: 5.5 });
    expect(aggregateWaves(marine, buildTimeIndex(times), [times[3]])).toBeNull();
    expect(aggregateWaves(null, buildTimeIndex(times), times)).toBeNull();
  });
});

describe("waveLevel", () => {
  it("steps on the design's thresholds", () => {
    expect([0.1, 0.4, 0.8, 1.2, 2, 3].map(waveLevel)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
