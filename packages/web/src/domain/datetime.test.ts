// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import {
  fmtClock,
  fmtDay,
  fmtDayLong,
  formatHour,
  capitalise,
  localOffsetFor,
  nowParisHourPrefix,
  parisIsoToUtcMs,
  parisOffsetMinAt,
  toNaiveLocal,
  toTzAware,
  tzSuffixFor,
} from "./datetime";

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

describe("toNaiveLocal", () => {
  it("formats a Date as the string the slider and the URL share", () => {
    expect(toNaiveLocal(new Date("2026-01-05T07:04:00"))).toBe("2026-01-05T07:04");
  });

  it("zero-pads every field", () => {
    expect(toNaiveLocal(new Date("2026-09-02T00:00:00"))).toBe("2026-09-02T00:00");
  });

  it("round-trips through toTzAware and back to the same wall clock", () => {
    const naive = "2026-09-02T14:35";
    expect(toTzAware(naive).startsWith(`${naive}:00`)).toBe(true);
  });
});

describe("parisOffsetMinAt", () => {
  it("reads CET in winter and CEST in summer", () => {
    expect(parisOffsetMinAt("2026-01-15T12:00")).toBe(60);
    expect(parisOffsetMinAt("2026-07-01T12:00")).toBe(120);
  });

  it("resolves the hour before the spring-forward jump as CET", () => {
    // 2026-03-29: Paris jumps 02:00 CET to 03:00 CEST at 01:00 UTC. 01:00
    // local is still CET; reading the offset at the naive string taken as UTC
    // landed past the switch and answered CEST.
    expect(parisOffsetMinAt("2026-03-29T00:00")).toBe(60);
    expect(parisOffsetMinAt("2026-03-29T01:00")).toBe(60);
    expect(parisOffsetMinAt("2026-03-29T03:00")).toBe(120);
  });

  it("resolves the hour before the fall-back as CEST", () => {
    // 2026-10-25: Paris falls back from 03:00 CEST to 02:00 CET at 01:00 UTC.
    expect(parisOffsetMinAt("2026-10-25T00:00")).toBe(120);
    expect(parisOffsetMinAt("2026-10-25T01:00")).toBe(120);
    expect(parisOffsetMinAt("2026-10-25T03:00")).toBe(60);
  });
});

describe("parisIsoToUtcMs", () => {
  it("CEST (summer): Paris midnight is 22:00 UTC the day before", () => {
    const ms = parisIsoToUtcMs("2026-07-01T00:00");
    expect(new Date(ms).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("CET (winter): Paris midnight is 23:00 UTC the day before", () => {
    const ms = parisIsoToUtcMs("2026-01-15T00:00");
    expect(new Date(ms).toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("CEST mid-day: 12:00 Paris = 10:00 UTC", () => {
    const ms = parisIsoToUtcMs("2026-07-01T12:00");
    expect(new Date(ms).toISOString()).toBe("2026-07-01T10:00:00.000Z");
  });

  it("accepts a timestamp carrying seconds", () => {
    expect(new Date(parisIsoToUtcMs("2026-07-01T12:00:00")).toISOString()).toBe(
      "2026-07-01T10:00:00.000Z",
    );
  });

  it("is memoized: repeated calls return the very same value", () => {
    const first = parisIsoToUtcMs("2026-05-08T07:00");
    for (let i = 0; i < 5; i++) {
      expect(parisIsoToUtcMs("2026-05-08T07:00")).toBe(first);
    }
    // Interleaving other keys must not evict or corrupt the first one.
    parisIsoToUtcMs("2026-05-08T08:00");
    parisIsoToUtcMs("2026-01-15T00:00");
    expect(parisIsoToUtcMs("2026-05-08T07:00")).toBe(first);
  });

  it("maps every hour of the spring-forward day onto its real instant", () => {
    // 2026-03-29: Paris jumps 02:00 CET to 03:00 CEST. 02:00 local never
    // happens; it resolves to the hour that replaced it, 03:00 CEST.
    const cases: [string, string][] = [
      ["2026-03-29T00:00", "2026-03-28T23:00:00.000Z"],
      ["2026-03-29T01:00", "2026-03-29T00:00:00.000Z"],
      ["2026-03-29T02:00", "2026-03-29T01:00:00.000Z"],
      ["2026-03-29T03:00", "2026-03-29T01:00:00.000Z"],
      ["2026-03-29T04:00", "2026-03-29T02:00:00.000Z"],
    ];
    for (const [iso, expected] of cases) {
      expect(new Date(parisIsoToUtcMs(iso)).toISOString()).toBe(expected);
      // second read comes from the memo and must match byte for byte
      expect(new Date(parisIsoToUtcMs(iso)).toISOString()).toBe(expected);
    }
  });

  it("maps every hour of the fall-back day onto its real instant", () => {
    // 2026-10-25: Paris falls back from 03:00 CEST to 02:00 CET. 02:00 local
    // happens twice; the later, CET occurrence is the one resolved.
    const cases: [string, string][] = [
      ["2026-10-25T00:00", "2026-10-24T22:00:00.000Z"],
      ["2026-10-25T01:00", "2026-10-24T23:00:00.000Z"],
      ["2026-10-25T02:00", "2026-10-25T01:00:00.000Z"],
      ["2026-10-25T03:00", "2026-10-25T02:00:00.000Z"],
      ["2026-10-25T04:00", "2026-10-25T03:00:00.000Z"],
    ];
    for (const [iso, expected] of cases) {
      expect(new Date(parisIsoToUtcMs(iso)).toISOString()).toBe(expected);
      expect(new Date(parisIsoToUtcMs(iso)).toISOString()).toBe(expected);
    }
  });

  it("keeps returning correct values past the memo cap", () => {
    // The map is cleared wholesale when it fills up; a value read after the
    // reset must be recomputed identically rather than lost.
    const probe = "2026-07-01T00:00";
    const before = parisIsoToUtcMs(probe);
    for (let i = 0; i < 4200; i++) {
      const day = String((i % 28) + 1).padStart(2, "0");
      const hour = String(i % 24).padStart(2, "0");
      const minute = String(i % 60).padStart(2, "0");
      parisIsoToUtcMs(`2027-02-${day}T${hour}:${minute}`);
    }
    expect(parisIsoToUtcMs(probe)).toBe(before);
  });
});

describe("nowParisHourPrefix", () => {
  it("matches the Paris hour of the current instant", () => {
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    })
      .format(new Date())
      .replace(", ", "T")
      .replace("24", "00");
    expect(nowParisHourPrefix()).toBe(expected);
  });
});

// Locale data ships with Node, so these assertions are stable across machines;
// only the browser timezone varies, and the timestamps below are absolute.
describe("French display formatters", () => {
  const at = new Date("2026-09-03T08:05:00Z");

  it("formats a clock with two digits", () => {
    expect(fmtClock(new Date("2026-09-03T08:05:00"))).toBe("08:05");
  });

  it("accepts an ISO string as readily as a Date", () => {
    expect(fmtClock("2026-09-03T08:05:00")).toBe(fmtClock(new Date("2026-09-03T08:05:00")));
    expect(fmtDay("2026-09-03T08:05:00Z")).toBe(fmtDay(at));
  });

  it("formats a short French day", () => {
    expect(fmtDay(new Date("2026-09-03T12:00:00"))).toBe("jeu. 3 sept.");
  });

  it("formats a long French day", () => {
    expect(fmtDayLong(new Date("2026-09-03T12:00:00"))).toBe("jeudi 3 septembre");
  });

  it("capitalises the first letter only", () => {
    expect(capitalise(fmtDay(new Date("2026-09-03T12:00:00")))).toBe("Jeu. 3 sept.");
    expect(capitalise("")).toBe("");
  });
});

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
