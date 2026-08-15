// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { roundView } from "./useMapView";

describe("roundView", () => {
  it("keeps two decimals, about a kilometre", () => {
    expect(roundView({ lat: 48.390512, lon: -4.486076, zoom: 10 })).toEqual({
      lat: 48.39,
      lon: -4.49,
      zoom: 10,
    });
  });

  it("collapses nearby positions, so nudging the map does not re-render", () => {
    const a = roundView({ lat: 43.2961, lon: 5.3699, zoom: 9 });
    const b = roundView({ lat: 43.2964, lon: 5.3702, zoom: 9 });
    expect(a).toEqual(b);
  });

  it("rounds negative longitudes away from zero the same way", () => {
    expect(roundView({ lat: 12.005, lon: -4.494, zoom: 8 }).lon).toBe(-4.49);
    expect(roundView({ lat: 12.005, lon: -4.496, zoom: 8 }).lon).toBe(-4.5);
  });

  it("rounds the fractional zoom Leaflet produces on pinch", () => {
    expect(roundView({ lat: 48, lon: -4, zoom: 9.4 }).zoom).toBe(9);
    expect(roundView({ lat: 48, lon: -4, zoom: 9.6 }).zoom).toBe(10);
  });
});
