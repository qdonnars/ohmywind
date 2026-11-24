// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { clockMinutes, roundShown, roundToSum, sharesShown, speedBuildUp } from "./displayRounding";
import { aggregateLegs, aggregateSteps, legDurationLabel } from "./aggregateLegs";
import { fmtSpanSafe, num1 } from "./format";
import type { SegmentReport } from "./types";

function seg(overrides: Partial<SegmentReport> = {}): SegmentReport {
  return {
    start: { lat: 43.0, lon: 5.0 },
    end: { lat: 43.1, lon: 5.1 },
    distance_nm: 5,
    bearing_deg: 90,
    start_time: "2026-05-08T10:00:00+02:00",
    end_time: "2026-05-08T11:00:00+02:00",
    tws_kn: 12,
    twd_deg: 270,
    twa_deg: 60,
    polar_speed_kn: 5.5,
    boat_speed_kn: 4.5,
    duration_h: 1,
    hs_m: 0.9,
    wave_derate_factor: 1,
    ...overrides,
  };
}

/** One step, as the card under an open leg reads it. */
function step(overrides: Partial<SegmentReport>) {
  return aggregateSteps([seg(overrides)], [0, 1], 0.75, 45)[0];
}

/** The terms the card prints, in tenths, and whether they make its total. */
function printed(overrides: Partial<SegmentReport>) {
  const b = speedBuildUp(step(overrides));
  return { ...b, sum: Math.round((b.base + b.sea + b.current) * 10) / 10 };
}

describe("roundShown", () => {
  it("rounds exactly as the screen prints", () => {
    expect(roundShown(3.96, 1)).toBe(4);
    expect(roundShown(0.25, 1)).toBe(0.3);
    expect(roundShown(-0.25, 1)).toBe(-0.3);
    // `toFixed` would say 0.1 here: the screen prints « 0,2 ».
    for (const x of [0.15, 1.45, 2.05, 4.35, -0.15, 3.96, 12.25]) {
      expect(num1(roundShown(x, 1))).toBe(num1(x));
    }
  });

  it("never gives a negative zero", () => {
    expect(Object.is(roundShown(-0.04, 1), 0)).toBe(true);
  });
});

describe("roundToSum", () => {
  it("leaves parts that already add up alone", () => {
    expect(roundToSum([4.5, -0.5, 0.1], 4.1, 1)).toEqual([4.5, -0.5, 0.1]);
  });

  it("gives the missing tenth to the part the rounding pushed furthest", () => {
    // 4.24 → 4.2 lost 0.04, -0.17 → -0.2 lost 0.03, -0.11 → -0.1 gained.
    expect(roundToSum([4.24, -0.17, -0.11], 3.96, 1)).toEqual([4.3, -0.2, -0.1]);
    // Here the sea term is the one closest to the next tenth up.
    expect(roundToSum([4.21, -0.16, -0.09], 3.96, 1)).toEqual([4.2, -0.1, -0.1]);
  });

  it("breaks a tie on the biggest part", () => {
    expect(roundToSum([4.86, -0.04], 4.82, 1)).toEqual([4.8, 0]);
  });

  it("takes an excess tenth back as well", () => {
    // 3.67 - 0.11 + 0.05 = 3.61: printed 3.7 - 0.1 + 0.1 = 3.7 before. The
    // current, 0.05 from zero, is the term nearest the tenth below.
    expect(roundToSum([3.6668, -0.1137, 0.0519], 3.605, 1)).toEqual([3.7, -0.1, 0]);
  });

  it("keeps every part within a tenth of its value, and the sum exact", () => {
    const cases: [number[], number][] = [
      [[5.924, 9.403, 5.84], 21.167],
      [[0.04, 0.04, 0.04, 0.04], 0.16],
      [[1.05, 2.05, 3.05], 6.15],
      [[-0.44, 3.37, 0.08], 3.01],
    ];
    for (const [parts, total] of cases) {
      const out = roundToSum(parts, total, 1);
      expect(Math.round(out.reduce((a, b) => a + b, 0) * 10)).toBe(Math.round(roundShown(total, 1) * 10));
      out.forEach((o, i) => expect(Math.abs(o - parts[i])).toBeLessThan(0.1));
    }
  });
});

describe("sharesShown", () => {
  it("makes the legs of a real plan add up to its total (#532)", () => {
    // Lorient → Groix → Étel, dev backend, 2026-11-24: printed one by one
    // the legs read 5,9 + 9,4 + 5,8 = 21,1 under a total of 21,2.
    const legs = [5.923667478332895, 9.403130291263581, 5.840184127850079];
    const shown = sharesShown(legs, 21.166981897446554, 1);
    expect(shown).toEqual([5.9, 9.4, 5.9]);
  });

  it("makes the steps add up to their leg as printed", () => {
    // A leg of 5.924 printed 6.0 by its share of the passage.
    expect(sharesShown([2.96, 2.964], 6.0, 1)).toEqual([3.0, 3.0]);
  });

  it("does not force a total the parts are not the sum of", () => {
    expect(sharesShown([1.04, 1.04], 5, 1)).toEqual([1.1, 1.0]);
  });
});

describe("speedBuildUp", () => {
  it("adds up on the step of the first capture (#532)", () => {
    // 4,24 polar, -0,17 sea, -0,11 current, 3,96 over ground: printed
    // « 4,0 » over « 4,2 -0,2 -0,1 » before.
    const p = printed({ boat_speed_kn: 4.07, wave_derate_factor: 4.07 / 4.24, sog_kn: 3.96 });
    expect(p.total).toBe(4);
    expect(p.sum).toBe(4);
    expect([p.base, p.sea, p.current]).toEqual([4.3, -0.2, -0.1]);
  });

  it("never prints a polar alone that contradicts the total (#532)", () => {
    // 4,86 polar, no sea effect, -0,04 current: « 4,8 » over « 4,9 polaire ».
    const p = printed({ boat_speed_kn: 4.86, wave_derate_factor: 1, sog_kn: 4.82 });
    expect(p.total).toBe(4.8);
    expect(p.sum).toBe(4.8);
  });

  it("adds up on the steps of real plans", () => {
    // Dev backend, 2026-11-24: each of these printed a sum a tenth off.
    const real: Partial<SegmentReport>[] = [
      { boat_speed_kn: 3.5531222121835744, wave_derate_factor: 0.9690087549170774, sog_kn: 3.6050588245050164 },
      { boat_speed_kn: 4.377307787592993, wave_derate_factor: 0.9875298330478011, sog_kn: 4.453589297064436 },
      { boat_speed_kn: 3.28160518211101, wave_derate_factor: 0.9028571891289006, sog_kn: 3.4250863610916666 },
    ];
    for (const r of real) {
      const p = printed(r);
      expect(p.sum).toBe(p.total);
      expect(p.total).toBe(roundShown(r.sog_kn as number, 1));
    }
  });

  it("prints the same total as the table of the steps", () => {
    const s = step({ boat_speed_kn: 4.07, wave_derate_factor: 0.96, sog_kn: 3.95 });
    expect(num1(speedBuildUp(s).total)).toBe(num1(s.target_speed_kn));
  });

  it("lets no sea term carry a tenth on a step without sea data", () => {
    const p = printed({ hs_m: null, boat_speed_kn: 4.86, sog_kn: 4.82 });
    expect(p.sea).toBe(0);
    expect(p.sum).toBe(p.total);
  });

  it("builds a step under engine from the motoring speed and the current", () => {
    const p = printed({ motor_used: true, boat_speed_kn: 5.0, wave_derate_factor: 0.8, sog_kn: 4.66 });
    expect(p.base).toBe(5.0);
    expect(p.sea).toBe(0);
    expect(p.current).toBe(-0.3);
    expect(p.total).toBe(4.7);
  });

  it("without current data, the speed through water is the total", () => {
    const p = printed({ boat_speed_kn: 4.07, wave_derate_factor: 4.07 / 4.24, sog_kn: null });
    expect(p.current).toBe(0);
    expect(p.sum).toBe(p.total);
    expect(p.total).toBe(4.1);
  });
});

describe("durations on the clocks", () => {
  it("reads a span on its clocks cut to the minute", () => {
    // Lorient → Groix, dev backend: 10:00:00 → 11:35:51 printed « 1h36 ».
    expect(clockMinutes("2026-11-25T09:00:00+00:00", "2026-11-25T10:35:51.062+00:00")).toBe(95);
    expect(fmtSpanSafe("2026-11-25T09:00:00+00:00", "2026-11-25T14:31:55.062828+00:00")).toBe("5h31");
  });

  it("makes the legs add up to the total", () => {
    const times = [
      "2026-11-25T09:00:00+00:00",
      "2026-11-25T10:35:51.062+00:00",
      "2026-11-25T12:54:43.073980+00:00",
      "2026-11-25T14:31:55.062828+00:00",
    ];
    const legs = times.slice(1).map((end, i) => clockMinutes(times[i], end));
    expect(legs).toEqual([95, 139, 97]);
    expect(legs.reduce((a, b) => a + b, 0)).toBe(clockMinutes(times[0], times[3]));
  });

  it("labels a leg from the same clocks", () => {
    const [leg] = aggregateLegs(
      [seg({ start_time: "2026-11-25T09:00:00+00:00", end_time: "2026-11-25T10:35:51.062+00:00" })],
      [[43.0, 5.0], [43.1, 5.1]],
    );
    expect(legDurationLabel(leg)).toBe("1h35");
  });
});

describe("leg average speed", () => {
  it("is the leg's distance over its duration", () => {
    // Two halves of 6 nm at 5,0 and 3,0 kn: 12 nm in 3h12, 3,75 kn. The
    // distance-weighted mean said 4,0.
    const [leg] = aggregateLegs(
      [
        seg({ distance_nm: 6, boat_speed_kn: 5.0, sog_kn: 5.0, duration_h: 6 / 5.0 }),
        seg({ distance_nm: 6, boat_speed_kn: 3.0, sog_kn: 3.0, duration_h: 6 / 3.0 }),
      ],
      [[43.0, 5.0], [43.1, 5.1]],
    );
    expect(leg.target_speed_kn).toBeCloseTo(3.75, 9);
    expect(leg.boat_speed_kn).toBeCloseTo(3.75, 9);
  });

  it("keeps the build-up exact under time weights", () => {
    const [leg] = aggregateLegs(
      [
        seg({ distance_nm: 3, boat_speed_kn: 3.9, sog_kn: 4.2, duration_h: 3 / 4.2 }),
        seg({ distance_nm: 7, boat_speed_kn: 4.5, wave_derate_factor: 0.9, sog_kn: 4.1, duration_h: 7 / 4.1 }),
      ],
      [[43.0, 5.0], [43.1, 5.1]],
    );
    expect(leg.polar_after_eff_kn + leg.wave_delta_kn).toBeCloseTo(leg.boat_speed_kn, 9);
    expect(leg.boat_speed_kn + (leg.current_delta_kn as number)).toBeCloseTo(leg.target_speed_kn, 9);
    expect(leg.target_speed_kn).toBeCloseTo(10 / (3 / 4.2 + 7 / 4.1), 9);
  });
});
