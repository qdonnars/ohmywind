// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { describeCurrentSource, formatGridSize, shomDistanceM } from "./currentSource";

describe("describeCurrentSource", () => {
  it("reads the plain Open-Meteo path as SMOC, whatever shape the absence takes", () => {
    expect(describeCurrentSource(undefined, undefined, undefined)).toEqual({ kind: "smoc" });
    expect(describeCurrentSource(null, null, null)).toEqual({ kind: "smoc" });
    expect(describeCurrentSource("", 250, 0.1)).toEqual({ kind: "smoc" });
  });

  it("reads a SHOM label with the distance to the sampled point", () => {
    expect(describeCurrentSource("shom_c2d_558_morbihan", null, 0.24)).toEqual({
      kind: "shom",
      nearestKm: 0.24,
    });
  });

  it("keeps a SHOM answer without a distance, for a Space that predates the field", () => {
    expect(describeCurrentSource("shom_c2d_560_rade_brest", undefined, undefined)).toEqual({
      kind: "shom",
      nearestKm: null,
    });
  });

  it("reads a MARC label with the grid size the overlay carried", () => {
    expect(describeCurrentSource("marc_finis_250m", 250, undefined)).toEqual({
      kind: "marc",
      resolutionM: 250,
    });
  });

  it("falls back on the label's suffix when the overlay lost the resolution", () => {
    expect(describeCurrentSource("marc_manga_700m", null, null)).toEqual({
      kind: "marc",
      resolutionM: 700,
    });
    expect(describeCurrentSource("marc_atlne_2000m", undefined, undefined)).toEqual({
      kind: "marc",
      resolutionM: 2000,
    });
  });

  it("lands an unknown label on the most cautious wording", () => {
    expect(describeCurrentSource("openmeteo_smoc", null, null)).toEqual({ kind: "smoc" });
    expect(describeCurrentSource("marc_mystery", null, null)).toEqual({ kind: "smoc" });
    expect(describeCurrentSource("somethingelse", 250, 0.1)).toEqual({ kind: "smoc" });
  });
});

describe("formatGridSize", () => {
  it("writes metres under a kilometre and whole kilometres above", () => {
    expect(formatGridSize(250)).toBe("250 m");
    expect(formatGridSize(700)).toBe("700 m");
    expect(formatGridSize(2000)).toBe("2 km");
  });

  it("keeps an odd size in metres rather than inventing a decimal", () => {
    expect(formatGridSize(1500)).toBe("1500 m");
  });
});

describe("shomDistanceM", () => {
  it("rounds to ten metres", () => {
    expect(shomDistanceM(0.24)).toBe(240);
    expect(shomDistanceM(0.333)).toBe(330);
    expect(shomDistanceM(0)).toBe(0);
    expect(shomDistanceM(0.5)).toBe(500);
  });
});
