// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import type { FeatureCollection, Geometry, Point } from "geojson";
import {
  classifyAnswer,
  currentBand,
  esc,
  kmBetween,
  nearestPass,
  pointInGeometry,
  precisionClass,
  statusAt,
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
    expect(statusAt(0.5, 0.5, fc)).toBe("covered");
    expect(statusAt(2.5, 0.5, fc)).toBe("blocked");
    expect(statusAt(1.5, 0.5, fc)).toBeNull();
    expect(statusAt(0.5, 0.5, null)).toBeNull();
  });
});
