// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { flareSizePx, STAR_SIZE_PX } from "./lightSymbolSize";
import { MAJOR_LIGHTS } from "../data/majorLights";

describe("STAR_SIZE_PX", () => {
  it("stays put at the raster's own size: the star marks a position, and blowing it up says nothing the raster did not already say", () => {
    expect(STAR_SIZE_PX).toBeGreaterThanOrEqual(9);
    expect(STAR_SIZE_PX).toBeLessThanOrEqual(13);
  });
});

describe("flareSizePx", () => {
  it("grows well past the raster flare once zoomed out, which is the whole point", () => {
    expect(flareSizePx(9)).toBeGreaterThan(2 * flareSizePx(13));
    expect(flareSizePx(10)).toBeGreaterThan(flareSizePx(13));
  });

  it("converges on the raster flare zoomed in, so there is no threshold to pop across", () => {
    expect(flareSizePx(13)).toBe(flareSizePx(18));
    expect(flareSizePx(16)).toBe(flareSizePx(13));
  });

  it("never grows without bound: the Finistère must not become overlapping streaks", () => {
    expect(flareSizePx(3)).toBe(flareSizePx(6));
    expect(flareSizePx(0)).toBeLessThanOrEqual(40);
  });

  it("grows monotonically as the map zooms out", () => {
    for (let zoom = 3; zoom < 18; zoom++) {
      expect(flareSizePx(zoom)).toBeGreaterThanOrEqual(flareSizePx(zoom + 1));
    }
  });

  it("survives the fractional zooms Leaflet reports mid-pinch", () => {
    expect(flareSizePx(10.5)).toBeGreaterThan(flareSizePx(11));
    expect(flareSizePx(10.5)).toBeLessThan(flareSizePx(10));
  });

  it("keeps the flare the dominant half of the symbol at every zoom", () => {
    for (let zoom = 3; zoom <= 18; zoom++) {
      expect(flareSizePx(zoom)).toBeGreaterThan(STAR_SIZE_PX);
    }
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

  it("carries no duplicate position, which would stack two identical symbols", () => {
    const keys = MAJOR_LIGHTS.map(([lat, lon]) => `${lat},${lon}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tags every light with a colour the stylesheet knows how to paint", () => {
    for (const [, , colour] of MAJOR_LIGHTS) {
      expect(["y", "r", "g", "m"]).toContain(colour);
    }
  });

  it("uses all four colours: a dataset that collapsed to one would mean the tag reading broke", () => {
    const used = new Set(MAJOR_LIGHTS.map(([, , colour]) => colour));
    expect(used.size).toBe(4);
  });
});
