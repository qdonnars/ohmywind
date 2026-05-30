import { describe, expect, it } from "vitest";
import { aggregateLegs, buildLegSummaryCells, type AggregatedLeg } from "./aggregateLegs";
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

function makeLeg(overrides: Partial<AggregatedLeg> = {}): AggregatedLeg {
  return {
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
