// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { CALM_COLOR, RAMP_STOPS, RasterGrid, decodePixel, maxCurrentAt, rampColor, rampGradient, type RasterEntry } from "./tidalRaster";

describe("ramp", () => {
  it("runs from the palest green at 0 kt to the darkest at 5 kt, without a step", () => {
    expect(rampColor(0)).toBe(CALM_COLOR);
    expect(rampColor(-1)).toBe(CALM_COLOR);
    expect(rampColor(0.5)).toBe(RAMP_STOPS[1][1]);
    // Between 0 and 0.5 kt the colour moves: no flat calm band any more.
    expect(rampColor(0.2)).not.toBe(rampColor(0));
    expect(rampColor(0.2)).not.toBe(rampColor(0.5));
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
