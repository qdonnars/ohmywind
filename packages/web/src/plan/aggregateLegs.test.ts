// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import {
  aggregateLegs,
  aggregateSteps,
  buildLegSummaryCells,
  focusedSegmentIndex,
  legSpread,
  type AggregatedLeg,
} from "./aggregateLegs";
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
    hs_m: 0.4,
    wave_derate_factor: 0.95,
    ...overrides,
  };
}

describe("aggregateLegs", () => {
  // Regression: adding a waypoint after a passage was simulated used to
  // crash the /plan page with a black screen because an empty leg range
  // caused `segs[0].start_time` to deref undefined. The function must
  // tolerate stale segments when waypoints have grown.
  it("does not crash when waypoints have grown beyond the rendered route", () => {
    const segments: SegmentReport[] = [
      seg({ start: { lat: 43.0, lon: 5.0 }, end: { lat: 43.1, lon: 5.1 } }),
      seg({ start: { lat: 43.1, lon: 5.1 }, end: { lat: 43.2, lon: 5.2 } }),
    ];
    // 4 waypoints but only 2 segments — the passage is from a 2-waypoint
    // simulation, the user just added two new waypoints past the destination.
    const waypoints: [number, number][] = [
      [43.0, 5.0],
      [43.2, 5.2],
      [43.4, 5.4],
      [43.6, 5.6],
    ];

    const legs = aggregateLegs(segments, waypoints);

    // No NaN, no crash. Empty-coverage legs are dropped rather than emitted
    // with garbage values.
    expect(() => legs).not.toThrow();
    for (const leg of legs) {
      expect(Number.isFinite(leg.distance_nm)).toBe(true);
      expect(Number.isFinite(leg.boat_speed_kn)).toBe(true);
      expect(typeof leg.start_time).toBe("string");
    }
  });

  it("returns one leg per segment span when waypoints align with segments", () => {
    const segments: SegmentReport[] = [
      seg({ start: { lat: 43.0, lon: 5.0 }, end: { lat: 43.1, lon: 5.1 } }),
      seg({ start: { lat: 43.1, lon: 5.1 }, end: { lat: 43.2, lon: 5.2 } }),
    ];
    const waypoints: [number, number][] = [
      [43.0, 5.0],
      [43.1, 5.1],
      [43.2, 5.2],
    ];

    const legs = aggregateLegs(segments, waypoints);
    expect(legs).toHaveLength(2);
    expect(legs[0].distance_nm).toBeGreaterThan(0);
    expect(legs[1].distance_nm).toBeGreaterThan(0);
  });

  it("returns empty array when there are fewer than 2 waypoints", () => {
    expect(aggregateLegs([seg()], [[43, 5]])).toEqual([]);
    expect(aggregateLegs([seg()], [])).toEqual([]);
  });

  it("returns empty array when there are no segments", () => {
    expect(aggregateLegs([], [[43, 5], [43.1, 5.1]])).toEqual([]);
  });
});

describe("aggregateLegs point of sail", () => {
  // A one-leg route whose direct course sits at `twa` deg off the wind.
  function legAt(twa: number, minUpwindDeg?: number) {
    const segments = [seg({ twa_deg: twa })];
    const waypoints: [number, number][] = [[43.0, 5.0], [43.1, 5.1]];
    return aggregateLegs(segments, waypoints, 0.75, minUpwindDeg)[0];
  }

  // #277: a leg whose direct course is inside the no-go zone is billed at the
  // tacking speed server-side, so calling it plain "Près" told the sailor to
  // steer an angle the boat cannot hold.
  it("qualifies the label when the course is below the boat's upwind angle", () => {
    expect(legAt(30, 45).point_of_sail).toBe("Près (louvoyage)");
    expect(legAt(44.9, 45).point_of_sail).toBe("Près (louvoyage)");
  });

  it("stays a bare Près between the upwind angle and the close-hauled bucket", () => {
    expect(legAt(45, 45).point_of_sail).toBe("Près");
    expect(legAt(49, 45).point_of_sail).toBe("Près");
  });

  // A stiffer boat (catamaran, 50 deg) tacks over a wider band than a
  // racer-cruiser (42 deg) on the very same route.
  it("moves the boundary with the boat", () => {
    expect(legAt(47, 50).point_of_sail).toBe("Près (louvoyage)");
    expect(legAt(47, 42).point_of_sail).toBe("Près");
  });

  it("leaves the other buckets untouched", () => {
    expect(legAt(60, 45).point_of_sail).toBe("Travers");
    expect(legAt(120, 45).point_of_sail).toBe("Largue");
    expect(legAt(170, 45).point_of_sail).toBe("Arrière");
    // Signed TWA normalises to the same buckets.
    expect(legAt(-30, 45).point_of_sail).toBe("Près (louvoyage)");
    expect(legAt(-120, 45).point_of_sail).toBe("Largue");
  });

  it("omits the qualifier when no upwind angle is supplied", () => {
    expect(legAt(30).point_of_sail).toBe("Près");
  });

  // Under power the allure is irrelevant: the motor label wins whatever the
  // angle, including inside the no-go zone.
  it("keeps Moteur over the qualifier when the leg is motored", () => {
    const segments = [seg({ twa_deg: 20, motor_used: true })];
    const waypoints: [number, number][] = [[43.0, 5.0], [43.1, 5.1]];
    expect(aggregateLegs(segments, waypoints, 0.75, 45)[0].point_of_sail).toBe("Moteur");
  });
});

function makeLeg(overrides: Partial<AggregatedLeg> = {}): AggregatedLeg {
  return {
    segment_range: [0, 1],
    distance_nm: 5,
    start_time: "2026-05-08T10:00:00+02:00",
    end_time: "2026-05-08T11:00:00+02:00",
    tws_min: 12,
    tws_max: 14,
    tws_avg_kn: 13,
    twa_avg_deg: 90,
    twd_avg_deg: 270,
    bearing_avg_deg: 0,
    gust_max_kn: null,
    point_of_sail: "Travers",
    polar_after_eff_kn: 4.5,
    wave_delta_kn: 0,
    current_delta_kn: null,
    boat_speed_kn: 4.5,
    target_speed_kn: 4.5,
    efficiency: 0.75,
    hs_avg_m: null,
    hs_max_m: null,
    tp_avg_s: null,
    sea_direction: null,
    current_speed_kn: null,
    current_direction_to_deg: null,
    current_relative: null,
    motor_used: false,
    ...overrides,
  };
}

describe("buildLegSummaryCells.flag", () => {
  it("flags Clapot when Hs/Tp² > 0.05 and Hs >= 0.8 m", () => {
    // Hs 1.2 m at Tp 4.5 s → index ≈ 0.059, in "Mer Formée" Hs range but
    // labelled Clapot because the period is short and steep.
    const flag = buildLegSummaryCells(makeLeg({ hs_avg_m: 1.2, tp_avg_s: 4.5 })).flag;
    expect(flag).toBe("Clapot");
  });

  it("keeps Mer Formée label for long-period swell at the same Hs", () => {
    // Hs 1.8 m at Tp 11 s → index ≈ 0.0149, comfortable long swell.
    const flag = buildLegSummaryCells(makeLeg({ hs_avg_m: 1.8, tp_avg_s: 11 })).flag;
    expect(flag).toBe("Mer Formée");
  });

  it("does not flag Clapot when Hs is below the 0.8 m floor", () => {
    // Hs 0.4 m at Tp 2 s → mathematically index 0.1 but harmless ripples.
    const flag = buildLegSummaryCells(makeLeg({ hs_avg_m: 0.4, tp_avg_s: 2 })).flag;
    expect(flag).toBeNull();
  });

  it("Grosse Mer overrides Clapot when Hs > 2.5 m", () => {
    // Hs 2.8 m at Tp 5 s → both Clapot (steep) and Grosse Mer apply; the
    // bigger-picture label wins.
    const flag = buildLegSummaryCells(makeLeg({ hs_avg_m: 2.8, tp_avg_s: 5 })).flag;
    expect(flag).toBe("Grosse Mer");
  });

  it("labels Clapot Suiveur when sea_direction is arrière", () => {
    // Same chop conditions, but running with the sea — broaching / gybe
    // risks remain, but no slamming, hence the distinct label.
    const flag = buildLegSummaryCells(
      makeLeg({ hs_avg_m: 1.2, tp_avg_s: 4.5, sea_direction: "arrière" }),
    ).flag;
    expect(flag).toBe("Clapot Suiveur");
  });

  it("Vent Contre Courant overrides Clapot", () => {
    // WAC already implies mer hachée — it wins as the more decision-shaping
    // signal.
    const flag = buildLegSummaryCells(
      makeLeg({
        hs_avg_m: 1.2,
        tp_avg_s: 4.5,
        current_relative: "contraire",
        current_speed_kn: 2.0,
      }),
    ).flag;
    expect(flag).toBe("Vent Contre Courant");
  });
});

describe("aggregateSteps", () => {
  const three: SegmentReport[] = [
    seg({ tws_kn: 6, twd_deg: 300, current_speed_kn: 0.4, sog_kn: 5.0 }),
    seg({ tws_kn: 9, twd_deg: 320, current_speed_kn: 1.5, sog_kn: 3.2, gust_kn: 18 }),
    seg({ tws_kn: 7, twd_deg: 310, current_speed_kn: 0.9, sog_kn: 4.1 }),
  ];

  it("returns one step per segment of the range, each knowing its index", () => {
    const steps = aggregateSteps(three, [0, 3], 0.75, 45);
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.segment_range)).toEqual([[0, 1], [1, 2], [2, 3]]);
  });

  it("collapses a step's ranges onto its own value", () => {
    const [, second] = aggregateSteps(three, [0, 3], 0.75, 45);
    expect(second.tws_min).toBe(9);
    expect(second.tws_max).toBe(9);
    expect(second.tws_avg_kn).toBe(9);
    expect(second.gust_max_kn).toBe(18);
    expect(second.current_speed_kn).toBe(1.5);
    expect(second.target_speed_kn).toBeCloseTo(3.2);
  });

  it("only walks the range, and never past the segments", () => {
    expect(aggregateSteps(three, [1, 3], 0.75, 45).map((s) => s.tws_avg_kn)).toEqual([9, 7]);
    expect(aggregateSteps(three, [2, 9], 0.75, 45)).toHaveLength(1);
    expect(aggregateSteps(three, [3, 3], 0.75, 45)).toEqual([]);
  });

  it("carries the leg's provenance through aggregateLegs", () => {
    const waypoints: [number, number][] = [[43.0, 5.0], [43.1, 5.1]];
    const [leg] = aggregateLegs(three, waypoints);
    expect(leg.segment_range).toEqual([0, 3]);
    // The average is a distance-weighted mean of what the steps carry.
    expect(leg.tws_min).toBe(6);
    expect(leg.tws_max).toBe(9);
    expect(leg.tws_avg_kn).toBeCloseTo((6 + 9 + 7) / 3);
  });
});

describe("legSpread", () => {
  const stepsAt = (twds: number[], extra: Partial<SegmentReport> = {}) =>
    aggregateSteps(twds.map((twd) => seg({ twd_deg: twd, ...extra })), [0, twds.length], 0.75, 45);

  it("shades the arc the wind swung through, across North", () => {
    const spread = legSpread(stepsAt([350, 10, 20]));
    expect(spread.step_count).toBe(3);
    expect(spread.twd_arc).not.toBeNull();
    const [from, to] = spread.twd_arc as [number, number];
    expect(from).toBeCloseTo(350, 0);
    expect(to).toBeCloseTo(20, 0);
  });

  it("draws nothing when the steps agree", () => {
    expect(legSpread(stepsAt([300, 304, 302])).twd_arc).toBeNull();
    expect(legSpread(stepsAt([300])).twd_arc).toBeNull();
  });

  it("ignores currents too weak to be reported when arcing the set", () => {
    const steps = aggregateSteps(
      [
        seg({ current_direction_to_deg: 90, current_speed_kn: 0.1, sog_kn: 4 }),
        seg({ current_direction_to_deg: 270, current_speed_kn: 1.2, sog_kn: 4 }),
        seg({ current_direction_to_deg: 250, current_speed_kn: 0.8, sog_kn: 4 }),
      ],
      [0, 3],
      0.75,
      45,
    );
    const spread = legSpread(steps);
    // 250 to 270, the 0.1 kn eddy at 90 does not widen it to a half-disc.
    const [from, to] = spread.current_arc as [number, number];
    expect(from).toBeCloseTo(250, 0);
    expect(to).toBeCloseTo(270, 0);
    expect(spread.current_speed_range).toEqual([0.1, 1.2]);
  });

  it("reports the sea range and nothing without sea data", () => {
    expect(legSpread(stepsAt([300, 300], { hs_m: 0.4 })).hs_range).toEqual([0.4, 0.4]);
    expect(legSpread(stepsAt([300, 300], { hs_m: null })).hs_range).toBeNull();
    expect(legSpread(stepsAt([300, 300], { hs_m: null })).current_speed_range).toBeNull();
  });
});

describe("focusedSegmentIndex", () => {
  const ranges: Array<[number, number]> = [[0, 3], [3, 5]];

  it("adds the step to the start of its leg", () => {
    expect(focusedSegmentIndex(ranges, 0, 2)).toBe(2);
    expect(focusedSegmentIndex(ranges, 1, 1)).toBe(4);
  });

  it("is null without a leg, without a step, or past the leg", () => {
    expect(focusedSegmentIndex(ranges, null, 1)).toBeNull();
    expect(focusedSegmentIndex(ranges, 0, null)).toBeNull();
    expect(focusedSegmentIndex(ranges, 1, 2)).toBeNull();
    expect(focusedSegmentIndex(ranges, 5, 0)).toBeNull();
  });
});
