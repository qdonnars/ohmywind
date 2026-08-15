// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { visiblePolarPoints } from "./polarPoints";

// The no-go fix: curves must not be drawn through the dead zone. A qtVlm file
// carrying a 0° row of zeros used to drag every curve into a spike between
// the center and the first grid angle.
// The downwind edge mirrors the server's clamped lookup: every drawn curve
// ends on a synthetic 180° point at the last grid angle's speed.

describe("visiblePolarPoints", () => {
  const TWA = [0, 40, 50, 90];
  const SPEEDS = [0, 4.0, 5.0, 6.0];

  it("drops every point below the minimum upwind angle", () => {
    const pts = visiblePolarPoints(TWA, SPEEDS, 40);
    expect(pts.map((p) => p.twa)).toEqual([40, 50, 90, 180]);
    // In particular the (0°, 0 kn) point never reaches the path.
    expect(pts.some((p) => p.speed === 0)).toBe(false);
  });

  it("interpolates the entry point exactly onto the boundary", () => {
    const pts = visiblePolarPoints(TWA, SPEEDS, 45);
    expect(pts[0]).toEqual({ twa: 45, speed: 4.5 });
    expect(pts.map((p) => p.twa)).toEqual([45, 50, 90, 180]);
  });

  it("returns the full curve when the grid already starts at the boundary", () => {
    const pts = visiblePolarPoints([40, 50, 90], [4, 5, 6], 40);
    expect(pts.map((p) => p.twa)).toEqual([40, 50, 90, 180]);
    expect(pts[0]).toEqual({ twa: 40, speed: 4 });
  });

  it("keeps a grid that legitimately starts below the boundary intact above it", () => {
    // Imported performance polar with real 30° speeds, user pins 35°.
    const pts = visiblePolarPoints([30, 40, 90], [3.0, 4.0, 6.0], 35);
    expect(pts[0]).toEqual({ twa: 35, speed: 3.5 });
  });

  it("returns nothing when every angle sits inside the no-go zone", () => {
    expect(visiblePolarPoints([10, 20], [1, 2], 40)).toEqual([]);
  });

  it("extends along the equal-VMG arc when the boundary sits below a dead 0-kn row", () => {
    // User pins 28° on a file whose first real angle is 40° with a 0° row of
    // zeros: no interpolation toward the dead point (the old center spike),
    // the entry tapers from the 40° speed by cos(40°)/cos(28°).
    const pts = visiblePolarPoints([0, 40, 50], [0, 4.0, 5.0], 28);
    expect(pts.map((p) => p.twa)).toEqual([28, 40, 50, 180]);
    const expected = (4.0 * Math.cos((40 * Math.PI) / 180)) / Math.cos((28 * Math.PI) / 180);
    expect(pts[0].speed).toBeCloseTo(expected, 2);
    expect(pts[0].speed).toBeLessThan(4.0);
  });

  it("extends along the equal-VMG arc when the boundary sits below the whole grid", () => {
    const pts = visiblePolarPoints([40, 50, 90], [4.0, 5.0, 6.0], 35);
    expect(pts.map((p) => p.twa)).toEqual([35, 40, 50, 90, 180]);
    expect(pts[0].speed).toBeLessThan(4.0);
    expect(pts[0].speed).toBeGreaterThan(3.0);
  });

  it("extends flat to a 180° dead run at the last grid angle's speed", () => {
    // Archetype-shaped grid ending at 165°: the planner's lookup clamps past
    // the last angle, so the drawn dead-run speed is the 165° one.
    const pts = visiblePolarPoints([40, 90, 165], [4.0, 6.0, 5.0], 40);
    expect(pts[pts.length - 1]).toEqual({ twa: 180, speed: 5.0 });
  });

  it("does not duplicate the dead-run point when the grid reaches 180°", () => {
    const pts = visiblePolarPoints([40, 90, 180], [4.0, 6.0, 5.0], 40);
    expect(pts.filter((p) => p.twa === 180)).toHaveLength(1);
    expect(pts[pts.length - 1]).toEqual({ twa: 180, speed: 5.0 });
  });
});
