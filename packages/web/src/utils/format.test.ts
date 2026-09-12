// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { formatDayHeader, formatHour, formatHourMinute } from "./format";

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

describe("formatHourMinute", () => {
  // 2026-07-01T12:23 Paris (CEST, +02:00) = 10:23 UTC.
  const summer = Date.UTC(2026, 6, 1, 10, 23);
  // 2026-01-15T12:23 Paris (CET, +01:00) = 11:23 UTC.
  const winter = Date.UTC(2026, 0, 15, 11, 23);

  it("keeps the minutes, in UTC", () => {
    expect(formatHourMinute(summer, "utc")).toBe("10:23");
    expect(formatHourMinute(winter, "utc")).toBe("11:23");
  });

  it("reads the Paris wall clock in boat mode, across the DST switch", () => {
    expect(formatHourMinute(summer, "boat")).toBe("12:23");
    expect(formatHourMinute(winter, "boat")).toBe("12:23");
  });

  it("pads to two digits and never shows 24:00", () => {
    expect(formatHourMinute(Date.UTC(2026, 6, 1, 0, 5), "utc")).toBe("00:05");
    expect(formatHourMinute(Date.UTC(2026, 6, 1, 22, 0), "boat")).toBe("00:00");
  });

  it("follows the browser clock in local mode", () => {
    const d = new Date(summer);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    expect(formatHourMinute(summer, "local")).toBe(`${hh}:${mm}`);
  });
});

describe("formatDayHeader, boat mode", () => {
  it("reads the day straight off the Paris date part", () => {
    expect(formatDayHeader("2026-07-01T12:00", "boat")).toBe("WED 1");
    expect(formatDayHeader("2026-03-29T02:00", "boat")).toBe("SUN 29");
  });
});
