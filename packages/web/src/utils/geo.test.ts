import { describe, expect, it } from "vitest";
import { haversineNm, fmtNm } from "./geo";

describe("haversineNm", () => {
  it("treats one degree of latitude as ~60 nm", () => {
    // A degree of latitude is ~60 nm anywhere on the globe by definition.
    const d = haversineNm(43.0, 5.0, 44.0, 5.0);
    expect(d).toBeCloseTo(60, 0);
  });

  it("is symmetric", () => {
    const ab = haversineNm(43.29, 5.37, 43.0, 6.2);
    const ba = haversineNm(43.0, 6.2, 43.29, 5.37);
    expect(ab).toBeCloseTo(ba, 10);
  });

  it("returns zero for identical points", () => {
    expect(haversineNm(43.29, 5.37, 43.29, 5.37)).toBe(0);
  });

  it("gives ~40 nm from Marseille to Porquerolles", () => {
    // Marseille (43.29, 5.37) -> Porquerolles (43.00, 6.20). The great-circle
    // distance is ~40 nm; charted passage plans quote ~38 nm along a coastal
    // rhumb line, so a 36-42 nm band brackets the expected order of magnitude.
    const d = haversineNm(43.29, 5.37, 43.0, 6.2);
    expect(d).toBeGreaterThan(36);
    expect(d).toBeLessThan(42);
  });
});

describe("fmtNm", () => {
  it("keeps one decimal below 10 nm with a French comma", () => {
    expect(fmtNm(9.83)).toBe("9,8 nm");
    expect(fmtNm(0)).toBe("0,0 nm");
    expect(fmtNm(4.25)).toBe("4,3 nm");
  });

  it("rounds to an integer at or above 10 nm", () => {
    expect(fmtNm(12.4)).toBe("12 nm");
    expect(fmtNm(10)).toBe("10 nm");
    expect(fmtNm(37.6)).toBe("38 nm");
  });
});
