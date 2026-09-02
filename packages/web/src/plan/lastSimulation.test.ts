// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import {
  parseLastSimulation,
  waypointsEqual,
  LAST_SIMULATION_VERSION,
  LAST_SIMULATION_LIMITS,
} from "./lastSimulation";
import type { LastSimulation } from "./lastSimulation";
import type { PassageReport, ComplexityScore, PassageWindow } from "./types";

const passage = (): PassageReport => ({
  archetype: "cruiser_30ft",
  departure_time: "2026-09-03T08:00:00+02:00",
  arrival_time: "2026-09-03T18:00:00+02:00",
  duration_h: 10,
  distance_nm: 55,
  efficiency: 0.75,
  model: "meteofrance_arome_france_hd",
  segments: [{ distance_nm: 55 }] as unknown as PassageReport["segments"],
  warnings: [],
});

const complexity = (): ComplexityScore => ({
  level: 2,
  label: "Modéré",
  wind_level: 2,
  wind_label: "Modéré",
  sea_level: 1,
  sea_label: "Calme",
  tws_max_kn: 14,
  hs_max_m: 0.8,
  rationale: "",
});

const window_ = (i: number): PassageWindow => ({
  departure: `2026-09-0${(i % 9) + 1}T08:00:00+02:00`,
  arrival: `2026-09-0${(i % 9) + 1}T18:00:00+02:00`,
  duration_h: 10,
  distance_nm: 55,
  complexity: { level: 2, label: "Modéré", tws_max_kn: 14, rationale: "" },
  conditions_summary: {
    tws_min_kn: 8,
    tws_max_kn: 14,
    predominant_sail_angle: "largue",
    hs_min_m: 0.3,
    hs_max_m: 0.8,
  },
  warnings: [],
});

const full = (over: Partial<LastSimulation> = {}): LastSimulation => ({
  v: LAST_SIMULATION_VERSION,
  waypoints: [
    [43.29, 5.37],
    [43.0, 6.2],
  ],
  archetype: "cruiser_30ft",
  configFingerprint: "arome|cruiser_30ft||c0.75",
  mode: "single",
  single: {
    departure: "2026-09-03T08:00",
    passage: passage(),
    complexity: complexity(),
    forecastUpdatedAt: "2026-09-02T06:00:00Z",
  },
  cachedAt: 1_756_000_000_000,
  ...over,
});

describe("parseLastSimulation", () => {
  it("round-trips a well formed payload", () => {
    const parsed = parseLastSimulation(JSON.stringify(full()));
    expect(parsed?.waypoints).toEqual([
      [43.29, 5.37],
      [43.0, 6.2],
    ]);
    expect(parsed?.single?.passage.distance_nm).toBe(55);
    expect(parsed?.v).toBe(LAST_SIMULATION_VERSION);
  });

  it.each([
    ["not JSON at all", "{nope"],
    ["a JSON scalar", '"nope"'],
    ["a JSON array", "[1,2,3]"],
    ["no waypoints", JSON.stringify({ ...full(), waypoints: undefined })],
    ["waypoints that are not pairs", JSON.stringify({ ...full(), waypoints: [[1]] })],
    [
      "waypoints out of range",
      JSON.stringify({ ...full(), waypoints: [[999, 5]] }),
    ],
    ["no archetype", JSON.stringify({ ...full(), archetype: "" })],
    ["no cachedAt", JSON.stringify({ ...full(), cachedAt: "hier" })],
    ["a version from the future", JSON.stringify({ ...full(), v: 99 })],
  ])("rejects %s", (_label, raw) => {
    expect(parseLastSimulation(raw)).toBeNull();
  });

  it("accepts a legacy payload with no version field", () => {
    const legacy = full();
    delete legacy.v;
    expect(parseLastSimulation(JSON.stringify(legacy))?.v).toBe(LAST_SIMULATION_VERSION);
  });

  it("infers compare mode on a legacy payload that only has a sweep", () => {
    const legacy = {
      ...full({ single: undefined }),
      mode: undefined,
      compare: {
        sweepEarliest: "2026-09-03T08:00",
        sweepLatest: "2026-09-05T08:00",
        sweepIntervalHours: 3,
        windows: [window_(0)],
        metaWarnings: [],
        forecastUpdatedAt: "2026-09-02T06:00:00Z",
      },
    };
    expect(parseLastSimulation(JSON.stringify(legacy))?.mode).toBe("compare");
  });

  it("infers single mode on a legacy payload with no mode and no sweep", () => {
    const legacy = { ...full(), mode: undefined };
    expect(parseLastSimulation(JSON.stringify(legacy))?.mode).toBe("single");
  });

  it("drops a corrupted single block but keeps the route", () => {
    const broken = full({
      single: { departure: "2026-09-03T08:00" } as unknown as LastSimulation["single"],
    });
    const parsed = parseLastSimulation(JSON.stringify(broken));
    expect(parsed).not.toBeNull();
    expect(parsed?.single).toBeUndefined();
    expect(parsed?.waypoints).toHaveLength(2);
  });

  it("drops a corrupted compare block without touching the single one", () => {
    const broken = full({
      compare: {
        sweepEarliest: "2026-09-03T08:00",
        sweepLatest: "2026-09-05T08:00",
        sweepIntervalHours: 3,
        windows: [{ departure: "nope" }],
        metaWarnings: [],
        forecastUpdatedAt: "2026-09-02T06:00:00Z",
      } as unknown as LastSimulation["compare"],
    });
    const parsed = parseLastSimulation(JSON.stringify(broken));
    expect(parsed?.compare).toBeUndefined();
    expect(parsed?.single?.passage.duration_h).toBe(10);
  });

  it("empties bad meta warnings rather than losing the table they annotate", () => {
    const sim = full({
      compare: {
        sweepEarliest: "2026-09-03T08:00",
        sweepLatest: "2026-09-05T08:00",
        sweepIntervalHours: 3,
        windows: [window_(0)],
        metaWarnings: [{ oops: true }],
        forecastUpdatedAt: "2026-09-02T06:00:00Z",
      } as unknown as LastSimulation["compare"],
    });
    const parsed = parseLastSimulation(JSON.stringify(sim));
    expect(parsed?.compare?.windows).toHaveLength(1);
    expect(parsed?.compare?.metaWarnings).toEqual([]);
  });
});

// `saveLastSimulation` writes through localStorage, absent from the node
// environment the unit project runs in. A minimal in-memory stand-in is enough
// to observe what the budget actually wrote.
function withFakeStorage(run: (read: () => string | null) => void) {
  let stored: string | null = null;
  const fake = {
    getItem: () => stored,
    setItem: (_k: string, v: string) => {
      stored = v;
    },
    removeItem: () => {
      stored = null;
    },
  };
  const g = globalThis as unknown as { localStorage?: unknown };
  const previous = g.localStorage;
  g.localStorage = fake;
  try {
    run(() => stored);
  } finally {
    g.localStorage = previous;
  }
}

describe("saveLastSimulation size budget", () => {
  it("keeps at most MAX_WINDOWS windows", async () => {
    const { saveLastSimulation } = await import("./lastSimulation");
    withFakeStorage((read) => {
      saveLastSimulation(
        full({
          mode: "compare",
          single: undefined,
          compare: {
            sweepEarliest: "2026-09-03T08:00",
            sweepLatest: "2026-09-30T08:00",
            sweepIntervalHours: 1,
            windows: Array.from({ length: 200 }, (_, i) => window_(i)),
            metaWarnings: [],
            forecastUpdatedAt: "2026-09-02T06:00:00Z",
          },
        }),
      );
      const written = parseLastSimulation(read()!);
      expect(written?.compare?.windows).toHaveLength(LAST_SIMULATION_LIMITS.MAX_WINDOWS);
    });
  });

  it("strips the per-window detail before dropping the sweep, and keeps single", async () => {
    const { saveLastSimulation } = await import("./lastSimulation");
    // Each window carries a fat passage: 48 of them blow past MAX_BYTES, so
    // tier 2 of the budget has to fire.
    const fat = (i: number): PassageWindow => ({
      ...window_(i),
      passage: {
        ...passage(),
        segments: Array.from({ length: 400 }, () => ({
          note: "x".repeat(40),
        })) as unknown as PassageReport["segments"],
      },
      complexity_full: complexity(),
    });
    withFakeStorage((read) => {
      saveLastSimulation(
        full({
          mode: "compare",
          compare: {
            sweepEarliest: "2026-09-03T08:00",
            sweepLatest: "2026-09-09T08:00",
            sweepIntervalHours: 3,
            windows: Array.from({ length: 48 }, (_, i) => fat(i)),
            metaWarnings: [],
            forecastUpdatedAt: "2026-09-02T06:00:00Z",
          },
        }),
      );
      const raw = read()!;
      expect(raw.length).toBeLessThanOrEqual(LAST_SIMULATION_LIMITS.MAX_BYTES);
      const written = parseLastSimulation(raw);
      expect(written?.compare?.windows).toHaveLength(48);
      expect(written?.compare?.windows[0].passage).toBeUndefined();
      // The result the user is actually looking at survives untouched.
      expect(written?.single?.passage.distance_nm).toBe(55);
    });
  });

  it("drops the sweep entirely when stripping is not enough", async () => {
    const { saveLastSimulation } = await import("./lastSimulation");
    const huge = (i: number): PassageWindow => ({
      ...window_(i),
      warnings: [ "y".repeat(20_000) ],
    });
    withFakeStorage((read) => {
      saveLastSimulation(
        full({
          mode: "compare",
          compare: {
            sweepEarliest: "2026-09-03T08:00",
            sweepLatest: "2026-09-09T08:00",
            sweepIntervalHours: 3,
            windows: Array.from({ length: 48 }, (_, i) => huge(i)),
            metaWarnings: [],
            forecastUpdatedAt: "2026-09-02T06:00:00Z",
          },
        }),
      );
      const raw = read()!;
      expect(raw.length).toBeLessThanOrEqual(LAST_SIMULATION_LIMITS.MAX_BYTES);
      const written = parseLastSimulation(raw);
      expect(written?.compare).toBeUndefined();
      expect(written?.single?.passage.distance_nm).toBe(55);
    });
  });

  it("leaves a payload under budget untouched", async () => {
    const { saveLastSimulation } = await import("./lastSimulation");
    withFakeStorage((read) => {
      saveLastSimulation(full());
      const written = parseLastSimulation(read()!);
      expect(written?.single?.passage.arrival_time).toBe("2026-09-03T18:00:00+02:00");
      expect(written?.v).toBe(LAST_SIMULATION_VERSION);
    });
  });
});

describe("waypointsEqual", () => {
  it("tolerates the rounding of a URL round-trip", () => {
    expect(
      waypointsEqual(
        [[43.290004, 5.370004]],
        [[43.29, 5.37]],
      ),
    ).toBe(true);
  });

  it("separates two different routes", () => {
    expect(waypointsEqual([[43.29, 5.37]], [[43.29, 5.37], [43.0, 6.2]])).toBe(false);
    expect(waypointsEqual([[43.29, 5.37]], [[43.4, 5.37]])).toBe(false);
  });
});
