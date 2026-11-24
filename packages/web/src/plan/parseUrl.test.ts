// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import {
  buildPlanUrl,
  isParsedOk,
  parseEffParam,
  parseMotorParam,
  parsePlanUrl,
  type ParsedPlanParams,
} from "./parseUrl";

const ROUTE = "wpts=43.29,5.37;43.00,6.20&departure=2026-09-10T08:00&archetype=cruiser_30ft";

function parsed(search: string): ParsedPlanParams {
  const r = parsePlanUrl(search);
  if (!isParsedOk(r)) throw new Error(r.error);
  return r;
}

describe("the engine of a link (motor=<threshold>,<speed>)", () => {
  it("reads both numbers, in knots", () => {
    expect(parseMotorParam("4,5.5")).toEqual({ thresholdKn: 4, speedKn: 5.5 });
    expect(parseMotorParam("30,30")).toEqual({ thresholdKn: 30, speedKn: 30 });
    expect(parseMotorParam("0.1,0.5")).toEqual({ thresholdKn: 0.1, speedKn: 0.5 });
  });

  it("drops half an engine", () => {
    expect(parseMotorParam("4")).toBeNull();
    expect(parseMotorParam("4,")).toBeNull();
    expect(parseMotorParam(",5.5")).toBeNull();
    expect(parseMotorParam("")).toBeNull();
    expect(parseMotorParam("4,5.5,6")).toBeNull();
  });

  it("drops values outside the domain's bounds", () => {
    expect(parseMotorParam("0,5.5")).toBeNull(); // threshold must be > 0
    expect(parseMotorParam("31,5.5")).toBeNull(); // threshold ≤ 30
    expect(parseMotorParam("4,0.4")).toBeNull(); // speed ≥ 0.5
    expect(parseMotorParam("4,31")).toBeNull(); // speed ≤ 30
    expect(parseMotorParam("-4,5.5")).toBeNull();
  });

  it("drops what is not a plain number", () => {
    expect(parseMotorParam("4abc,5.5")).toBeNull();
    expect(parseMotorParam("NaN,5.5")).toBeNull();
    expect(parseMotorParam("4,Infinity")).toBeNull();
    expect(parseMotorParam("1e1,5")).toBeNull();
    expect(parseMotorParam("4;5.5")).toBeNull();
  });

  it("is null when absent", () => {
    expect(parseMotorParam(null)).toBeNull();
  });
});

describe("the efficiency of a link (eff=<fraction>)", () => {
  it("reads a fraction in ]0 ; 1]", () => {
    expect(parseEffParam("0.85")).toBe(0.85);
    expect(parseEffParam("1")).toBe(1);
    expect(parseEffParam(".6")).toBe(0.6);
  });

  it("drops what is out of bounds or not a number", () => {
    expect(parseEffParam("0")).toBeNull();
    expect(parseEffParam("1.2")).toBeNull();
    expect(parseEffParam("85")).toBeNull();
    expect(parseEffParam("-0.5")).toBeNull();
    expect(parseEffParam("")).toBeNull();
    expect(parseEffParam("abc")).toBeNull();
    expect(parseEffParam(null)).toBeNull();
  });
});

describe("parsePlanUrl and the link settings", () => {
  it("carries no settings when the link has none", () => {
    expect(parsed(`?${ROUTE}`).link).toBeNull();
  });

  it("carries both when valid", () => {
    expect(parsed(`?${ROUTE}&motor=4,5.5&eff=0.85`).link).toEqual({
      motor: { thresholdKn: 4, speedKn: 5.5 },
      efficiency: 0.85,
    });
  });

  it("keeps the valid one when the other is not", () => {
    expect(parsed(`?${ROUTE}&motor=4&eff=0.85`).link).toEqual({ motor: null, efficiency: 0.85 });
    expect(parsed(`?${ROUTE}&motor=4,5.5&eff=2`).link).toEqual({
      motor: { thresholdKn: 4, speedKn: 5.5 },
      efficiency: null,
    });
  });

  it("opens the plan anyway when the settings are invalid", () => {
    const r = parsed(`?${ROUTE}&motor=banana&eff=-1`);
    expect(r.link).toBeNull();
    expect(r.waypoints).toEqual([
      [43.29, 5.37],
      [43.0, 6.2],
    ]);
    expect(r.archetype).toBe("cruiser_30ft");
  });

  it("reads them on a link without a route too", () => {
    expect(parsed("?motor=4,5.5").link).toEqual({
      motor: { thresholdKn: 4, speedKn: 5.5 },
      efficiency: null,
    });
  });
});

describe("buildPlanUrl", () => {
  const wpts: [number, number][] = [
    [43.29, 5.37],
    [43.0, 6.2],
  ];

  it("writes no settings when there are none", () => {
    const url = buildPlanUrl(wpts, "2026-09-10T08:00", "cruiser_30ft");
    expect(url).not.toContain("motor=");
    expect(url).not.toContain("eff=");
    expect(buildPlanUrl(wpts, "2026-09-10T08:00", "cruiser_30ft", null)).toBe(url);
  });

  it("round-trips the settings through parsePlanUrl", () => {
    const link = { motor: { thresholdKn: 4, speedKn: 5.5 }, efficiency: 0.85 };
    const url = buildPlanUrl(wpts, "2026-09-10T08:00", "cruiser_30ft", link);
    expect(url).toContain("&motor=4,5.5&eff=0.85");
    const back = parsed(url.slice(url.indexOf("?")));
    expect(back.link).toEqual(link);
    expect(back.waypoints).toEqual(wpts);
    expect(back.departure).toBe("2026-09-10T08:00");
  });

  it("writes only the setting the link carries", () => {
    const onlyEff = buildPlanUrl(wpts, "2026-09-10T08:00", "cruiser_30ft", {
      motor: null,
      efficiency: 0.9,
    });
    expect(onlyEff).toContain("&eff=0.9");
    expect(onlyEff).not.toContain("motor=");
    const onlyMotor = buildPlanUrl(wpts, "2026-09-10T08:00", "cruiser_30ft", {
      motor: { thresholdKn: 3, speedKn: 6 },
      efficiency: null,
    });
    expect(onlyMotor).toContain("&motor=3,6");
    expect(onlyMotor).not.toContain("eff=");
  });
});
