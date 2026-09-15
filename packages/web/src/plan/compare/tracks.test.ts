// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import type { PassageReport, SegmentReport } from "../types";
import {
  addVariantPoint,
  isVariantComplete,
  midpointAlong,
  planAsTrack,
  routeOverlays,
  startVariant,
  summariseTrack,
  trackColorToken,
  type Track,
} from "./tracks";

const A: [number, number] = [48.28, -4.6];
const B: [number, number] = [48.45, -5.05];
const M: [number, number] = [48.3, -4.9];

const segment = (distance_nm: number, hs_m: number | null, motor_used = false): SegmentReport => ({
  start: { lat: A[0], lon: A[1] },
  end: { lat: B[0], lon: B[1] },
  distance_nm,
  bearing_deg: 300,
  start_time: "2026-09-13T15:00:00+02:00",
  end_time: "2026-09-13T17:00:00+02:00",
  tws_kn: 12,
  twd_deg: 270,
  twa_deg: 45,
  polar_speed_kn: 5,
  boat_speed_kn: 5,
  duration_h: 2,
  hs_m,
  wave_derate_factor: 1,
  motor_used,
});

const passage = (segments: SegmentReport[], duration_h = 5): PassageReport => ({
  archetype: "cruiser_30ft",
  departure_time: "2026-09-13T15:00:00+02:00",
  arrival_time: "2026-09-13T20:00:00+02:00",
  duration_h,
  distance_nm: segments.reduce((s, x) => s + x.distance_nm, 0),
  efficiency: 0.75,
  model: "arome",
  segments,
  warnings: ["a"],
});

const track = (id: string, p: PassageReport | null): Track => ({
  id,
  waypoints: [A, B],
  createdAt: "",
  passage: p,
  complexity: null,
  error: null,
});

describe("drawing a variant", () => {
  it("starts on the plan's ends and adds points before the arrival", () => {
    expect(startVariant([A, M, B])).toEqual([A, B]);
    expect(startVariant([A])).toEqual([]);
    const v = addVariantPoint([A, B], M[0], M[1]);
    expect(v).toEqual([A, M, B]);
    expect(isVariantComplete([A, B])).toBe(false);
    expect(isVariantComplete(v)).toBe(true);
  });
});

describe("reading the options", () => {
  it("sums the five figures of a track from its passage", () => {
    const s = summariseTrack(passage([segment(10, 1.0, true), segment(30, 2.0)]), null);
    expect(s.distanceNm).toBe(40);
    expect(s.hsAvgM).toBeCloseTo(1.75);
    expect(s.hsMaxM).toBe(2);
    expect(s.motorPct).toBe(25);
    expect(s.alerts).toBe(1);
  });

  it("colours the options by position and finds the middle of a line", () => {
    expect(trackColorToken(0)).toBe("--ow-route-a");
    expect(trackColorToken(5)).toBe("--ow-route-c");
    const [lat, lon] = midpointAlong([A, B]);
    expect(lat).toBeCloseTo((A[0] + B[0]) / 2, 5);
    expect(lon).toBeCloseTo((A[1] + B[1]) / 2, 5);
  });

  it("draws every option as a ghost while drawing, full on the track axis, and the others dashed under an open one", () => {
    const options = [planAsTrack([A, B], passage([segment(20, 1)]), null), track("v1", null)];
    const drawing = routeOverlays({ options, drawing: true, tracksAxis: true, openedInPlan: false, highlightedTrackId: null, openedTrackId: null });
    expect(drawing.every((o) => o.dashed && o.dim)).toBe(true);
    const axis = routeOverlays({ options, drawing: false, tracksAxis: true, openedInPlan: false, highlightedTrackId: "v1", openedTrackId: null });
    expect(axis.map((o) => o.dim)).toEqual([true, false]);
    expect(axis[0].label).toBe("1 · 5h");
    expect(axis[1].label).toBe("2");
    const opened = routeOverlays({ options, drawing: false, tracksAxis: false, openedInPlan: true, highlightedTrackId: null, openedTrackId: "v1" });
    expect(opened.map((o) => o.id)).toEqual(["plan"]);
    expect(routeOverlays({ options, drawing: false, tracksAxis: false, openedInPlan: false, highlightedTrackId: null, openedTrackId: null })).toEqual([]);
  });
});
