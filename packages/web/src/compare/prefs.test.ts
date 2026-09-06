// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { clampSheet, DEFAULT_PREFS, sanitisePrefs } from "./prefs";

describe("sanitisePrefs", () => {
  it("falls back to the defaults on anything that is not an object", () => {
    expect(sanitisePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitisePrefs("3")).toEqual(DEFAULT_PREFS);
    expect(sanitisePrefs([])).toEqual({ ...DEFAULT_PREFS, hidden: [] });
  });

  it("keeps a valid payload as is", () => {
    const prefs = { res: 1, win: [8, 14], wave: false, hidden: ["43.3,5.35"], sheet: 55 };
    expect(sanitisePrefs(prefs)).toEqual(prefs);
  });

  it("repairs each field on its own", () => {
    expect(sanitisePrefs({ res: 2, win: [30, -2], wave: "yes", hidden: [1, "a", null] })).toEqual({
      res: 3,
      win: [22, 24],
      wave: true,
      hidden: ["a"],
      sheet: 78,
    });
    expect(sanitisePrefs({ win: [6] }).win).toEqual([6, 22]);
    expect(sanitisePrefs({ win: ["6", "22"] }).win).toEqual([6, 22]);
  });
});

describe("clampSheet", () => {
  it("keeps the sheet between its handle and the full screen", () => {
    expect(clampSheet(78)).toBe(78);
    expect(clampSheet(0)).toBe(15);
    expect(clampSheet(-40)).toBe(15);
    expect(clampSheet(140)).toBe(100);
    expect(clampSheet(62.4)).toBe(62);
  });
});

describe("sanitisePrefs, sheet height", () => {
  it("defaults to the open sheet and repairs anything out of bounds", () => {
    expect(sanitisePrefs({}).sheet).toBe(78);
    expect(sanitisePrefs({ sheet: "80" }).sheet).toBe(78);
    expect(sanitisePrefs({ sheet: Number.NaN }).sheet).toBe(78);
    expect(sanitisePrefs({ sheet: 3 }).sheet).toBe(15);
    expect(sanitisePrefs({ sheet: 240 }).sheet).toBe(100);
    expect(sanitisePrefs({ sheet: 42.6 }).sheet).toBe(43);
  });
});
