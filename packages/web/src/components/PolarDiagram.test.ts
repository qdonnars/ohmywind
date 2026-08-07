import { describe, expect, it } from "vitest";
import { visiblePolarPoints } from "./polarPoints";

// The no-go fix: curves must not be drawn through the dead zone. A qtVlm file
// carrying a 0° row of zeros used to drag every curve into a spike between
// the center and the first grid angle.

describe("visiblePolarPoints", () => {
  const TWA = [0, 40, 50, 90];
  const SPEEDS = [0, 4.0, 5.0, 6.0];

  it("drops every point below the minimum upwind angle", () => {
    const pts = visiblePolarPoints(TWA, SPEEDS, 40);
    expect(pts.map((p) => p.twa)).toEqual([40, 50, 90]);
    // In particular the (0°, 0 kn) point never reaches the path.
    expect(pts.some((p) => p.speed === 0)).toBe(false);
  });

  it("interpolates the entry point exactly onto the boundary", () => {
    const pts = visiblePolarPoints(TWA, SPEEDS, 45);
    expect(pts[0]).toEqual({ twa: 45, speed: 4.5 });
    expect(pts.map((p) => p.twa)).toEqual([45, 50, 90]);
  });

  it("returns the full curve when the grid already starts at the boundary", () => {
    const pts = visiblePolarPoints([40, 50, 90], [4, 5, 6], 40);
    expect(pts).toHaveLength(3);
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
});
