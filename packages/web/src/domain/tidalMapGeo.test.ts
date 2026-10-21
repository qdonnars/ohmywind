// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import {
  cascadeAt,
  classifyAnswer,
  currentBand,
  esc,
  isGlobalExtent,
  kmBetween,
  labelNamesAtlas,
  nearestPass,
  sourcesAt,
  pointInGeometry,
  precisionClass,
  statusAt,
  type CoverageAtlas,
  type PassProperties,
  type ZoneStatus,
} from "./tidalMapGeo";

describe("precisionClass", () => {
  it("mirrors the server's confidence boundaries", () => {
    expect(precisionClass(90)).toBe("fine");
    expect(precisionClass(500)).toBe("fine");
    expect(precisionClass(700)).toBe("medium");
    expect(precisionClass(926)).toBe("medium");
    expect(precisionClass(2000)).toBe("coarse");
    expect(precisionClass(8000)).toBe("global");
    expect(precisionClass(null)).toBe("global");
  });
});

describe("classifyAnswer", () => {
  it("reads SHOM, an atlas and SMOC out of the overlay payload", () => {
    expect(classifyAnswer({ covered: true, current_source: "shom_c2d_558_morbihan", shom_nearest_km: 0.234 })).toEqual({
      kind: "shom",
      label: "shom_c2d_558_morbihan",
      precision: "fine",
      resolutionM: null,
      shomDistanceM: 230,
    });
    expect(classifyAnswer({ covered: true, current_source: "marc_manga_700m", atlas_resolution_m: 700 })).toMatchObject({
      kind: "atlas",
      precision: "medium",
      resolutionM: 700,
    });
    // A label carries its resolution when the payload does not.
    expect(classifyAnswer({ covered: true, current_source: "bsh_cuxbru_90m" })).toMatchObject({ kind: "atlas", precision: "fine", resolutionM: 90 });
    expect(classifyAnswer({ covered: false })).toMatchObject({ kind: "smoc", label: "openmeteo_smoc", precision: "global" });
    expect(classifyAnswer({ covered: false, land: true })).toMatchObject({ kind: "land" });
  });
});

const square: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
    [
      [0.5, 0.5],
      [1.5, 0.5],
      [1.5, 1.5],
      [0.5, 1.5],
      [0.5, 0.5],
    ],
  ],
};

describe("pointInGeometry", () => {
  it("honours holes and multipolygons", () => {
    expect(pointInGeometry(0.2, 0.2, square)).toBe(true);
    expect(pointInGeometry(1, 1, square)).toBe(false); // in the hole
    expect(pointInGeometry(3, 3, square)).toBe(false);
    const multi: Geometry = { type: "MultiPolygon", coordinates: [square.coordinates as number[][][], [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]]] };
    expect(pointInGeometry(10.5, 10.5, multi)).toBe(true);
    expect(pointInGeometry(0.2, 0.2, null)).toBe(false);
  });
});

describe("currentBand", () => {
  const masks: FeatureCollection<Geometry, { threshold_kt: number }> = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { threshold_kt: 0.5 }, geometry: { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] } },
      { type: "Feature", properties: { threshold_kt: 1.5 }, geometry: { type: "Polygon", coordinates: [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]] } },
    ],
  };
  const footprint: Geometry = { type: "Polygon", coordinates: [[[-5, -5], [10, -5], [10, 10], [-5, 10], [-5, -5]]] };
  it("ranks the bands and tells outside-the-computation from calm", () => {
    expect(currentBand(1.5, 1.5, masks, footprint)).toBe("over15");
    expect(currentBand(3, 3, masks, footprint)).toBe("over05");
    expect(currentBand(8, 8, masks, footprint)).toBe("under05");
    expect(currentBand(20, 20, masks, footprint)).toBe("unknown");
    expect(currentBand(1.5, 1.5, null, footprint)).toBe("unknown");
  });
  it("calls the rest of the world calm once a worldwide mask is loaded", () => {
    const worldwide: FeatureCollection<Geometry, { threshold_kt: number; global?: boolean }> = {
      type: "FeatureCollection",
      features: [...masks.features, { type: "Feature", properties: { threshold_kt: 1.5, global: true }, geometry: { type: "Polygon", coordinates: [[[30, 30], [31, 30], [31, 31], [30, 31], [30, 30]]] } }],
    };
    expect(currentBand(30.5, 30.5, worldwide, footprint)).toBe("over15");
    expect(currentBand(20, 20, worldwide, footprint)).toBe("under05");
  });
});

describe("nearestPass and distances", () => {
  const passes: FeatureCollection<Point, PassProperties> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-4.77, 48.04] },
        properties: { name: "Raz de Sein", status: "covered", country: "France", max_spring_kt: 6, max_spring_text: "6", confidence: "medium", source_url: null, coverage_class: "fine", best_source: "SHOM", candidates: [], in_objective: true },
      },
    ],
  };
  it("finds the pass within range and none beyond", () => {
    expect(kmBetween(48.0, -4.7, 48.0, -4.7)).toBe(0);
    expect(Math.round(kmBetween(48.04, -4.77, 48.04, -4.90))).toBe(10);
    expect(nearestPass(48.1, -4.8, passes)?.feature.properties.name).toBe("Raz de Sein");
    expect(nearestPass(49.0, -4.8, passes)).toBeNull();
  });
  it("escapes what goes into popups", () => {
    expect(esc('<b>"x" & y</b>')).toBe("&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
  });
});

describe("statusAt", () => {
  it("returns the status of the area under the point, null outside", () => {
    const fc: FeatureCollection<Geometry, { status: ZoneStatus }> = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { status: "covered" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } },
        { type: "Feature", properties: { status: "blocked" }, geometry: { type: "Polygon", coordinates: [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]] } },
      ],
    };
    expect(statusAt(0.5, 0.5, fc)?.status).toBe("covered");
    expect(statusAt(2.5, 0.5, fc)?.status).toBe("blocked");
    expect(statusAt(1.5, 0.5, fc)).toBeNull();
    expect(statusAt(0.5, 0.5, null)).toBeNull();
  });
});

describe("isGlobalExtent", () => {
  it("tells a worldwide fallback from a regional source", () => {
    expect(isGlobalExtent({ type: "Polygon", coordinates: [[[-180, -80], [180, -80], [180, 90], [-180, 90], [-180, -80]]] })).toBe(true);
    expect(isGlobalExtent({ type: "Polygon", coordinates: [[[-13, 46], [13, 46], [13, 63], [-13, 63], [-13, 46]]] })).toBe(false);
    expect(isGlobalExtent(null)).toBe(false);
  });
});

describe("cascadeAt", () => {
  const box = (lat0: number, lon0: number, lat1: number, lon1: number) => [lat0, lon0, lat1, lon1] as [number, number, number, number];
  const atlases: CoverageAtlas[] = [
    { name: "ATLNE", source: "marc", bbox: box(40, -20, 53, 3), cells: [box(48, -5, 48.5, -4.5)] },
    { name: "FINIS", source: "marc", bbox: box(47.3, -5.6, 49, -3.6), cells: [box(48, -5, 48.5, -4.5)] },
    { name: "MANGA", source: "marc", bbox: box(43, -6, 52, 4), cells: [box(48, -5, 48.5, -4.5)] },
    { name: "CMEMS_NWS", source: "cmems", bbox: box(46, -13, 63, 12), cells: [box(48, -5, 49, -4)] },
    { name: "SEIN", source: "shom", bbox: box(47.9, -5.2, 48.2, -4.6), cells: [box(47.9, -5.2, 48.2, -4.6)] },
    { name: "FAR", source: "marc", bbox: box(50, 0, 51, 1), cells: [box(50, 0, 50.5, 0.5)] },
  ];
  const describe = (name: string) =>
    ({ ATLNE: { rank: 1, resolution_m: 2000 }, FINIS: { rank: 2, resolution_m: 250 }, MANGA: { rank: 1, resolution_m: 700 }, CMEMS_NWS: { rank: 0, resolution_m: 1500 } })[name] ?? null;
  it("lists the atlases holding the point in cascade order, SHOM first", () => {
    const order = cascadeAt(48.1, -4.8, atlases, describe).map((a) => a.name);
    expect(order).toEqual(["SEIN", "FINIS", "MANGA", "ATLNE", "CMEMS_NWS"]);
  });
  it("ignores an atlas whose box holds the point but no tile does", () => {
    const order = cascadeAt(48.7, -4.7, atlases, describe).map((a) => a.name);
    expect(order).toEqual(["CMEMS_NWS"]);
  });
  it("matches a server label to a coverage entry", () => {
    expect(labelNamesAtlas("marc_finis_250m", atlases[1])).toBe(true);
    expect(labelNamesAtlas("shom_c2d_560_sein", atlases[4])).toBe(true);
    expect(labelNamesAtlas("cmems_nws_1500m", atlases[0])).toBe(false);
  });
});

describe("the unknown answer", () => {
  it("reads a documented zone as withheld, not as the global model", () => {
    const answer = classifyAnswer({
      covered: false,
      unknown: { zone: "Rance, en amont de l'usine marémotrice", reason: "managed" },
    });
    expect(answer.kind).toBe("unknown");
    expect(answer.label).not.toBe("openmeteo_smoc");
    expect(answer.unknown).toEqual({ zone: "Rance, en amont de l'usine marémotrice", reason: "managed" });
    // A reason this build does not know still lands on a sentence it has.
    expect(classifyAnswer({ covered: false, unknown: { zone: "x", reason: "later" } }).unknown?.reason).toBe("managed");
    // Plain uncovered water is still the global model.
    expect(classifyAnswer({ covered: false }).kind).toBe("smoc");
  });
});

describe("sourcesAt", () => {
  const box = (w: number, s: number, e: number, n: number): Geometry => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  type Src = { id: string; status: string; resolution_m: number | null; hide_in_table?: boolean; atlases?: string[] };
  const src = (id: string, status: string, resolution_m: number | null, geometry: Geometry, hide = false, atlases?: string[]): Feature<Geometry, Src> => ({
    type: "Feature",
    geometry,
    properties: { id, status, resolution_m, hide_in_table: hide, atlases },
  });
  // The Strait of Messina: the Mediterranean grid used, the global current
  // underneath, a model to clarify, the Italian tables blocked by licence.
  const world = box(-180, -85, 180, 85);
  const strait = box(15.48, 38.03, 15.72, 38.31);
  const features = [
    src("iim_tavole_messina", "blocked", null, strait),
    src("cmems_global_smoc", "current", 8000, world),
    src("fes2014_currents", "ok", 7000, world),
    src("cmcc_sanifs", "clarify", 500, box(15, 37.5, 19, 41)),
    src("cmems_med", "current", 4200, box(-6, 30, 37, 46), false, ["CMEMS_MED"]),
    src("tpxo10", "blocked", 3700, world, true),
    src("eot20", "no_currents", null, world),
    src("cmems_ibi", "current", 2500, box(-20, 26, 5, 56), false, ["CMEMS_IBI"]),
    src("shom_c2d", "current", 500, box(-6, 43, 3, 51.5), false, ["shom"]),
    src("ukho", "blocked", null, box(-11, 48, 2, 61)),
  ];
  const live = (p: Src) => p.status;
  it("lists the used source first, then the integrated ones, then the missing ones that would do better", () => {
    // Messina: the 4.2 km grid in use, so a 500 m model and the tables count,
    // a 7 km global atlas does not.
    const rows = sourcesAt(38.25, 15.635, features, live, "cmems_med", { usedResolutionM: 4200 });
    expect(rows.map((r) => [r.source.id, r.role])).toEqual([
      ["cmems_med", "used"],
      ["cmems_global_smoc", "fallback"],
      ["cmcc_sanifs", "clarify"],
      ["iim_tavole_messina", "blocked"],
    ]);
  });
  it("lists nothing missing where a fine source answers, whatever the boxes say", () => {
    const rows = sourcesAt(48.5, -5.0, features, live, "shom_c2d", { usedResolutionM: 500, heldBy: new Set(["shom", "CMEMS_IBI"]) });
    expect(rows.map((r) => [r.source.id, r.role])).toEqual([
      ["shom_c2d", "used"],
      ["cmems_global_smoc", "fallback"],
      ["cmems_ibi", "passed"],
    ]);
  });
  it("lists an integrated source only where the server says it holds the point", () => {
    // Off Gibraltar the Mediterranean box holds the point, the atlas does not.
    const rows = sourcesAt(36.0, -5.4, features, live, "cmems_ibi", { usedResolutionM: 2500, heldBy: new Set(["CMEMS_IBI"]) });
    expect(rows.find((r) => r.source.id === "cmems_med")).toBeUndefined();
    const weak = sourcesAt(36.0, -5.4, features, live, "cmems_ibi", { usedResolutionM: 2500, heldBy: new Set(["CMEMS_IBI", "CMEMS_MED"]) });
    expect(weak.find((r) => r.source.id === "cmems_med")?.role).toBe("passed");
  });
  it("makes the global current the used one when nothing else answers", () => {
    const rows = sourcesAt(10, -30, features, live, "cmems_global_smoc", { usedResolutionM: 8000 });
    expect(rows.map((r) => [r.source.id, r.role])).toEqual([
      ["cmems_global_smoc", "used"],
      ["fes2014_currents", "ok"],
    ]);
  });
});
