// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import type { ModelForecast, Spot } from "../types";
import { compareTimeline, resolveHour, rowKey, sameSpot, type CompareRow } from "./data";

const marseille: Spot = { name: "Marseille", latitude: 43.3, longitude: 5.35 };
const toulon: Spot = { name: "Toulon", latitude: 43.1, longitude: 5.93 };

function forecast(modelName: string, times: string[]): ModelForecast {
  return {
    modelName,
    hourly: {
      time: times,
      wind_speed_10m: times.map(() => 10),
      wind_direction_10m: times.map(() => 270),
      wind_gusts_10m: times.map(() => 15),
      weather_code: times.map(() => 0),
    },
  };
}

function hours(day: string, count: number): string[] {
  return Array.from({ length: count }, (_, h) => `${day}T${String(h).padStart(2, "0")}:00`);
}

describe("rowKey / sameSpot", () => {
  it("identifies a spot by its position, not its name", () => {
    expect(rowKey(marseille)).toBe("43.3,5.35");
    expect(sameSpot(marseille, { ...marseille, name: "Vieux-Port" })).toBe(true);
    expect(sameSpot(marseille, toulon)).toBe(false);
    expect(sameSpot(null, toulon)).toBe(false);
  });
});

describe("compareTimeline", () => {
  it("takes the longest series and the finest step among the rows", () => {
    const rows: CompareRow[] = [
      { spot: marseille, forecast: forecast("AROME", hours("2026-09-06", 24)), marine: null },
      { spot: toulon, forecast: forecast("GFS", hours("2026-09-06", 12)), marine: null },
    ];
    const timeline = compareTimeline(rows);
    // AROME is hourly, so every hour of the longer series is a column.
    expect(timeline).toHaveLength(24);
    expect(timeline[1]).toBe("2026-09-06T01:00");
  });

  it("thins to the model step when no hourly model is read", () => {
    const rows: CompareRow[] = [
      { spot: marseille, forecast: forecast("GFS", hours("2026-09-06", 24)), marine: null },
    ];
    const timeline = compareTimeline(rows);
    expect(timeline.length).toBeLessThan(24);
    expect(timeline[0]).toBe("2026-09-06T00:00");
    for (const t of timeline) {
      expect(parseInt(t.slice(11, 13)) % 3).toBe(0);
    }
  });

  it("ignores a spot outside every model", () => {
    const rows: CompareRow[] = [
      { spot: marseille, forecast: null, marine: null },
      { spot: toulon, forecast: forecast("AROME", hours("2026-09-06", 6)), marine: null },
    ];
    expect(compareTimeline(rows)).toHaveLength(6);
    expect(compareTimeline([{ spot: marseille, forecast: null, marine: null }])).toEqual([]);
  });
});

describe("resolveHour", () => {
  const timeline = hours("2026-09-06", 24);

  it("keeps the reader's pick while it is on the timeline and not past", () => {
    expect(resolveHour("2026-09-06T14:00", timeline, "2026-09-06T09")).toBe("2026-09-06T14:00");
  });

  it("falls back to the current hour when the pick slid into the past", () => {
    expect(resolveHour("2026-09-06T03:00", timeline, "2026-09-06T09")).toBe("2026-09-06T09:00");
  });

  it("falls back to the first hour to come when the current one has no column", () => {
    const sparse = timeline.filter((t) => parseInt(t.slice(11, 13)) % 3 === 0);
    expect(resolveHour(null, sparse, "2026-09-06T10")).toBe("2026-09-06T12:00");
  });

  it("answers null on an empty timeline", () => {
    expect(resolveHour(null, [], "2026-09-06T10")).toBeNull();
  });
});
