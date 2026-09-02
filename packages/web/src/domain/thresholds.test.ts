// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import {
  beaufortLevel,
  currentsLevel,
  cxLevel,
  cxLevelToken,
  cxLevelVar,
  SEA_FORMED_HS_M,
  tidesLevel,
  wavesLevel,
  windLevelToken,
  windLevelVar,
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

  it("names the token of every level it can return", () => {
    for (let level = 0; level <= 8; level++) {
      expect(windLevelToken(level)).toBe(`--ow-w-${level}`);
      expect(windLevelVar(level)).toBe(`var(--ow-w-${level})`);
    }
  });
});

describe("wavesLevel", () => {
  it("follows the server sea bands", () => {
    // plate < 0.5, belle < 1, agitée < 2, forte < 3, très forte beyond.
    expect(wavesLevel(0.3)).toBe(1);
    expect(wavesLevel(0.5)).toBe(2);
    expect(wavesLevel(1.0)).toBe(4);
    expect(wavesLevel(2.0)).toBe(6);
    expect(wavesLevel(3.0)).toBe(8);
  });

  it("puts the mer formée cutoff inside the agitée band", () => {
    // The chip and the cell colour have to agree: an Hs just over the cutoff
    // is called "Mer Formée" and painted with the agitée level.
    expect(wavesLevel(SEA_FORMED_HS_M + 0.01)).toBe(4);
    expect(SEA_FORMED_HS_M).toBeGreaterThan(1.0);
    expect(SEA_FORMED_HS_M).toBeLessThan(2.0);
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

describe("cxLevel", () => {
  it("maps the per-segment true wind onto five levels", () => {
    expect(cxLevel(5)).toBe(1);
    expect(cxLevel(10)).toBe(2);
    expect(cxLevel(15)).toBe(3);
    expect(cxLevel(20)).toBe(4);
    expect(cxLevel(25)).toBe(5);
    expect(cxLevel(60)).toBe(5);
  });

  it("names the token of every level it can return", () => {
    for (let level = 1; level <= 5; level++) {
      expect(cxLevelToken(level)).toBe(`--ow-c-${level}`);
      expect(cxLevelVar(level)).toBe(`var(--ow-c-${level})`);
    }
  });
});
