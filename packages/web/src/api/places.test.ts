// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import type { PlaceResult } from "./places";
import {
  dedupePlaces,
  matchSavedSpots,
  normalizeForMatch,
  formatDistance,
  withDistances,
} from "./places";

function place(name: string, latitude: number, longitude: number): PlaceResult {
  return { id: `${name}${latitude}`, name, latitude, longitude, context: "", source: "photon" };
}

describe("normalizeForMatch", () => {
  it("ignores case and diacritics", () => {
    expect(normalizeForMatch("Île d'Yeu")).toBe("ile d'yeu");
    expect(normalizeForMatch("  SÈTE ")).toBe("sete");
  });
});

describe("dedupePlaces", () => {
  it("collapses the repeats OSM emits for a linear feature", () => {
    // Raz de Sein comes back once per way; they sit within a couple of miles.
    const results = [
      place("Raz de Sein", 48.010, -4.739),
      place("Raz de Sein", 48.003, -4.783),
      place("Raz de Sein", 48.020, -4.750),
    ];
    expect(dedupePlaces(results)).toHaveLength(1);
  });

  it("keeps homonyms that are genuinely apart", () => {
    const results = [
      place("Le Palais", 47.347, -3.155), // Belle-Île
      place("Le Palais", 45.865, 1.324), // Haute-Vienne
    ];
    expect(dedupePlaces(results)).toHaveLength(2);
  });

  it("preserves the incoming order", () => {
    const results = [place("Brest", 48.39, -4.49), place("Camaret", 48.27, -4.59)];
    expect(dedupePlaces(results).map((r) => r.name)).toEqual(["Brest", "Camaret"]);
  });
});

describe("matchSavedSpots", () => {
  const spots = [
    { name: "Cherbourg", latitude: 49.64, longitude: -1.62 },
    { name: "Saint-Malo", latitude: 48.65, longitude: -2.02 },
    { name: "Port de Saint-Cast", latitude: 48.64, longitude: -2.25 },
  ];

  it("matches without regard to case or accents", () => {
    expect(matchSavedSpots(spots, "cherb", null).map((s) => s.name)).toEqual(["Cherbourg"]);
  });

  it("ranks a prefix match above a match buried in the name", () => {
    const names = matchSavedSpots(spots, "saint", null).map((s) => s.name);
    expect(names[0]).toBe("Saint-Malo");
    expect(names).toContain("Port de Saint-Cast");
  });

  it("returns nothing for an empty query", () => {
    expect(matchSavedSpots(spots, "   ", null)).toEqual([]);
  });

  it("annotates distances when a reference point is known", () => {
    const [match] = matchSavedSpots(spots, "cherb", { lat: 49.64, lon: -1.62 });
    expect(match.distanceNm).toBeCloseTo(0, 1);
  });
});

describe("withDistances", () => {
  it("leaves results untouched without a reference point", () => {
    const results = [place("Brest", 48.39, -4.49)];
    expect(withDistances(results, null)[0].distanceNm).toBeUndefined();
  });
});

describe("formatDistance", () => {
  it("stays vague under a mile, where precision is noise", () => {
    expect(formatDistance(0.4)).toBe("à moins d'1 nm");
  });

  it("keeps one decimal close by and rounds further out", () => {
    expect(formatDistance(4.28)).toBe("à 4,3 nm");
    expect(formatDistance(42.6)).toBe("à 43 nm");
  });

  it("says nothing when there is no distance", () => {
    expect(formatDistance(undefined)).toBeNull();
  });
});
