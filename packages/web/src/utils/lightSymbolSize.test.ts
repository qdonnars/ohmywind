// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { lightSizePx } from "./lightSymbolSize";
import { MAJOR_LIGHTS } from "../data/majorLights";

/** What the OpenSeaMap raster draws a light as, in px. The vector symbol is
    sized against it, so the comparisons below are the actual contract. */
const RASTER_STAR_PX = 9;

describe("lightSizePx", () => {
  it("lands near 3x the raster at z9 and 2x at z10, the two scales this was reported at", () => {
    expect(lightSizePx(9) / RASTER_STAR_PX).toBeGreaterThan(2.5);
    expect(lightSizePx(10) / RASTER_STAR_PX).toBeGreaterThan(2);
    expect(lightSizePx(10) / RASTER_STAR_PX).toBeLessThan(3);
  });

  it("converges on the raster symbol once zoomed in, so there is no threshold to pop across", () => {
    expect(lightSizePx(14)).toBe(lightSizePx(18));
    expect(Math.abs(lightSizePx(16) - RASTER_STAR_PX)).toBeLessThanOrEqual(3);
  });

  it("never grows without bound: a whole-France view must not become a field of stars", () => {
    expect(lightSizePx(3)).toBe(lightSizePx(6));
    expect(lightSizePx(0)).toBeLessThanOrEqual(28);
  });

  it("grows monotonically as the map zooms out, which is the whole point", () => {
    for (let zoom = 3; zoom < 18; zoom++) {
      expect(lightSizePx(zoom)).toBeGreaterThanOrEqual(lightSizePx(zoom + 1));
    }
  });

  it("survives the fractional zooms Leaflet reports mid-pinch", () => {
    expect(lightSizePx(10.5)).toBeGreaterThan(lightSizePx(11));
    expect(lightSizePx(10.5)).toBeLessThan(lightSizePx(10));
  });
});

describe("MAJOR_LIGHTS", () => {
  it("covers both coasts rather than one basin", () => {
    expect(MAJOR_LIGHTS.some(([, lon]) => lon < -1)).toBe(true); // Atlantique
    expect(MAJOR_LIGHTS.some(([, lon]) => lon > 4)).toBe(true); // Méditerranée
    expect(MAJOR_LIGHTS.length).toBeGreaterThan(150);
  });

  it("holds plausible coordinates: a swapped lat/lon pair would put a lighthouse in the desert", () => {
    for (const [lat, lon] of MAJOR_LIGHTS) {
      expect(lat).toBeGreaterThan(40);
      expect(lat).toBeLessThan(52);
      expect(lon).toBeGreaterThan(-6);
      expect(lon).toBeLessThan(10);
    }
  });

  it("carries no duplicate position, which would stack two identical stars", () => {
    const keys = MAJOR_LIGHTS.map(([lat, lon]) => `${lat},${lon}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
