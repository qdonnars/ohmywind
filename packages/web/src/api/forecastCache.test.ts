// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import {
  assembleForecastCache,
  interpolateCorridor,
  planCorridor,
  routeLengthNm,
  serverAlignedCorridor,
  serverSegmentLengthNm,
  CACHE_MODEL_SLUGS,
  type SampledPoint,
} from "./forecastCache";
import { parisIsoToUtcMs } from "./marine";
import { haversineNm, interpolateGreatCircle, type GeoPoint } from "../plan/geo";
import type { ModelForecast, MarineHourly } from "../types";

const MARSEILLE: [number, number] = [43.3, 5.35];
const PORQUEROLLES: [number, number] = [43.0, 6.2];

const TIMES = ["2026-05-01T00:00", "2026-05-01T01:00", "2026-05-01T02:00"];

function model(name: string, speeds: (number | null)[], gusts?: (number | null)[]): ModelForecast {
  return {
    modelName: name,
    hourly: {
      time: TIMES,
      wind_speed_10m: speeds,
      wind_direction_10m: speeds.map(() => 180),
      wind_gusts_10m: gusts ?? speeds.map(() => null),
      weather_code: speeds.map(() => 1),
    },
  };
}

function marine(source: string | null): MarineHourly {
  return {
    time: TIMES,
    wave_height_m: [0.4, 0.5, 0.6],
    wave_period_s: [4, 4, 4],
    wave_direction_deg: [200, 200, 200],
    current_speed_kn: [0.2, 0.25, 0.3],
    current_direction_to_deg: [90, 90, 90],
    tide_height_m: [1.0, 1.1, 1.2],
    current_source: source ?? undefined,
  };
}

describe("interpolateCorridor", () => {
  it("matches segment_route spacing and hits the waypoints", () => {
    const pts = interpolateCorridor([MARSEILLE, PORQUEROLLES], 10);
    // ~41 nm / 10 -> n = ceil(4.1) = 5 -> 6 points.
    expect(pts.length).toBe(6);
    expect(pts[0].lat).toBeCloseTo(MARSEILLE[0], 4);
    expect(pts[0].lon).toBeCloseTo(MARSEILLE[1], 4);
    expect(pts[5].lat).toBeCloseTo(PORQUEROLLES[0], 4);
    expect(pts[5].lon).toBeCloseTo(PORQUEROLLES[1], 4);
  });

  it("does not duplicate the shared waypoint between legs", () => {
    const mid: [number, number] = [43.15, 5.78];
    const oneLeg = interpolateCorridor([MARSEILLE, mid], 10).length;
    const twoLegs = interpolateCorridor([MARSEILLE, mid, PORQUEROLLES], 10).length;
    const secondLegOnly = interpolateCorridor([mid, PORQUEROLLES], 10).length;
    // Second leg contributes its points minus the shared start.
    expect(twoLegs).toBe(oneLeg + (secondLegOnly - 1));
  });

  it("throws on fewer than 2 waypoints", () => {
    expect(() => interpolateCorridor([MARSEILLE], 10)).toThrow();
  });
});

// ── server segmentation, ported ──────────────────────────────────────────────
// A deliberate second implementation of the server rule, transcribed from
// packages/data-adapters/src/openwind_data/routing/passage.py
// (`_resolve_segment_length`, MAX_SAMPLED_SEGMENTS = 10, band [10, 30] NM) and
// routing/geometry.py (`segment_route`, `midpoint`). If the client mirror in
// forecastCache.ts drifts from the server, these tests go red.

const SERVER_MAX_SAMPLED_SEGMENTS = 10;
const SERVER_MIN_SEG_NM = 10;
const SERVER_MAX_SEG_NM = 30;

function serverEffectiveSegmentNm(waypoints: [number, number][], requestedNm = 10): number {
  const total = routeLengthNm(waypoints);
  const target = total / SERVER_MAX_SAMPLED_SEGMENTS;
  if (target <= requestedNm) return requestedNm;
  const effective = Math.min(SERVER_MAX_SEG_NM, Math.max(SERVER_MIN_SEG_NM, target));
  return effective <= requestedNm ? requestedNm : effective;
}

// Transcription of segment_route + [midpoint(s.start, s.end) for s in segments]:
// interpolate the sub-segment ends first, then take their great-circle middle,
// exactly as the server does rather than shortcutting to fraction (i+0.5)/n.
function serverSegmentMidpoints(waypoints: [number, number][], requestedNm = 10): GeoPoint[] {
  const segmentNm = serverEffectiveSegmentNm(waypoints, requestedNm);
  const mids: GeoPoint[] = [];
  for (let leg = 0; leg < waypoints.length - 1; leg++) {
    const a: GeoPoint = { lat: waypoints[leg][0], lon: waypoints[leg][1] };
    const b: GeoPoint = { lat: waypoints[leg + 1][0], lon: waypoints[leg + 1][1] };
    const n = Math.max(1, Math.ceil(haversineNm(a, b) / segmentNm));
    for (let i = 0; i < n; i++) {
      const start = i === 0 ? a : interpolateGreatCircle(a, b, i / n);
      const end = i === n - 1 ? b : interpolateGreatCircle(a, b, (i + 1) / n);
      mids.push(interpolateGreatCircle(start, end, 0.5));
    }
  }
  return mids;
}

function nearestNm(target: GeoPoint, candidates: GeoPoint[]): number {
  return Math.min(...candidates.map((c) => haversineNm(target, c)));
}

// Rhumb-ish forward step, good enough to lay out test routes of a given length.
function pointAt(from: [number, number], bearingDeg: number, distNm: number): [number, number] {
  const brg = (bearingDeg * Math.PI) / 180;
  const lat = from[0] + (distNm * Math.cos(brg)) / 60;
  const lon = from[1] + (distNm * Math.sin(brg)) / (60 * Math.cos((from[0] * Math.PI) / 180));
  return [lat, lon];
}

// Routes of roughly the requested length, from 2 to 5 waypoints, laid out with
// a heading change at each waypoint so no leg is a continuation of the last.
function routeOf(totalNm: number, waypointCount: number): [number, number][] {
  const legs = waypointCount - 1;
  const legNm = totalNm / legs;
  const wpts: [number, number][] = [[43.3, 5.35]];
  for (let i = 0; i < legs; i++) {
    wpts.push(pointAt(wpts[i], 100 + i * 25, legNm));
  }
  return wpts;
}

const ROUTE_CASES: [number, number][] = [
  [30, 2], [30, 3],
  [63, 2], [63, 3], [63, 4],
  [120, 2], [120, 3], [120, 5],
  [200, 2], [200, 4], [200, 5],
  [400, 2], [400, 3], [400, 5],
];

describe("serverSegmentLengthNm", () => {
  it("keeps the requested 10 NM on a short route", () => {
    expect(serverSegmentLengthNm(routeOf(30, 2))).toBe(10);
    expect(serverSegmentLengthNm(routeOf(63, 2))).toBe(10);
  });

  it("stretches to a tenth of the route in the middle band", () => {
    const route = routeOf(200, 2);
    expect(serverSegmentLengthNm(route)).toBeCloseTo(routeLengthNm(route) / 10, 6);
  });

  it("caps at 30 NM on a long route", () => {
    expect(serverSegmentLengthNm(routeOf(400, 2))).toBe(30);
    expect(serverSegmentLengthNm(routeOf(900, 2))).toBe(30);
  });

  it("agrees with the ported server rule on every case", () => {
    for (const [nm, count] of ROUTE_CASES) {
      const route = routeOf(nm, count);
      expect(serverSegmentLengthNm(route)).toBeCloseTo(serverEffectiveSegmentNm(route), 9);
    }
  });
});

describe("planCorridor", () => {
  it("puts a sample on every server segment midpoint, well within 1 NM", () => {
    for (const [nm, count] of ROUTE_CASES) {
      const route = routeOf(nm, count);
      const corridor = planCorridor(route);
      for (const mid of serverSegmentMidpoints(route)) {
        expect(nearestNm(mid, corridor)).toBeLessThan(1);
      }
    }
  });

  it("lands exactly on the midpoints, not merely near them", () => {
    // The whole point of splitting each leg into 2n rather than halving a
    // spacing: the nearest-neighbour lookup has no distance error to argue
    // about. A metre of slack absorbs floating-point noise only.
    for (const [nm, count] of ROUTE_CASES) {
      const route = routeOf(nm, count);
      const corridor = planCorridor(route);
      for (const mid of serverSegmentMidpoints(route)) {
        expect(nearestNm(mid, corridor)).toBeLessThan(0.001);
      }
    }
  });

  it("also carries every segment boundary, so a shifted segmentation still hits", () => {
    const route = routeOf(200, 3);
    const corridor = planCorridor(route);
    const segmentNm = serverSegmentLengthNm(route);
    for (let leg = 0; leg < route.length - 1; leg++) {
      const a: GeoPoint = { lat: route[leg][0], lon: route[leg][1] };
      const b: GeoPoint = { lat: route[leg + 1][0], lon: route[leg + 1][1] };
      const n = Math.max(1, Math.ceil(haversineNm(a, b) / segmentNm));
      for (let i = 0; i <= n; i++) {
        expect(nearestNm(interpolateGreatCircle(a, b, i / n), corridor)).toBeLessThan(0.001);
      }
    }
  });

  it("samples far fewer points than the old fixed 5 NM spacing", () => {
    const before = (route: [number, number][]) =>
      interpolateCorridor(route, Math.max(5, routeLengthNm(route) / 60)).length;
    for (const nm of [120, 200, 400]) {
      const route = routeOf(nm, 2);
      expect(planCorridor(route).length).toBeLessThan(before(route));
    }
    // A 200 NM passage is the audit's reference case: 41 points, now 21.
    expect(planCorridor(routeOf(200, 2)).length).toBe(21);
  });

  it("stays under the point guard even on a route no one will sail", () => {
    // MAX_CORRIDOR_POINTS has always bounded the number of intervals, so the
    // stretched fallback lands on 61 samples. Unchanged here, and only that
    // path loses the exact alignment: a 3000 NM route is out of reach anyway
    // with a 7-day forecast horizon.
    expect(planCorridor(routeOf(3000, 2)).length).toBeLessThanOrEqual(61);
    // 600 NM over 4 legs still fits the aligned rule (30 NM segments), so it
    // keeps the exact alignment asserted above.
    const manyLegs = routeOf(600, 5);
    expect(planCorridor(manyLegs).length).toBeLessThanOrEqual(60);
    for (const mid of serverSegmentMidpoints(manyLegs)) {
      expect(nearestNm(mid, planCorridor(manyLegs))).toBeLessThan(0.001);
    }
  });

  it("starts and ends on the waypoints", () => {
    const route = routeOf(120, 3);
    const corridor = planCorridor(route);
    expect(corridor[0].lat).toBeCloseTo(route[0][0], 6);
    expect(corridor[0].lon).toBeCloseTo(route[0][1], 6);
    expect(corridor[corridor.length - 1].lat).toBeCloseTo(route[route.length - 1][0], 6);
    expect(corridor[corridor.length - 1].lon).toBeCloseTo(route[route.length - 1][1], 6);
  });
});

describe("serverAlignedCorridor", () => {
  it("splits each leg into twice the server's sub-segment count", () => {
    const route = routeOf(63, 2);
    // 63 NM at 10 NM per sub-segment -> 7 server segments -> 14 intervals.
    expect(serverAlignedCorridor(route, 10).length).toBe(15);
  });

  it("does not duplicate the shared waypoint between legs", () => {
    const route = routeOf(120, 3);
    const oneLeg = serverAlignedCorridor([route[0], route[1]], 12).length;
    const secondLegOnly = serverAlignedCorridor([route[1], route[2]], 12).length;
    expect(serverAlignedCorridor(route, 12).length).toBe(oneLeg + secondLegOnly - 1);
  });

  it("rejects degenerate input", () => {
    expect(() => serverAlignedCorridor([[43.3, 5.35]], 10)).toThrow();
    expect(() => serverAlignedCorridor(routeOf(30, 2), 0)).toThrow();
  });
});

describe("assembleForecastCache", () => {
  const samples = (): SampledPoint[] => [
    {
      lat: MARSEILLE[0],
      lon: MARSEILLE[1],
      models: [
        model("AROME", [10.04, 11.06, 12.0], [14.05, null, 15.0]),
        model("ICON", [9, 9, 9]),
        model("ARPEGE_EU", [8, 8, 8]), // unmappable -> excluded
      ],
      marine: marine("marc_finis_250m"),
    },
    {
      lat: PORQUEROLLES[0],
      lon: PORQUEROLLES[1],
      models: [model("AROME", [20, 20, 20])],
      marine: marine("openmeteo_smoc"),
    },
  ];

  it("builds an ascending UTC ms axis from Paris-naive timestamps", () => {
    const cache = assembleForecastCache(samples());
    expect(cache.times_ms).toEqual(TIMES.map(parisIsoToUtcMs));
    expect([...cache.times_ms].sort((a, b) => a - b)).toEqual(cache.times_ms);
  });

  it("maps web model names to backend slugs and drops unmappable models", () => {
    const cache = assembleForecastCache(samples());
    const wbm = cache.points[0].wind_by_model;
    expect(Object.keys(wbm).sort()).toEqual(["icon_eu", "meteofrance_arome_france"]);
    expect(CACHE_MODEL_SLUGS.AROME).toBe("meteofrance_arome_france");
    // chain: priority by first appearance + gfs_seamless last resort.
    expect(cache.models).toEqual(["meteofrance_arome_france", "icon_eu", "gfs_seamless"]);
  });

  it("passes wind through in knots with rounding and preserves null gusts", () => {
    const cache = assembleForecastCache(samples());
    const arome = cache.points[0].wind_by_model["meteofrance_arome_france"];
    expect(arome.speed_kn).toEqual([10.0, 11.1, 12.0]);
    expect(arome.direction_deg).toEqual([180, 180, 180]);
    expect(arome.gust_kn).toEqual([14.1, null, 15.0]);
  });

  it("carries current_source through per point", () => {
    const cache = assembleForecastCache(samples());
    expect(cache.points[0].sea.current_source).toBe("marc_finis_250m");
    expect(cache.points[1].sea.current_source).toBe("openmeteo_smoc");
    expect(cache.points[0].sea.current_speed_kn).toEqual([0.2, 0.25, 0.3]);
  });

  it("clamps the time axis to the window", () => {
    const startMs = parisIsoToUtcMs(TIMES[1]);
    const cache = assembleForecastCache(samples(), { startMs });
    expect(cache.times_ms).toEqual([parisIsoToUtcMs(TIMES[1]), parisIsoToUtcMs(TIMES[2])]);
    expect(cache.points[0].wind_by_model["meteofrance_arome_france"].speed_kn).toEqual([11.1, 12.0]);
  });

  it("throws when no sample carries a backend-mappable model", () => {
    const onlyUnmappable: SampledPoint[] = [
      { lat: MARSEILLE[0], lon: MARSEILLE[1], models: [model("ARPEGE_EU", [8, 8, 8])], marine: null },
    ];
    expect(() => assembleForecastCache(onlyUnmappable)).toThrow();
  });
});
