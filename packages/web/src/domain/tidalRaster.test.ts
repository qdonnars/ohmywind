// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { CALM_COLOR, RAMP_STOPS, RasterGrid, decodePixel, isWeakCoarse, maxCurrentAt, rampColor, rampGradient, weakTideAt, type RasterEntry } from "./tidalRaster";

describe("ramp", () => {
  it("is calm under 0.5 kt, darkens up to 5 kt and clamps above", () => {
    expect(rampColor(0.2)).toBe(CALM_COLOR);
    expect(rampColor(0.5)).toBe(RAMP_STOPS[0][1]);
    expect(rampColor(5)).toBe(RAMP_STOPS[RAMP_STOPS.length - 1][1]);
    expect(rampColor(9)).toBe(rampColor(5));
    // Between two stops the colour is between the two, component by component.
    const mid = rampColor(1.25);
    expect(mid).not.toBe(rampColor(1));
    expect(mid).not.toBe(rampColor(1.5));
    expect(rampGradient()).toContain("linear-gradient(");
  });
});

describe("pixels and grids", () => {
  const entry: RasterEntry = { atlas: "T", label: "test", resolution_m: 250, file: "raster/t.png", bounds: [[48, -5], [49, -4]], scale: 40, cells: 4 };
  // 2 x 2 image: north row = [no cell, 2.0 kt], south row = [0.5 kt, 6 kt]
  const grid = new RasterGrid(entry, 2, 2, new Uint8Array([0, 81, 21, 241]));

  it("decodes the value and finds the pixel under a point, Mercator rows included", () => {
    expect(decodePixel(0, 40)).toBeNull();
    expect(decodePixel(81, 40)).toBe(2);
    expect(grid.valueAt(48.75, -4.25)).toBe(2);
    expect(grid.valueAt(48.75, -4.75)).toBeNull();
    expect(grid.valueAt(48.25, -4.75)).toBe(0.5);
    expect(grid.valueAt(48.25, -4.25)).toBe(6);
    expect(grid.valueAt(50, -4.5)).toBeNull();
  });

  it("prefers the finest atlas that has a cell", () => {
    const coarse: RasterEntry = { ...entry, atlas: "C", resolution_m: 2000 };
    const coarseGrid = new RasterGrid(coarse, 1, 1, new Uint8Array([41]));
    expect(maxCurrentAt(48.75, -4.25, [coarseGrid, grid])?.entry.atlas).toBe("T");
    expect(maxCurrentAt(48.75, -4.75, [coarseGrid, grid])).toEqual({ kt: 1, entry: coarse });
  });
});

describe("the weak-tide rule, as the server applies it", () => {
  const atlne: RasterEntry = { atlas: "ATLNE", label: "ATLNE 2 km", resolution_m: 2000, rank: 1, file: "raster/atlne.png", bounds: [[46, -13], [48, -11]], scale: 40, cells: 1 };
  const nws: RasterEntry = { atlas: "CMEMS_NWS", label: "NWS 1,5 km", resolution_m: 1500, rank: 0, file: "raster/nws.png", bounds: [[46, -13], [48, -11]], scale: 40, cells: 1 };
  const finis: RasterEntry = { ...atlne, atlas: "FINIS", label: "FINIS 250 m", resolution_m: 250, rank: 2 };

  it("passes an open-sea atlas under 0.2 kt to the next source, keeps a coastal one", () => {
    expect(isWeakCoarse(atlne, 0.08)).toBe(true);
    expect(isWeakCoarse(atlne, 0.2)).toBe(false);
    expect(isWeakCoarse(finis, 0.05)).toBe(false);
    // MANGA, 700 m but a shelf atlas: in the deep Bay of Biscay its 0.06 kt passes too.
    expect(isWeakCoarse({ ...atlne, atlas: "MANGA", resolution_m: 700 }, 0.06)).toBe(true);
    // 1 + round(0.08 * 40) = 4; 1 + round(0.45 * 40) = 19.
    const weak = new RasterGrid(atlne, 1, 1, new Uint8Array([4]));
    const strong = new RasterGrid(nws, 1, 1, new Uint8Array([19]));
    expect(maxCurrentAt(47, -12, [weak, strong])?.entry.atlas).toBe("CMEMS_NWS");
    expect(maxCurrentAt(47, -12, [weak])).toBeNull();
    expect(weakTideAt(47, -12, [weak])?.entry.atlas).toBe("ATLNE");
  });
});
