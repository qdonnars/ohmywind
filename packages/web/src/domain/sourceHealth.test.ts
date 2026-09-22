// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { sourceFreshness } from "./sourceHealth";
import type { CoverageAtlas } from "./tidalMapGeo";

const atlas = (record_end?: string, built_at?: string): CoverageAtlas => ({ name: "X", bbox: [0, 0, 1, 1], cells: [], record_end, built_at });
const NOW = new Date("2026-09-22T20:00:00Z");

describe("sourceFreshness", () => {
  it("reads a yearly atlas analysed last week as fresh, and one analysed two years ago as late", () => {
    expect(sourceFreshness("yearly", [atlas("2026-09-19T23:00:00+00:00")], NOW)).toEqual({ state: "fresh", asOf: "2026-09-19T23:00:00+00:00" });
    expect(sourceFreshness("yearly", [atlas("2024-08-31T23:00:00+00:00")], NOW).state).toBe("late");
  });

  it("flags a daily source whose archive stopped three days ago", () => {
    expect(sourceFreshness("daily", [atlas("2026-09-19T00:00:00+00:00")], NOW).state).toBe("late");
    expect(sourceFreshness("daily", [atlas("2026-09-22T00:00:00+00:00")], NOW).state).toBe("fresh");
  });

  it("judges a source by its stalest served atlas", () => {
    expect(sourceFreshness("yearly", [atlas("2026-09-19T00:00:00Z"), atlas("2024-01-01T00:00:00Z")], NOW).state).toBe("late");
  });

  it("falls back on the build date, and says so when there is none", () => {
    expect(sourceFreshness("yearly", [atlas(undefined, "2026-09-20T10:00:00Z")], NOW).state).toBe("fresh");
    expect(sourceFreshness("yearly", [atlas()], NOW).state).toBe("undated");
  });

  it("keeps frozen, live and unserved apart from the age rule", () => {
    expect(sourceFreshness("frozen", [atlas("2013-01-01T00:00:00Z")], NOW).state).toBe("frozen");
    expect(sourceFreshness("live", [], NOW).state).toBe("live");
    expect(sourceFreshness("yearly", [], NOW).state).toBe("unserved");
  });
});
