import { describe, it, expect } from "vitest";
import {
  assembleForecastCache,
  interpolateCorridor,
  CACHE_MODEL_SLUGS,
  type SampledPoint,
} from "./forecastCache";
import { parisIsoToUtcMs } from "./marine";
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
