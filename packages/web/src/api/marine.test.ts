// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import {
  isCurrentsRelevant,
  isTidesRelevant,
  isWavesRelevant,
  mergeMarcOverlay,
  parisIsoToUtcMs,
  type MarcOverlay,
} from "./marine";
import type { MarineHourly } from "../types";

function emptyMarine(): MarineHourly {
  return {
    time: ["2026-05-08T00:00", "2026-05-08T01:00", "2026-05-08T02:00"],
    wave_height_m: [null, null, null],
    wave_period_s: [null, null, null],
    wave_direction_deg: [null, null, null],
    current_speed_kn: [null, null, null],
    current_direction_to_deg: [null, null, null],
    tide_height_m: [null, null, null],
  };
}

describe("isCurrentsRelevant", () => {
  it("returns false when null marine data", () => {
    expect(isCurrentsRelevant(null)).toBe(false);
  });

  it("returns false when all currents below 0.3 kt threshold (Mediterranean case)", () => {
    const m = emptyMarine();
    m.current_speed_kn = [0.05, 0.1, 0.2];
    expect(isCurrentsRelevant(m)).toBe(false);
  });

  it("returns true when at least one current reaches 0.3 kt threshold", () => {
    const m = emptyMarine();
    m.current_speed_kn = [0.05, 0.3, 0.2];
    expect(isCurrentsRelevant(m)).toBe(true);
  });

  it("returns true when current is well above threshold (Atlantic tidal pass)", () => {
    const m = emptyMarine();
    m.current_speed_kn = [0.1, 4.5, 3.2];
    expect(isCurrentsRelevant(m)).toBe(true);
  });
});

describe("isTidesRelevant", () => {
  it("returns false when null marine data", () => {
    expect(isTidesRelevant(null)).toBe(false);
  });

  it("returns false when range stays below 0.5 m (Mediterranean case)", () => {
    const m = emptyMarine();
    m.tide_height_m = [-0.15, 0.0, 0.15]; // range = 0.30
    expect(isTidesRelevant(m)).toBe(false);
  });

  it("returns true when range reaches 0.5 m threshold", () => {
    const m = emptyMarine();
    m.tide_height_m = [-0.25, 0.0, 0.25]; // range = 0.50
    expect(isTidesRelevant(m)).toBe(true);
  });

  it("returns true for Atlantic tidal range (several meters)", () => {
    const m = emptyMarine();
    m.tide_height_m = [-3.5, 0.0, 4.0]; // range = 7.5
    expect(isTidesRelevant(m)).toBe(true);
  });

  it("returns false when all tide values are null (no SMOC coverage)", () => {
    expect(isTidesRelevant(emptyMarine())).toBe(false);
  });
});

describe("isWavesRelevant", () => {
  it("returns false when null marine data", () => {
    expect(isWavesRelevant(null)).toBe(false);
  });

  it("returns true as long as any Hs is present", () => {
    const m = emptyMarine();
    m.wave_height_m = [null, 0.3, null];
    expect(isWavesRelevant(m)).toBe(true);
  });

  it("returns false when no Hs anywhere (no Marine coverage)", () => {
    expect(isWavesRelevant(emptyMarine())).toBe(false);
  });
});

describe("parisIsoToUtcMs", () => {
  it("CEST (summer): Paris midnight is 22:00 UTC the day before", () => {
    // 2026-07-01 is well inside CEST (+02:00)
    const ms = parisIsoToUtcMs("2026-07-01T00:00");
    expect(new Date(ms).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("CET (winter): Paris midnight is 23:00 UTC the day before", () => {
    // 2026-01-15 is well inside CET (+01:00)
    const ms = parisIsoToUtcMs("2026-01-15T00:00");
    expect(new Date(ms).toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("CEST mid-day: 12:00 Paris = 10:00 UTC", () => {
    const ms = parisIsoToUtcMs("2026-07-01T12:00");
    expect(new Date(ms).toISOString()).toBe("2026-07-01T10:00:00.000Z");
  });
});

function brestMarine(): MarineHourly {
  // Brest, mid-July CEST (+02:00). Three Open-Meteo hours starting at 00:00
  // local. The corresponding UTC instants are 2026-06-30T22:00Z, 23:00Z,
  // 2026-07-01T00:00Z — that's what MARC would return.
  return {
    time: [
      "2026-07-01T00:00",
      "2026-07-01T01:00",
      "2026-07-01T02:00",
    ],
    wave_height_m: [0.5, 0.6, 0.7],
    wave_period_s: [6, 6, 7],
    wave_direction_deg: [270, 270, 280],
    current_speed_kn: [0.05, 0.04, 0.06], // SMOC at Brest port: near-zero
    current_direction_to_deg: [180, 180, 180],
    tide_height_m: [-1.5, 0.0, 1.5], // SMOC MSL reference
  };
}

function brestMarcOverlay(): MarcOverlay {
  // What the MARC endpoint would return for the brestMarine() window. Tide
  // is in MSL (MARC's native output) — the merge step subtracts z0 to derive
  // ZH. Currents are in kn (already converted server-side).
  return {
    covered: true,
    current_source: "marc_finis_250m",
    atlas_resolution_m: 250,
    z0_hydro_m: -3.74,
    times: [
      "2026-06-30T22:00:00+00:00",
      "2026-06-30T23:00:00+00:00",
      "2026-07-01T00:00:00+00:00",
    ],
    tide_height_m: [2.1, 3.5, 5.2],
    current_speed_kn: [0.4, 0.8, 1.2],
    current_direction_to_deg: [90, 95, 100],
  };
}

describe("mergeMarcOverlay", () => {
  it("returns base data unchanged when overlay is null", () => {
    const m = brestMarine();
    const merged = mergeMarcOverlay(m, null);
    expect(merged).toEqual(m);
    expect(merged.tide_height_zh_m).toBeUndefined();
    expect(merged.current_source).toBeUndefined();
  });

  it("returns base data unchanged when covered=false", () => {
    const m = brestMarine();
    const merged = mergeMarcOverlay(m, { covered: false });
    expect(merged).toEqual(m);
    expect(merged.tide_height_zh_m).toBeUndefined();
  });

  it("overrides tide and current at matching hours", () => {
    const merged = mergeMarcOverlay(brestMarine(), brestMarcOverlay());
    expect(merged.tide_height_m).toEqual([2.1, 3.5, 5.2]);
    expect(merged.current_speed_kn).toEqual([0.4, 0.8, 1.2]);
    expect(merged.current_direction_to_deg).toEqual([90, 95, 100]);
  });

  it("populates tide_height_zh_m as MSL minus z0_hydro_m (always ≥ 0 here)", () => {
    const merged = mergeMarcOverlay(brestMarine(), brestMarcOverlay());
    // z0 = -3.74 → ZH = MSL - (-3.74) = MSL + 3.74
    expect(merged.tide_height_zh_m).not.toBeNull();
    const zh = merged.tide_height_zh_m as (number | null)[];
    expect(zh[0]).toBeCloseTo(2.1 + 3.74, 6);
    expect(zh[1]).toBeCloseTo(3.5 + 3.74, 6);
    expect(zh[2]).toBeCloseTo(5.2 + 3.74, 6);
    // ZH heights at Brest are between ~2 m and ~9 m — what charts display.
    for (const v of zh) expect(v).not.toBeNull();
    expect(Math.min(...(zh as number[]))).toBeGreaterThan(0);
  });

  it("propagates current_source, marc_resolution_m, z0_hydro_m on the result", () => {
    const merged = mergeMarcOverlay(brestMarine(), brestMarcOverlay());
    expect(merged.current_source).toBe("marc_finis_250m");
    expect(merged.marc_resolution_m).toBe(250);
    expect(merged.z0_hydro_m).toBeCloseTo(-3.74, 6);
  });

  it("leaves SMOC values intact at unmatched hours (overlay shorter than OM)", () => {
    const m = brestMarine();
    const partial: MarcOverlay = {
      covered: true,
      current_source: "marc_finis_250m",
      atlas_resolution_m: 250,
      z0_hydro_m: -3.74,
      // Only the first OM hour matches a MARC sample.
      times: ["2026-06-30T22:00:00+00:00"],
      tide_height_m: [2.1],
      current_speed_kn: [0.4],
      current_direction_to_deg: [90],
    };
    const merged = mergeMarcOverlay(m, partial);
    expect(merged.tide_height_m[0]).toBe(2.1);
    // Index 1 and 2 keep SMOC values.
    expect(merged.tide_height_m[1]).toBe(0.0);
    expect(merged.tide_height_m[2]).toBe(1.5);
    // ZH array sized like OM, with nulls at unmatched hours.
    const zh = merged.tide_height_zh_m as (number | null)[];
    expect(zh[0]).toBeCloseTo(2.1 + 3.74, 6);
    expect(zh[1]).toBeNull();
    expect(zh[2]).toBeNull();
  });
});

describe("isTidesRelevant with MARC ZH", () => {
  it("uses ZH series when present (linear shift, same range)", () => {
    const m = emptyMarine();
    m.tide_height_m = [-1, 0, 1];
    m.tide_height_zh_m = [2.0, 3.0, 4.0]; // same range = 2.0
    expect(isTidesRelevant(m)).toBe(true);
  });

  it("returns false when ZH range below threshold (Mediterranean MARC zone hypothetical)", () => {
    const m = emptyMarine();
    m.tide_height_zh_m = [1.0, 1.1, 1.2]; // range = 0.20, below 0.5 m
    expect(isTidesRelevant(m)).toBe(false);
  });
});
