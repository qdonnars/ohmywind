// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it } from "vitest";
import {
  aggregateLegs,
  aggregateSteps,
  buildLegSummaryCells,
  focusedSegmentIndex,
  legSpread,
  type AggregatedLeg,
} from "./aggregateLegs";
import type { SegmentReport } from "./types";
import { setLang, t } from "../i18n";

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

/** A one-leg route whose direct course sits at `twa` deg off the wind. */
function legAtTwa(twa: number, minUpwindDeg?: number): AggregatedLeg {
  const waypoints: [number, number][] = [[43.0, 5.0], [43.1, 5.1]];
  return aggregateLegs([seg({ twa_deg: twa })], waypoints, 0.75, minUpwindDeg)[0];
}

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
    hs_min_m: null,
    hs_max_m: null,
    tp_avg_s: null,
    sea_direction: null,
    sea_level: null,
    sea_flag: null,
    sea_flag_tp_s: null,
    sea_flag_current_kn: null,
    current_speed_kn: null,
    current_direction_to_deg: null,
    current_relative: null,
    current_unknown: false,
    motor_used: false,
    ...overrides,
  };
}

describe("buildLegSummaryCells figures", () => {
  it("writes the wind and the sea as ranges, the unit left to the column header", () => {
    const cells = buildLegSummaryCells(
      makeLeg({ tws_min: 6.2, tws_max: 8.8, hs_avg_m: 0.5, hs_min_m: 0.4, hs_max_m: 0.6 }),
    );
    expect(cells.wind).toBe("6–9");
    expect(cells.sea).toBe("0,4–0,6");
    expect(cells.alert).toBeNull();
  });

  it("collapses a range whose two ends read the same", () => {
    const cells = buildLegSummaryCells(
      makeLeg({ tws_min: 12.1, tws_max: 12.4, hs_avg_m: 0.52, hs_min_m: 0.51, hs_max_m: 0.54 }),
    );
    expect(cells.wind).toBe("12");
    expect(cells.sea).toBe("0,5");
  });

  it("has no sea figure without sea data", () => {
    expect(buildLegSummaryCells(makeLeg()).sea).toBeNull();
  });

  it("says a formed sea by its figure, with no alert of its own", () => {
    const cells = buildLegSummaryCells(
      makeLeg({ distance_nm: 13.8, hs_avg_m: 1.3, hs_min_m: 1.1, hs_max_m: 1.4, tp_avg_s: 9, sea_level: 3 }),
    );
    expect(cells.flag).toBe("Mer formée");
    expect(cells.seaNote).toBe("Mer formée");
    expect(cells.alert).toBeNull();
  });

  it("names the sea from the server's level, never from the height", () => {
    const named = (sea_level: number | null) =>
      buildLegSummaryCells(makeLeg({ hs_avg_m: 3.2, hs_min_m: 3.2, hs_max_m: 3.2, sea_level })).seaNote;
    expect(named(2)).toBeNull();
    expect(named(3)).toBe("Mer formée");
    expect(named(4)).toBe("Grosse mer");
    expect(named(5)).toBe("Très grosse mer");
    // An older server stamps no level: nothing is flagged, whatever the
    // height. The app does not bin a wave height itself any more.
    expect(named(null)).toBeNull();
  });

  it("says a sustained wind by its figure, from the server's own threshold", () => {
    expect(buildLegSummaryCells(makeLeg({ tws_min: 8, tws_max: 14.4 })).windNote).toBeNull();
    // 14,6 kn is printed « 15 »: orange like any other 15.
    expect(buildLegSummaryCells(makeLeg({ tws_min: 8, tws_max: 14.6 })).windNote).toBe("Vent soutenu");
    const strong = buildLegSummaryCells(makeLeg({ tws_min: 13, tws_max: 24 }));
    expect(strong.windNote).toBe("Vent soutenu");
    expect(strong.alert).toBeNull();
  });

  it("keeps an alert for a chop, with the period the row does not show", () => {
    // Steep, and formed too. Both are said, each its way.
    const cells = buildLegSummaryCells(
      makeLeg({
        hs_avg_m: 1.3,
        hs_min_m: 1.3,
        hs_max_m: 1.3,
        tp_avg_s: 4.2,
        sea_level: 3,
        sea_flag: "chop_following",
        sea_flag_tp_s: [4.2, 4.2],
      }),
    );
    expect(cells.alert).toBe("Clapot suiveur · période 4 s");
    expect(cells.seaNote).toBe("Mer formée");
  });

  it("gives the periods of the flagged steps as a range when they differ", () => {
    const cells = buildLegSummaryCells(
      makeLeg({ hs_avg_m: 1.0, sea_level: 2, sea_flag: "chop_short", sea_flag_tp_s: [3.8, 4.6] }),
    );
    expect(cells.alert).toBe("Clapot · période 4–5 s");
    expect(cells.seaNote).toBeNull();
  });

  it("keeps an alert for a wind against the current, with the current's speed", () => {
    const cells = buildLegSummaryCells(
      makeLeg({ distance_nm: 8, sea_flag: "wind_against_current", sea_flag_current_kn: 1.8 }),
    );
    expect(cells.alert).toBe("Vent contre courant · 1,8 kn");
  });

  it("does not call a current on the nose a wind against the current", () => {
    // The app used to flag any contrary current of 1,5 kn or more, whatever
    // the wind. It is the wind that breaks the sea, and the server that says so.
    const cells = buildLegSummaryCells(
      makeLeg({ current_relative: "contraire", current_speed_kn: 2.4, current_delta_kn: -2.2 }),
    );
    expect(cells.alert).toBeNull();
    expect(cells.flag).toBeNull();
  });
});

describe("buildLegSummaryCells.flag", () => {
  it("flags Clapot on the server's word", () => {
    const flag = buildLegSummaryCells(
      makeLeg({ hs_avg_m: 1.2, tp_avg_s: 4.5, sea_level: 2, sea_flag: "chop_short", sea_flag_tp_s: [4.5, 4.5] }),
    ).flag;
    expect(flag).toBe("Clapot");
  });

  it("keeps Mer formée label for long-period swell at the same Hs", () => {
    // Hs 1.8 m at Tp 11 s: the server flags no chop, the level alone speaks.
    const flag = buildLegSummaryCells(makeLeg({ hs_avg_m: 1.8, tp_avg_s: 11, sea_level: 3 })).flag;
    expect(flag).toBe("Mer formée");
  });

  it("does not flag a steep sea the server did not flag", () => {
    // Hs 0.4 m at Tp 2 s is steep on paper and harmless ripples at sea. The
    // floor is the server's; nothing is measured again here.
    const flag = buildLegSummaryCells(makeLeg({ hs_avg_m: 0.4, tp_avg_s: 2, sea_level: 1 })).flag;
    expect(flag).toBeNull();
  });

  it("Grosse mer overrides Clapot from level 4", () => {
    // Both apply; the bigger-picture label wins on the card, the chop keeps
    // its alert.
    const cells = buildLegSummaryCells(
      makeLeg({ hs_avg_m: 2.8, tp_avg_s: 5, sea_level: 4, sea_flag: "chop_short", sea_flag_tp_s: [5, 5] }),
    );
    expect(cells.flag).toBe("Grosse mer");
    expect(cells.alert).toBe("Clapot · période 5 s");
  });

  it("labels Clapot suiveur when the server says the chop follows", () => {
    // Running with the sea: broaching and gybe risks remain, but no
    // slamming, hence the distinct label.
    const flag = buildLegSummaryCells(
      makeLeg({ hs_avg_m: 1.2, tp_avg_s: 4.5, sea_level: 2, sea_flag: "chop_following", sea_flag_tp_s: [4.5, 4.5] }),
    ).flag;
    expect(flag).toBe("Clapot suiveur");
  });

  it("Vent contre courant overrides a formed sea", () => {
    const flag = buildLegSummaryCells(
      makeLeg({ hs_avg_m: 1.6, sea_level: 3, sea_flag: "wind_against_current", sea_flag_current_kn: 2.0 }),
    ).flag;
    expect(flag).toBe("Vent contre courant");
  });
});

describe("the server's sea verdict, carried from the segments to the leg", () => {
  const waypoints: [number, number][] = [[43.0, 5.0], [43.1, 5.1]];
  const leg = (segments: SegmentReport[]) => aggregateLegs(segments, waypoints, 0.75, 45)[0];

  it("takes the highest level: one formed step makes a formed leg", () => {
    const l = leg([seg({ hs_m: 0.9, sea_level: 2 }), seg({ hs_m: 1.4, sea_level: 3 }), seg({ hs_m: 1.0, sea_level: 2 })]);
    expect(l.sea_level).toBe(3);
    // The mean height, 1,1 m, would not have said so.
    expect(buildLegSummaryCells(l).seaNote).toBe("Mer formée");
  });

  it("has no level when the server stamped none", () => {
    expect(leg([seg({ hs_m: 1.6 }), seg({ hs_m: 1.7 })]).sea_level).toBeNull();
  });

  it("puts wind against current first, with its strongest current", () => {
    const l = leg([
      seg({ sea_flag: "chop_short", wave_period_s: 4 }),
      seg({ sea_flag: "wind_against_current", current_speed_kn: 1.7 }),
      seg({ sea_flag: "wind_against_current", current_speed_kn: 2.3 }),
    ]);
    expect(l.sea_flag).toBe("wind_against_current");
    expect(l.sea_flag_current_kn).toBe(2.3);
    expect(l.sea_flag_tp_s).toBeNull();
  });

  it("calls the chop following only when every chop of the leg follows", () => {
    const mixed = leg([
      seg({ sea_flag: "chop_following", wave_period_s: 4.4 }),
      seg({ sea_flag: "chop_short", wave_period_s: 3.9 }),
      seg({ sea_flag: null, wave_period_s: 7 }),
    ]);
    expect(mixed.sea_flag).toBe("chop_short");
    // The periods of the flagged steps only, not the calm one's.
    expect(mixed.sea_flag_tp_s).toEqual([3.9, 4.4]);
    const following = leg([seg({ sea_flag: "chop_following", wave_period_s: 5 }), seg({})]);
    expect(following.sea_flag).toBe("chop_following");
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

  it("keeps a narrow zone around the mean when the steps agree", () => {
    // Mean 302: a 12° zone, 296 to 308, rather than no zone at all.
    const [from, to] = legSpread(stepsAt([300, 304, 302])).twd_arc as [number, number];
    expect(from).toBeCloseTo(296, 0);
    expect(to).toBeCloseTo(308, 0);
    const [f1, t1] = legSpread(stepsAt([300])).twd_arc as [number, number];
    expect(f1).toBeCloseTo(294, 0);
    expect(t1).toBeCloseTo(306, 0);
    expect(legSpread([]).twd_arc).toBeNull();
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
    // No reportable current on any step: no zone for it.
    expect(legSpread(stepsAt([300, 300], { current_direction_to_deg: 90, current_speed_kn: 0.1 })).current_arc).toBeNull();
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

// The labels this module produces reach the screen, so they follow the
// reader's language. One case per family is enough: they all go through the
// same `t()`, and `LegExpanded` matches a flag back against its own key.
describe("labels follow the active language", () => {
  afterEach(async () => {
    await setLang("fr");
  });

  it("names the point of sail and the sea flag in English too", async () => {
    await setLang("en");
    expect(legAtTwa(60, 45).point_of_sail).toBe(t("panel.legs.pointOfSail.beamReach"));
    expect(buildLegSummaryCells(makeLeg({ hs_avg_m: 1.8, tp_avg_s: 11, sea_level: 3 })).flag).toBe(
      t("panel.legs.seaFlag.roughSea"),
    );
  });
});

describe("aggregateLegs.speedBuildUp", () => {
  const waypoints: [number, number][] = [[43.0, 5.0], [43.1, 5.1]];
  const one = (s: SegmentReport) => aggregateLegs([s], waypoints, 0.75, 45)[0];

  // Regression: on a tacking step the server sails the optimal-VMG angle and
  // reports the speed that geometry gives, while `polar_speed_kn` is still
  // the raw polar read at the direct course, inside the no-go zone. Building
  // the polar term from that raw value pushed the tacking difference into the
  // sea term, which read "−0,5 mer" (bundled polar, clamped high) or "+3,0
  // mer" (imported polar with a 0° row, interpolated towards zero) on steps
  // where the server applied no wave correction at all.
  it("starts the build-up from the speed the server sailed, not the raw polar in the no-go zone", () => {
    // cruiser_40ft at 12.4 kn, TWA 21°: raw polar 5.46 (clamped on the 40°
    // column), sailed 5.25 × 0.75 = 3.94, derate 1.
    const clamped = one(seg({ twa_deg: 21, polar_speed_kn: 5.46, boat_speed_kn: 3.94, wave_derate_factor: 1 }));
    expect(clamped.polar_after_eff_kn).toBeCloseTo(3.94, 5);
    expect(clamped.wave_delta_kn).toBeCloseTo(0, 5);

    // Same step on a polar carrying a 0° row of zeros: raw polar 2.90.
    const zeroRow = one(seg({ twa_deg: 20, polar_speed_kn: 2.9, boat_speed_kn: 4.14, wave_derate_factor: 1 }));
    expect(zeroRow.polar_after_eff_kn).toBeCloseTo(4.14, 5);
    expect(zeroRow.wave_delta_kn).toBeCloseTo(0, 5);
  });

  it("attributes to the sea exactly what the wave derate took, never a gain", () => {
    const leg = one(seg({ polar_speed_kn: 5.5, boat_speed_kn: 4.5, wave_derate_factor: 0.9 }));
    expect(leg.polar_after_eff_kn).toBeCloseTo(5.0, 5);
    expect(leg.wave_delta_kn).toBeCloseTo(-0.5, 5);
    expect(leg.polar_after_eff_kn + leg.wave_delta_kn).toBeCloseTo(leg.boat_speed_kn, 5);
  });

  it("keeps the sum exact across a leg of mixed steps", () => {
    const leg = aggregateLegs(
      [
        seg({ distance_nm: 3, boat_speed_kn: 3.9, wave_derate_factor: 1 }),
        seg({ distance_nm: 7, boat_speed_kn: 4.5, wave_derate_factor: 0.9 }),
        seg({ distance_nm: 2, boat_speed_kn: 5.0, motor_used: true, wave_derate_factor: 0.8 }),
      ],
      waypoints,
      0.75,
      45,
    )[0];
    expect(leg.polar_after_eff_kn + leg.wave_delta_kn).toBeCloseTo(leg.boat_speed_kn, 5);
    expect(leg.wave_delta_kn).toBeLessThanOrEqual(0);
  });

  it("shows no sea term under engine, where the derate did not apply", () => {
    // The server reports the derate it computed even when the motor bypassed
    // it; the motoring speed must not be inflated by it.
    const leg = one(seg({ motor_used: true, polar_speed_kn: 2.0, boat_speed_kn: 5.0, wave_derate_factor: 0.8 }));
    expect(leg.polar_after_eff_kn).toBeCloseTo(5.0, 5);
    expect(leg.wave_delta_kn).toBeCloseTo(0, 5);
  });

  it("treats a missing or broken derate as no derate", () => {
    for (const derate of [0, -1, 1.5, Number.NaN, undefined]) {
      const leg = one(seg({ boat_speed_kn: 4.5, wave_derate_factor: derate as number }));
      expect(leg.polar_after_eff_kn).toBeCloseTo(4.5, 5);
      expect(leg.wave_delta_kn).toBeCloseTo(0, 5);
    }
  });
});
