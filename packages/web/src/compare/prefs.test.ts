// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, sanitisePrefs } from "./prefs";

describe("sanitisePrefs", () => {
  it("falls back to the defaults on anything that is not an object", () => {
    expect(sanitisePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitisePrefs("3")).toEqual(DEFAULT_PREFS);
    expect(sanitisePrefs([])).toEqual({ ...DEFAULT_PREFS, hidden: [] });
  });

  it("keeps a valid payload as is", () => {
    const prefs = { res: 1, win: [8, 14], wave: false, hidden: ["43.3,5.35"] };
    expect(sanitisePrefs(prefs)).toEqual(prefs);
  });

  it("repairs each field on its own", () => {
    expect(sanitisePrefs({ res: 2, win: [30, -2], wave: "yes", hidden: [1, "a", null] })).toEqual({
      res: 3,
      win: [22, 24],
      wave: true,
      hidden: ["a"],
    });
    expect(sanitisePrefs({ win: [6] }).win).toEqual([6, 22]);
    expect(sanitisePrefs({ win: ["6", "22"] }).win).toEqual([6, 22]);
  });
});
