// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import {
  beaufortLevel,
  beaufortLowerBoundKn,
  currentsLevel,
  directionSpreadDeg,
  MODEL_DIRECTION_SPREAD_DEG,
  tidesLevel,
  waveLevel,
  windLevelToken,
  windLevelVar,
  windSoftVar,
  windTextVar,
} from "./thresholds";

describe("beaufortLevel", () => {
  it("puts a flat calm at level 0", () => {
    expect(beaufortLevel(0)).toBe(0);
    expect(beaufortLevel(3.9)).toBe(0);
  });

  it("steps up on each band edge", () => {
    // The edge belongs to the band above: 4 kn is B1, not B0.
    const edges: [number, number][] = [
      [4, 1], [7, 2], [11, 3], [15, 4], [19, 5], [23, 6], [28, 7], [33, 8],
    ];
    for (const [kn, level] of edges) {
      expect(beaufortLevel(kn - 0.1)).toBe(level - 1);
      expect(beaufortLevel(kn)).toBe(level);
    }
  });

  it("caps a mistral and anything above at level 8", () => {
    expect(beaufortLevel(40)).toBe(8);
    expect(beaufortLevel(120)).toBe(8);
  });

  it("gives each level the knots it starts at", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(beaufortLowerBoundKn)).toEqual([0, 4, 7, 11, 15, 19, 23, 28, 33]);
    for (let level = 1; level <= 8; level++) {
      expect(beaufortLevel(beaufortLowerBoundKn(level))).toBe(level);
    }
  });

  it("names the token of every level it can return", () => {
    for (let level = 0; level <= 8; level++) {
      expect(windLevelToken(level)).toBe(`--ow-w-${level}`);
      expect(windLevelVar(level)).toBe(`var(--ow-w-${level})`);
    }
  });
});

describe("waveLevel", () => {
  it("steps on the sea ramp's thresholds", () => {
    expect([0.1, 0.4, 0.8, 1.2, 2, 3].map(waveLevel)).toEqual([0, 1, 2, 3, 4, 5]);
    // The edge belongs to the step above.
    expect([0.3, 0.6, 1.0, 1.5, 2.5].map(waveLevel)).toEqual([1, 2, 3, 4, 5]);
  });

  it("paints a mer formée past the dark blues", () => {
    // From a metre the ramp turns light and the ink dark: at 1,25 m, where
    // the server starts calling a sea « formée », it never sits on the calm
    // blues.
    expect(waveLevel(1.25)).toBeGreaterThanOrEqual(3);
  });
});

describe("currentsLevel", () => {
  it("leaves a Mediterranean drift uncoloured", () => {
    expect(currentsLevel(0.1)).toBe(0);
    expect(currentsLevel(0.29)).toBe(0);
  });

  it("keeps a typical Mediterranean current on the cool end", () => {
    expect(currentsLevel(0.7)).toBe(1);
  });

  it("reserves the top level for a Raz Blanchard spring tide", () => {
    expect(currentsLevel(9.9)).toBe(7);
    expect(currentsLevel(10)).toBe(8);
  });
});

describe("tidesLevel", () => {
  it("colours by magnitude, so high and low water read alike", () => {
    expect(tidesLevel(Math.abs(-4.2))).toBe(tidesLevel(4.2));
  });

  it("steps on each band edge", () => {
    expect(tidesLevel(0.49)).toBe(1);
    expect(tidesLevel(0.5)).toBe(2);
    expect(tidesLevel(1.5)).toBe(4);
    expect(tidesLevel(3.0)).toBe(6);
    expect(tidesLevel(5.0)).toBe(8);
  });
});

describe("windSoftVar", () => {
  it("leaves a calm whole", () => {
    expect(windSoftVar(0)).toBe("color-mix(in oklch, var(--ow-w-0) 100%, var(--ow-bg-0))");
  });

  it("softens every other level to 78 % over the page background", () => {
    for (let level = 1; level <= 8; level++) {
      expect(windSoftVar(level)).toBe(
        `color-mix(in oklch, var(--ow-w-${level}) 78%, var(--ow-bg-0))`,
      );
    }
  });

  it("names the ink of every level", () => {
    for (let level = 0; level <= 8; level++) {
      expect(windTextVar(level)).toBe(`var(--ow-cell-text-${level})`);
    }
  });
});

describe("directionSpreadDeg", () => {
  it("measures the arc across north, not around the compass", () => {
    expect(directionSpreadDeg([350, 10])).toBe(20);
    expect(directionSpreadDeg([10, 350])).toBe(20);
  });

  it("covers every model, not only the two extremes of the list", () => {
    expect(directionSpreadDeg([300, 340, 265, 10])).toBe(105);
  });

  it("is nothing for one direction or for directions that agree", () => {
    expect(directionSpreadDeg([])).toBe(0);
    expect(directionSpreadDeg([123])).toBe(0);
    expect(directionSpreadDeg([200, 200, 200])).toBe(0);
  });

  it("takes directions outside 0-360", () => {
    expect(directionSpreadDeg([-10, 370])).toBe(20);
  });

  it("puts the disagreement threshold at 45 degrees", () => {
    expect(MODEL_DIRECTION_SPREAD_DEG).toBe(45);
  });
});
