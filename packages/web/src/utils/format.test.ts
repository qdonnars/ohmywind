// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { formatDayHeader, formatHour } from "./format";

// `parisTzOffsetMin` is module-private; "utc" mode is the only path that
// exercises it without depending on the machine timezone, so the tests below
// go through formatHour(iso, "utc") on purpose.
describe("formatHour, utc mode", () => {
  it("subtracts the CEST offset in summer", () => {
    expect(formatHour("2026-07-01T12:00", "utc")).toBe("10");
  });

  it("subtracts the CET offset in winter", () => {
    expect(formatHour("2026-01-15T12:00", "utc")).toBe("11");
  });

  it("is stable across repeated calls (memoized offset)", () => {
    const first = formatHour("2026-07-01T12:00", "utc");
    for (let i = 0; i < 5; i++) {
      expect(formatHour("2026-07-01T12:00", "utc")).toBe(first);
    }
    // Other keys in between must not disturb the cached one.
    formatHour("2026-01-15T12:00", "utc");
    formatHour("2026-03-29T04:00", "utc");
    expect(formatHour("2026-07-01T12:00", "utc")).toBe(first);
  });

  it("switches offset on the day Paris springs forward", () => {
    // 2026-03-29: CET (+01:00) before 01:00 UTC, CEST (+02:00) after.
    expect(formatHour("2026-03-29T00:00", "utc")).toBe("23");
    expect(formatHour("2026-03-29T04:00", "utc")).toBe("2");
    expect(formatHour("2026-03-30T04:00", "utc")).toBe("2");
  });

  it("switches offset on the day Paris falls back", () => {
    // 2026-10-25: CEST (+02:00) before 01:00 UTC, CET (+01:00) after.
    expect(formatHour("2026-10-25T00:00", "utc")).toBe("22");
    expect(formatHour("2026-10-25T04:00", "utc")).toBe("3");
    expect(formatHour("2026-10-26T04:00", "utc")).toBe("3");
  });
});

describe("formatDayHeader, boat mode", () => {
  it("reads the day straight off the Paris date part", () => {
    expect(formatDayHeader("2026-07-01T12:00", "boat")).toBe("WED 1");
    expect(formatDayHeader("2026-03-29T02:00", "boat")).toBe("SUN 29");
  });
});
