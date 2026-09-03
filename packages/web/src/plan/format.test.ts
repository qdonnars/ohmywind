// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { fmtDuration, fmtDurationSafe, num1, fmtDepthM } from "./format";

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

describe("fmtDuration", () => {
  it("formats whole hours without minutes", () => {
    expect(fmtDuration(3)).toBe("3h");
  });

  it("formats sub-hour durations as minutes only", () => {
    expect(fmtDuration(0.5)).toBe("30m");
  });

  it("zero-pads minutes in the 12h30 convention", () => {
    expect(fmtDuration(12.5)).toBe("12h30");
    expect(fmtDuration(1 + 5 / 60)).toBe("1h05");
  });

  it("rounds minutes to the nearest whole", () => {
    // 2h 29.5m rounds up to 2h30
    expect(fmtDuration(2 + 29.5 / 60)).toBe("2h30");
  });
});

describe("fmtDurationSafe", () => {
  it("delegates to fmtDuration for finite numbers", () => {
    expect(fmtDurationSafe(12.5)).toBe("12h30");
  });

  it("returns a dash for null, undefined and non-finite input", () => {
    expect(fmtDurationSafe(null)).toBe("—");
    expect(fmtDurationSafe(undefined)).toBe("—");
    expect(fmtDurationSafe(Number.NaN)).toBe("—");
    expect(fmtDurationSafe(Infinity)).toBe("—");
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
