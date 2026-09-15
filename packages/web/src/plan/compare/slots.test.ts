// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import type { PassageReport, PassageWindow } from "../types";
import { toNaiveLocal, toTzAware } from "../../domain/datetime";
import {
  alertCount,
  autoStepHours,
  defaultSweep,
  groupByDay,
  isPlanDeparture,
  matchPreset,
  motorShare,
  presetLatest,
  sortWindows,
  spanHours,
  spanLabel,
  windowCount,
} from "./slots";

const NOW = new Date("2026-09-13T14:00:00").getTime();

const aWindow = (departure: string, over: Partial<PassageWindow> = {}): PassageWindow => ({
  departure: toTzAware(departure),
  arrival: toTzAware("2026-09-13T20:00"),
  duration_h: 5,
  distance_nm: 27.4,
  complexity: { level: 2, label: "Modéré", tws_max_kn: 14, rationale: "" },
  conditions_summary: {
    tws_min_kn: 12,
    tws_max_kn: 14,
    predominant_sail_angle: "travers",
    hs_min_m: 1.1,
    hs_max_m: 1.4,
  },
  warnings: [],
  ...over,
});

const segment = (distance_nm: number, motor_used: boolean): PassageReport["segments"][number] => ({
  start: { lat: 48.28, lon: -4.6 },
  end: { lat: 48.45, lon: -5.05 },
  distance_nm,
  bearing_deg: 300,
  start_time: toTzAware("2026-09-13T15:00"),
  end_time: toTzAware("2026-09-13T17:00"),
  tws_kn: 12,
  twd_deg: 270,
  twa_deg: 45,
  polar_speed_kn: 5,
  boat_speed_kn: 5,
  duration_h: 2,
  hs_m: 1,
  wave_derate_factor: 1,
  motor_used,
});

describe("the window and its step", () => {
  it("deduces the step from the span, so a result never waits on a choice", () => {
    expect(autoStepHours(24)).toBe(3);
    expect(autoStepHours(72)).toBe(3);
    expect(autoStepHours(168)).toBe(6);
    expect(autoStepHours(288)).toBe(12);
  });

  it("counts both bounds, like the server", () => {
    expect(windowCount(48, 3)).toBe(17);
    expect(windowCount(24, 3)).toBe(9);
    expect(windowCount(288, 12)).toBe(25);
    expect(windowCount(48, 0)).toBe(0);
  });

  it("says a span in hours up to two days, in days from three", () => {
    expect(spanLabel(3)).toBe("3 h");
    expect(spanLabel(24)).toBe("24 h");
    expect(spanLabel(48)).toBe("48 h");
    expect(spanLabel(72)).toBe("3 j");
    expect(spanLabel(288)).toBe("12 j");
  });

  it("measures a span in whole hours and tolerates junk", () => {
    expect(spanHours("2026-09-13T15:00", "2026-09-15T15:00")).toBe(48);
    expect(spanHours("nope", "2026-09-15T15:00")).toBe(0);
  });

  it("holds a preset inside the forecast horizon", () => {
    expect(presetLatest("2026-09-13T15:00", 48, NOW)).toBe("2026-09-15T15:00");
    // Twelve days from a departure two days out would leave the forecast.
    const clamped = presetLatest("2026-09-15T15:00", 288, NOW);
    expect(clamped).toBe(toNaiveLocal(new Date(NOW + 14 * 86_400_000)));
  });

  it("recognises a preset, and only a preset", () => {
    expect(matchPreset("2026-09-13T15:00", "2026-09-15T15:00")).toBe(48);
    expect(matchPreset("2026-09-13T15:00", "2026-09-16T15:00")).toBe(72);
    expect(matchPreset("2026-09-13T15:00", "2026-09-15T16:00")).toBeNull();
  });

  it("opens on the two days after the plan's departure, at the deduced step", () => {
    expect(defaultSweep("2026-09-13T15:00", NOW)).toEqual({
      earliest: "2026-09-13T15:00",
      latest: "2026-09-15T15:00",
      intervalHours: 3,
    });
  });
});

describe("reading the windows", () => {
  const windows = [
    aWindow("2026-09-14T00:00", { duration_h: 5.4, conditions_summary: { tws_min_kn: 7, tws_max_kn: 13, predominant_sail_angle: "pres", hs_min_m: 0.8, hs_max_m: 1.1 } }),
    aWindow("2026-09-13T15:00", { duration_h: 5.2 }),
    aWindow("2026-09-13T18:00", { duration_h: 4.8, conditions_summary: { tws_min_kn: 11, tws_max_kn: 16, predominant_sail_angle: "travers", hs_min_m: null, hs_max_m: null } }),
  ];

  it("sorts by departure, by duration, by the sea with the unknown last", () => {
    const at = (w: PassageWindow) => toNaiveLocal(new Date(w.departure)).slice(11);
    expect(sortWindows(windows, "departure").map(at)).toEqual(["15:00", "18:00", "00:00"]);
    expect(sortWindows(windows, "duration").map((w) => w.duration_h)).toEqual([4.8, 5.2, 5.4]);
    expect(sortWindows(windows, "sea").map(at)).toEqual(["00:00", "15:00", "18:00"]);
  });

  it("cuts the list into runs of the same day, headed again when a sort brings a day back", () => {
    const byDeparture = groupByDay(sortWindows(windows, "departure"));
    expect(byDeparture.map((g) => [g.key, g.windows.length])).toEqual([
      ["2026-09-13", 2],
      ["2026-09-14", 1],
    ]);
    const bySea = groupByDay(sortWindows(windows, "sea"));
    expect(bySea.map((g) => g.key)).toEqual(["2026-09-14", "2026-09-13"]);
  });

  it("weighs the motor share by distance, and says nothing without a passage", () => {
    const passage = {
      segments: [segment(10, true), segment(30, false)],
    } as unknown as PassageReport;
    expect(motorShare(passage)).toBe(25);
    expect(motorShare(undefined)).toBeNull();
    expect(motorShare({ segments: [] } as unknown as PassageReport)).toBeNull();
  });

  it("counts the alerts the server folded into the window", () => {
    expect(alertCount(aWindow("2026-09-13T15:00", { warnings: ["a", "b"] }))).toBe(2);
    expect(alertCount(aWindow("2026-09-13T15:00"))).toBe(0);
  });

  it("knows the plan's own departure", () => {
    expect(isPlanDeparture(aWindow("2026-09-13T15:00"), "2026-09-13T15:00")).toBe(true);
    expect(isPlanDeparture(aWindow("2026-09-13T18:00"), "2026-09-13T15:00")).toBe(false);
  });
});
