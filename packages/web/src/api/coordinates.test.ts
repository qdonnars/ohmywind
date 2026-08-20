// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { parseCoordinates, formatCoordinates } from "./coordinates";

describe("parseCoordinates", () => {
  it("reads a decimal pair", () => {
    expect(parseCoordinates("48.39, -4.49")).toEqual({ lat: 48.39, lon: -4.49 });
    expect(parseCoordinates("  43.29 5.37 ")).toEqual({ lat: 43.29, lon: 5.37 });
  });

  it("reads French comma decimals", () => {
    expect(parseCoordinates("48,39 -4,49")).toEqual({ lat: 48.39, lon: -4.49 });
    expect(parseCoordinates("48,39, -4,49")).toEqual({ lat: 48.39, lon: -4.49 });
  });

  it("reads degrees and decimal minutes, the form used on charts", () => {
    const parsed = parseCoordinates("48°23.4'N 4°29.7'W");
    expect(parsed?.lat).toBeCloseTo(48.39, 2);
    expect(parsed?.lon).toBeCloseTo(-4.495, 3);
  });

  it("reads degrees minutes seconds", () => {
    const parsed = parseCoordinates("48°23'24\"N 4°29'42\"W");
    expect(parsed?.lat).toBeCloseTo(48.39, 2);
    expect(parsed?.lon).toBeCloseTo(-4.495, 3);
  });

  it("accepts the French O for Ouest", () => {
    const parsed = parseCoordinates("47°38,5' N 3°21,0' O");
    expect(parsed?.lon).toBeLessThan(0);
  });

  it("accepts hemisphere letters before the numbers", () => {
    const parsed = parseCoordinates("N 48 23.4 W 004 29.7");
    expect(parsed?.lat).toBeCloseTo(48.39, 2);
    expect(parsed?.lon).toBeCloseTo(-4.495, 3);
  });

  it("rejects place names that merely contain numbers", () => {
    expect(parseCoordinates("Route 66")).toBeNull();
    expect(parseCoordinates("Saint-Martin")).toBeNull();
    expect(parseCoordinates("Port 2000")).toBeNull();
  });

  it("rejects out-of-range values", () => {
    expect(parseCoordinates("120.5, 4.2")).toBeNull();
    expect(parseCoordinates("48.3, 200.1")).toBeNull();
  });
});

describe("formatCoordinates", () => {
  it("echoes back in degrees and decimal minutes, French style", () => {
    expect(formatCoordinates(48.39, -4.495)).toBe("48°23,4' N 4°29,7' O");
  });

  it("marks southern and eastern hemispheres", () => {
    expect(formatCoordinates(-33.5, 18.25)).toBe("33°30,0' S 18°15,0' E");
  });
});
