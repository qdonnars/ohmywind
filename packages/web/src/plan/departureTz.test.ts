// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { localOffsetFor, toTzAware, tzSuffixFor } from "./departureTz";

describe("tzSuffixFor", () => {
  it("formats a positive offset", () => {
    expect(tzSuffixFor(120)).toBe("+02:00");
    expect(tzSuffixFor(60)).toBe("+01:00");
  });

  it("formats UTC as a positive zero", () => {
    expect(tzSuffixFor(0)).toBe("+00:00");
  });

  it("formats a negative offset", () => {
    expect(tzSuffixFor(-300)).toBe("-05:00");
  });

  it("formats a non-whole-hour offset", () => {
    expect(tzSuffixFor(330)).toBe("+05:30");
    expect(tzSuffixFor(-210)).toBe("-03:30");
  });
});

// The offset is injected so the assertions hold whatever the machine's
// timezone is. `localOffsetFor` gets its own coverage below.
describe("toTzAware", () => {
  it("appends the summer offset to a naive picker value", () => {
    expect(toTzAware("2026-07-04T09:30", 120)).toBe("2026-07-04T09:30:00+02:00");
  });

  it("appends the winter offset to a naive picker value", () => {
    expect(toTzAware("2026-11-04T09:30", 60)).toBe("2026-11-04T09:30:00+01:00");
  });

  it("appends a negative offset", () => {
    expect(toTzAware("2026-07-04T09:30", -300)).toBe("2026-07-04T09:30:00-05:00");
  });

  it("leaves an already offset-bearing string untouched", () => {
    expect(toTzAware("2026-07-04T09:30:00+02:00")).toBe("2026-07-04T09:30:00+02:00");
    expect(toTzAware("2026-07-04T07:30:00Z")).toBe("2026-07-04T07:30:00Z");
  });
});

describe("localOffsetFor", () => {
  it("reads the offset of the target date, not of today", () => {
    // The bug this replaces: a single offset, taken today, stamped onto a date
    // up to 14 days away. Whatever the machine's timezone, a date that sits on
    // the other side of a daylight-saving change must not inherit today's
    // offset. Compared against the platform's own answer for each instant.
    const summer = "2026-07-04T09:30";
    const winter = "2026-11-04T09:30";
    expect(localOffsetFor(summer)).toBe(-new Date(summer).getTimezoneOffset());
    expect(localOffsetFor(winter)).toBe(-new Date(winter).getTimezoneOffset());
  });

  it("distinguishes the two sides of a daylight-saving change where there is one", () => {
    // Skipped on a machine with no seasonal change (UTC, most of Asia), where
    // there is nothing to distinguish.
    const before = -new Date("2026-03-01T12:00").getTimezoneOffset();
    const after = -new Date("2026-07-01T12:00").getTimezoneOffset();
    if (before === after) return;
    expect(localOffsetFor("2026-03-01T12:00")).toBe(before);
    expect(localOffsetFor("2026-07-01T12:00")).toBe(after);
    expect(toTzAware("2026-03-01T12:00")).not.toBe(
      toTzAware("2026-07-01T12:00").replace("2026-07-01", "2026-03-01"),
    );
  });

  it("falls back to the current offset on an unparsable string", () => {
    expect(localOffsetFor("pas une date")).toBe(-new Date().getTimezoneOffset());
  });
});
