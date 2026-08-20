// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { shouldDrawAccuracy } from "./accuracy";

describe("shouldDrawAccuracy", () => {
  it("draws the halo for a typical GPS fix", () => {
    expect(shouldDrawAccuracy(30)).toBe(true);
    expect(shouldDrawAccuracy(1200)).toBe(true);
  });

  it("skips a halo smaller than the dot itself", () => {
    expect(shouldDrawAccuracy(5)).toBe(false);
  });

  it("skips the halo for a coarse desktop fix", () => {
    // Wi-Fi and IP-derived fixes routinely report tens of kilometres. A disc
    // that size hides the coastline the user is reading.
    expect(shouldDrawAccuracy(50_000)).toBe(false);
  });

  it("rejects non-finite accuracies", () => {
    expect(shouldDrawAccuracy(Number.NaN)).toBe(false);
    expect(shouldDrawAccuracy(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
