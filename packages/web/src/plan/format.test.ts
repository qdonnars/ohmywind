// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { fmtMinutes, fmtSpanSafe, num1, fmtDepthM } from "./format";

describe("fmtDepthM", () => {
  it("keeps a decimal under 10 m, where the metre under the keel counts", () => {
    expect(fmtDepthM(4.62)).toBe("4,6 m");
    expect(fmtDepthM(9.99)).toBe("10,0 m");
  });

  it("rounds to the metre from 10 m up", () => {
    expect(fmtDepthM(10)).toBe("10 m");
    expect(fmtDepthM(23.4)).toBe("23 m");
  });

  it("uses the French decimal comma, like the rest of the panel", () => {
    expect(fmtDepthM(3.05)).not.toContain(".");
  });
});

describe("fmtMinutes", () => {
  it("formats whole hours without minutes", () => {
    expect(fmtMinutes(180)).toBe("3h");
  });

  it("formats sub-hour durations as minutes only", () => {
    expect(fmtMinutes(30)).toBe("30m");
    expect(fmtMinutes(43)).toBe("43m");
  });

  it("zero-pads minutes in the 12h30 convention", () => {
    expect(fmtMinutes(750)).toBe("12h30");
    expect(fmtMinutes(65)).toBe("1h05");
    expect(fmtMinutes(331)).toBe("5h31");
  });
});

describe("fmtSpanSafe", () => {
  it("reads the span on the clocks, seconds cut", () => {
    expect(fmtSpanSafe("2026-11-25T09:00:00+00:00", "2026-11-25T14:31:55.062828+00:00")).toBe("5h31");
    // 1h59m45s, which decimal hours rounded to « 1h60 ».
    expect(fmtSpanSafe("2026-11-25T09:00:00+00:00", "2026-11-25T10:59:45+00:00")).toBe("1h59");
  });

  it("returns a dash for a missing or unreadable end", () => {
    expect(fmtSpanSafe(null, "2026-11-25T09:00:00+00:00")).toBe("—");
    expect(fmtSpanSafe("2026-11-25T09:00:00+00:00", undefined)).toBe("—");
    expect(fmtSpanSafe("not a date", "2026-11-25T09:00:00+00:00")).toBe("—");
  });
});

describe("num1", () => {
  it("formats one decimal with a comma separator", () => {
    expect(num1(38.2)).toBe("38,2");
  });

  it("keeps a trailing zero", () => {
    expect(num1(40)).toBe("40,0");
  });
});
