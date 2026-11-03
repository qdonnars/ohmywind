// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";

import { PRESS_ARTICLES } from "./press";

describe("PRESS_ARTICLES", () => {
  it("lists the articles newest first, each with a dated, quoted primary edition", () => {
    for (const a of PRESS_ARTICLES) {
      expect(a.date, a.outlet).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.primary.title.length, a.outlet).toBeGreaterThan(0);
      expect(a.primary.lead.length, a.outlet).toBeGreaterThan(0);
      expect(new URL(a.primary.url).hostname, a.outlet).toContain(a.primary.site);
      for (const e of a.editions) expect(new URL(e.url).hostname, a.outlet).toContain(e.site);
    }
    const dates = PRESS_ARTICLES.map((a) => a.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
