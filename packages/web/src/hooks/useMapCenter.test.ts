import { describe, it, expect } from "vitest";
import { roundCenter } from "./useMapCenter";

describe("roundCenter", () => {
  it("keeps two decimals, about a kilometre", () => {
    expect(roundCenter({ lat: 48.390512, lon: -4.486076 })).toEqual({
      lat: 48.39,
      lon: -4.49,
    });
  });

  it("collapses nearby positions, so nudging the map does not re-render", () => {
    const a = roundCenter({ lat: 43.2961, lon: 5.3699 });
    const b = roundCenter({ lat: 43.2964, lon: 5.3702 });
    expect(a).toEqual(b);
  });

  it("rounds negative longitudes away from zero the same way", () => {
    expect(roundCenter({ lat: 12.005, lon: -4.494 }).lon).toBe(-4.49);
    expect(roundCenter({ lat: 12.005, lon: -4.496 }).lon).toBe(-4.5);
  });
});
