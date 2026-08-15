// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { parseMapView, mapViewQuery } from "./mapViewParams";

describe("parseMapView", () => {
  it("reads a center and a zoom", () => {
    expect(parseMapView("?center=48.39,-4.49&zoom=11")).toEqual({
      lat: 48.39,
      lon: -4.49,
      zoom: 11,
    });
  });

  it("falls back to a region-wide zoom when only a center is given", () => {
    // Links generated before zoom was carried, and hand-typed deep links.
    expect(parseMapView("?center=43.3,5.35")?.zoom).toBe(8);
  });

  it("clamps a zoom outside the tile layers' range", () => {
    expect(parseMapView("?center=43.3,5.35&zoom=42")?.zoom).toBe(19);
    expect(parseMapView("?center=43.3,5.35&zoom=-3")?.zoom).toBe(2);
  });

  it("returns nothing without a center", () => {
    expect(parseMapView("?zoom=11")).toBeNull();
    expect(parseMapView("")).toBeNull();
  });

  it("rejects malformed or out-of-range coordinates", () => {
    expect(parseMapView("?center=abc,def")).toBeNull();
    expect(parseMapView("?center=48.39")).toBeNull();
    expect(parseMapView("?center=120,5")).toBeNull();
    expect(parseMapView("?center=48,200")).toBeNull();
  });
});

describe("mapViewQuery", () => {
  it("round-trips through parseMapView", () => {
    const view = { lat: 47.35, lon: -3.16, zoom: 12 };
    expect(parseMapView(mapViewQuery(view))).toEqual(view);
  });

  it("is empty when there is no view to carry", () => {
    expect(mapViewQuery(null)).toBe("");
    expect(mapViewQuery(undefined)).toBe("");
  });
});
