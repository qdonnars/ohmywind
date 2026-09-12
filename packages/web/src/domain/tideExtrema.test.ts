// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { findTideExtrema } from "./tideExtrema";

/** A semi-diurnal tide (M2, 12.42 h) sampled on the hour, peak at `peakH`. */
function m2(amplitude: number, peakH: number, hours: number): number[] {
  return Array.from({ length: hours }, (_, h) =>
    amplitude * Math.cos((2 * Math.PI * (h - peakH)) / 12.42),
  );
}

describe("findTideExtrema", () => {
  it("returns no extremum on a monotonic or too-short series", () => {
    expect(findTideExtrema([])).toEqual([]);
    expect(findTideExtrema([1, 2])).toEqual([]);
    expect(findTideExtrema([1, 2, 3, 4])).toEqual([]);
  });

  it("finds a high water that falls exactly on the hour", () => {
    const [hw] = findTideExtrema(m2(3, 6, 13));
    expect(hw.type).toBe("high");
    expect(hw.idx).toBe(6);
    expect(hw.offset).toBeCloseTo(0, 6);
    expect(hw.height).toBeCloseTo(3, 6);
  });

  it("locates a high water falling between two samples", () => {
    // Peak at 06:23: the highest sample is 06:00, the vertex sits 0.38 h later.
    const [hw] = findTideExtrema(m2(3, 6.38, 13));
    expect(hw.idx).toBe(6);
    expect(hw.offset).toBeCloseTo(0.38, 1);
    // Within a few minutes: the parabola stands in for a cosine.
    expect(Math.abs(hw.offset - 0.38) * 60).toBeLessThan(3);
    // The hourly sample reads lower than the peak; the vertex recovers it.
    expect(m2(3, 6.38, 13)[6]).toBeLessThan(2.95);
    expect(hw.height).toBeCloseTo(3, 2);
  });

  it("locates a high water just before the hour with a negative offset", () => {
    const [hw] = findTideExtrema(m2(3, 5.7, 13));
    expect(hw.idx).toBe(6);
    expect(hw.offset).toBeCloseTo(-0.3, 1);
    expect(hw.offset).toBeGreaterThanOrEqual(-0.5);
  });

  it("locates a low water and its trough height", () => {
    // Trough at 12.21 h (half a period after a 06:00 peak).
    const series = m2(3, 6, 20);
    const lw = findTideExtrema(series).find((e) => e.type === "low");
    expect(lw).toBeDefined();
    expect(lw!.idx).toBe(12);
    expect(lw!.offset).toBeCloseTo(0.21, 1);
    expect(lw!.height).toBeCloseTo(-3, 2);
  });

  it("puts a symmetric plateau midway between the two equal samples", () => {
    const [hw] = findTideExtrema([1, 2, 2, 1]);
    expect(hw.idx).toBe(1);
    expect(hw.offset).toBeCloseTo(0.5, 6);
    expect(hw.height).toBeCloseTo(2.125, 6);
  });

  it("never wanders more than half a step from the extreme sample", () => {
    for (let peak = 4; peak < 8; peak += 0.05) {
      const [hw] = findTideExtrema(m2(2.5, peak, 13));
      expect(Math.abs(hw.offset)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it("skips a turn touching a missing sample", () => {
    expect(findTideExtrema([1, 2, null, 2, 1])).toEqual([]);
    expect(findTideExtrema([1, 2, 1, null, 0, 1]).map((e) => e.idx)).toEqual([1]);
  });
});
