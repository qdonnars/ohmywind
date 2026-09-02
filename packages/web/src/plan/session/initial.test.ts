// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import {
  resolveInitialSession,
  tomorrowRoundedLocal,
  defaultSweepLatest,
  toNaiveLocal,
  type InitialSessionInput,
} from "./initial";
import { parsePlanUrl } from "../parseUrl";
import type { PlanDraft } from "../draft";
import type { LastSimulation } from "../lastSimulation";
import type { PassageReport, ComplexityScore, PassageWindow } from "../types";
import { defaultPolarConfig, type PolarConfig } from "../../config/polarConfig";

// Fixed clock, well before every timestamp below unless stated otherwise.
const NOW = new Date("2026-09-02T10:00:00").getTime();
const FUTURE = "2026-09-10T08:00";
const PAST = "2026-01-01T08:00";
const FINGERPRINT = "arome|cruiser_30ft||c0.75";

const MARSEILLE: [number, number] = [43.29, 5.37];
const PORQUEROLLES: [number, number] = [43.0, 6.2];
const TOULON: [number, number] = [43.1, 5.93];

const passage = (): PassageReport => ({
  archetype: "cruiser_30ft",
  departure_time: "2026-09-10T08:00:00+02:00",
  arrival_time: "2026-09-10T18:00:00+02:00",
  duration_h: 10,
  distance_nm: 55,
  efficiency: 0.75,
  model: "meteofrance_arome_france_hd",
  segments: [],
  warnings: [],
});

const complexity = (): ComplexityScore => ({
  level: 2,
  label: "Modéré",
  wind_level: 2,
  wind_label: "Modéré",
  sea_level: 1,
  sea_label: "Calme",
  tws_max_kn: 14,
  hs_max_m: 0.8,
  rationale: "",
});

const aWindow = (): PassageWindow => ({
  departure: "2026-09-10T08:00:00+02:00",
  arrival: "2026-09-10T18:00:00+02:00",
  duration_h: 10,
  distance_nm: 55,
  complexity: { level: 2, label: "Modéré", tws_max_kn: 14, rationale: "" },
  conditions_summary: {
    tws_min_kn: 8,
    tws_max_kn: 14,
    predominant_sail_angle: "largue",
    hs_min_m: 0.3,
    hs_max_m: 0.8,
  },
  warnings: [],
});

const cache = (over: Partial<LastSimulation> = {}): LastSimulation => ({
  v: 1,
  waypoints: [MARSEILLE, PORQUEROLLES],
  archetype: "cruiser_30ft",
  configFingerprint: FINGERPRINT,
  mode: "single",
  single: {
    departure: FUTURE,
    passage: passage(),
    complexity: complexity(),
    forecastUpdatedAt: "2026-09-02T06:00:00Z",
  },
  cachedAt: NOW - 3600_000,
  ...over,
});

const compareBlock = (over: Partial<NonNullable<LastSimulation["compare"]>> = {}) => ({
  sweepEarliest: "2026-09-11T06:00",
  sweepLatest: "2026-09-13T06:00",
  sweepIntervalHours: 6,
  windows: [aWindow()],
  metaWarnings: ["modèle dégradé"],
  forecastUpdatedAt: "2026-09-02T05:00:00Z",
  ...over,
});

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  waypoints: [TOULON, PORQUEROLLES],
  departure: FUTURE,
  timeAnchor: "departure",
  archetype: "racer_35ft",
  mode: "compare",
  sweepEarliest: "2026-09-12T06:00",
  sweepLatest: "2026-09-14T06:00",
  sweepIntervalHours: 2,
  savedAt: NOW - 60_000,
  ...over,
});

const wptsParam = (wpts: [number, number][]) =>
  wpts.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(";");

function resolve(over: Partial<InitialSessionInput> = {}, polar?: PolarConfig) {
  return resolveInitialSession({
    url: parsePlanUrl(""),
    draft: null,
    cache: null,
    polarConfig: polar ?? defaultPolarConfig(),
    configFingerprint: FINGERPRINT,
    now: NOW,
    ...over,
  });
}

describe("resolveInitialSession: route precedence", () => {
  it.each([
    [
      "draft over URL and cache",
      { draft: draft(), url: parsePlanUrl(`?wpts=${wptsParam([MARSEILLE, PORQUEROLLES])}`), cache: cache() },
      "draft",
      [TOULON, PORQUEROLLES],
    ],
    [
      "URL over cache",
      { url: parsePlanUrl(`?wpts=${wptsParam([TOULON, PORQUEROLLES])}`), cache: cache() },
      "url",
      [TOULON, PORQUEROLLES],
    ],
    ["cache when the URL is silent", { cache: cache() }, "cache", [MARSEILLE, PORQUEROLLES]],
    ["nothing at all", {}, "none", []],
  ])("takes %s", (_label, input, source, waypoints) => {
    const s = resolve(input);
    expect(s.sources.route).toBe(source);
    // The URL rounds to 5 decimals, so compare on that precision.
    expect(s.waypoints.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)])).toEqual(waypoints);
  });

  it("ignores a URL carrying a single waypoint, and falls back to the cache", () => {
    const s = resolve({
      url: parsePlanUrl(`?wpts=${wptsParam([MARSEILLE])}`),
      cache: cache(),
    });
    // One waypoint is a parse error, so nothing usable comes out of the URL.
    expect(s.urlError).not.toBeNull();
    expect(s.sources.route).toBe("cache");
  });

  it("ignores a cache holding fewer than two waypoints", () => {
    const s = resolve({ cache: cache({ waypoints: [MARSEILLE] }) });
    expect(s.sources.route).toBe("none");
    expect(s.waypoints).toEqual([]);
  });
});

describe("resolveInitialSession: boat precedence", () => {
  const customized: PolarConfig = { ...defaultPolarConfig(), base: "racer_40ft", spi: "asymmetric" };

  it.each([
    [
      "a customized polar over everything",
      customized,
      { url: parsePlanUrl(`?wpts=${wptsParam([MARSEILLE, PORQUEROLLES])}&archetype=cata_38ft`), cache: cache() },
      "racer_40ft",
      "polar",
    ],
    [
      "the draft over the URL",
      undefined,
      {
        draft: draft(),
        url: parsePlanUrl(`?wpts=${wptsParam([MARSEILLE, PORQUEROLLES])}&archetype=cata_38ft`),
      },
      "racer_35ft",
      "draft",
    ],
    [
      "the URL over the cache",
      undefined,
      { url: parsePlanUrl(`?wpts=${wptsParam([MARSEILLE, PORQUEROLLES])}&archetype=cata_38ft`), cache: cache() },
      "cata_38ft",
      "url",
    ],
    ["the cache over the default", undefined, { cache: cache({ archetype: "cata_38ft" }) }, "cata_38ft", "cache"],
    ["the /config default", undefined, {}, "cruiser_30ft", "default"],
  ])("takes %s", (_label, polar, input, slug, source) => {
    const s = resolve(input, polar);
    expect(s.archetype).toBe(slug);
    expect(s.sources.boat).toBe(source);
  });
});

describe("resolveInitialSession: departure precedence and freshness", () => {
  it.each([
    ["the draft", { draft: draft({ departure: "2026-09-11T09:00" }) }, "2026-09-11T09:00", "draft"],
    [
      "the URL",
      { url: parsePlanUrl(`?wpts=${wptsParam([MARSEILLE, PORQUEROLLES])}&departure=2026-09-12T07:00`) },
      "2026-09-12T07:00",
      "url",
    ],
    ["the cached single-mode run", { cache: cache() }, FUTURE, "cache"],
    [
      "the cached sweep start when there is no single run",
      { cache: cache({ single: undefined, mode: "compare", compare: compareBlock() }) },
      "2026-09-11T06:00",
      "cache",
    ],
  ])("takes %s", (_label, input, departure, source) => {
    const s = resolve(input);
    expect(s.departure).toBe(departure);
    expect(s.sources.departure).toBe(source);
  });

  it.each([
    ["a draft left overnight", { draft: draft({ departure: PAST }) }],
    [
      "a bookmarked link from last winter",
      { url: parsePlanUrl(`?wpts=${wptsParam([MARSEILLE, PORQUEROLLES])}&departure=${PAST}`) },
    ],
    ["an expired cache", { cache: cache({ single: undefined, mode: "compare", compare: compareBlock({ sweepEarliest: PAST }) }) }],
  ])("falls back to tomorrow rather than seeding a past departure from %s", (_label, input) => {
    const s = resolve(input);
    expect(s.departure).toBe(tomorrowRoundedLocal(NOW));
    expect(s.sources.departure).toBe("default");
  });

  it("derives the sweep range from the resolved departure by default", () => {
    const s = resolve();
    expect(s.sweepEarliest).toBe(s.departure);
    expect(s.sweepLatest).toBe(defaultSweepLatest(s.departure));
    expect(s.sweepIntervalHours).toBe(3);
  });

  it("prefers the draft sweep, then the cached one", () => {
    expect(resolve({ draft: draft(), cache: cache({ compare: compareBlock() }) })).toMatchObject({
      sweepEarliest: "2026-09-12T06:00",
      sweepLatest: "2026-09-14T06:00",
      sweepIntervalHours: 2,
    });
    expect(resolve({ cache: cache({ compare: compareBlock() }) })).toMatchObject({
      sweepEarliest: "2026-09-11T06:00",
      sweepLatest: "2026-09-13T06:00",
      sweepIntervalHours: 6,
    });
  });
});

describe("resolveInitialSession: mode and staleness", () => {
  it("opens on the drafted mode, then the cached one, then single", () => {
    expect(resolve({ draft: draft({ mode: "compare" }) }).mode).toBe("compare");
    expect(resolve({ cache: cache({ mode: "compare" }) }).mode).toBe("compare");
    expect(resolve().mode).toBe("single");
  });

  it("opens stale on a restored draft, and computes nothing", () => {
    const s = resolve({ draft: draft(), cache: cache() });
    expect(s.isStale).toBe(true);
    expect(s.passage).toBeNull();
    expect(s.windows).toBeNull();
    expect(s.mount).toEqual({ rewriteUrl: false, fetch: false });
  });

  it("is not stale when the route came from the URL or the cache", () => {
    expect(resolve({ cache: cache() }).isStale).toBe(false);
  });

  it("skips the pick-a-mode step as soon as a route exists", () => {
    expect(resolve({ cache: cache() }).actionTaken).toBe(true);
    expect(resolve({ draft: draft() }).actionTaken).toBe(true);
    expect(resolve({ draft: draft({ waypoints: [TOULON] }) }).actionTaken).toBe(false);
    expect(resolve().actionTaken).toBe(false);
  });
});

describe("resolveInitialSession: restoring results from the URL (path A)", () => {
  const url = parsePlanUrl(
    `?wpts=${wptsParam([MARSEILLE, PORQUEROLLES])}&departure=${FUTURE}&archetype=cruiser_30ft`,
  );

  it("restores the passage when route, boat, fingerprint and departure all match", () => {
    const s = resolve({ url, cache: cache() });
    expect(s.passage?.distance_nm).toBe(55);
    expect(s.complexity?.level).toBe(2);
    expect(s.forecastUpdatedAt).toBe("2026-09-02T06:00:00Z");
    expect(s.mount).toEqual({ rewriteUrl: false, fetch: false });
  });

  it.each([
    ["another route", cache({ waypoints: [TOULON, PORQUEROLLES] })],
    ["another boat", cache({ archetype: "cata_38ft" })],
    ["another /config fingerprint", cache({ configFingerprint: "gfs|cruiser_30ft||c1" })],
    ["no fingerprint at all (pre-config era)", cache({ configFingerprint: undefined })],
  ])("computes instead of restoring a cache about %s", (_label, stale) => {
    const s = resolve({ url, cache: stale });
    expect(s.passage).toBeNull();
    expect(s.mount).toEqual({ rewriteUrl: false, fetch: true });
  });

  it("restores the sweep table even when the departure does not match", () => {
    const s = resolve({
      url,
      cache: cache({ mode: "compare", single: undefined, compare: compareBlock() }),
    });
    expect(s.windows).toHaveLength(1);
    expect(s.metaWarnings).toEqual(["modèle dégradé"]);
    // The sweep's own stamp is used when no single-mode block was restored.
    expect(s.forecastUpdatedAt).toBe("2026-09-02T05:00:00Z");
    expect(s.mount.fetch).toBe(false);
  });

  it("computes when there is no cache at all", () => {
    expect(resolve({ url }).mount).toEqual({ rewriteUrl: false, fetch: true });
  });

  it("keeps the historic quirk: a matching cache whose single departure differs restores nothing and computes nothing", () => {
    const s = resolve({
      url: parsePlanUrl(
        `?wpts=${wptsParam([MARSEILLE, PORQUEROLLES])}&departure=${PAST}&archetype=cruiser_30ft`,
      ),
      cache: cache({ single: { ...cache().single!, departure: PAST } }),
    });
    // The URL departure has passed, so the slider falls back to tomorrow and
    // no longer lines up with the cached run.
    expect(s.departure).toBe(tomorrowRoundedLocal(NOW));
    expect(s.passage).toBeNull();
    expect(s.mount).toEqual({ rewriteUrl: false, fetch: false });
  });
});

describe("resolveInitialSession: restoring results from the cache (path B)", () => {
  it("restores and rewrites the address bar without touching the network", () => {
    const s = resolve({ cache: cache({ compare: compareBlock() }) });
    expect(s.passage?.distance_nm).toBe(55);
    expect(s.windows).toHaveLength(1);
    expect(s.forecastUpdatedAt).toBe("2026-09-02T06:00:00Z");
    expect(s.mount).toEqual({ rewriteUrl: true, fetch: false });
  });

  it.each([
    ["the /config fingerprint moved", cache({ configFingerprint: "gfs|cruiser_30ft||c1" })],
    ["the customized polar re-pinned the boat", cache({ archetype: "cata_38ft" })],
  ])("recomputes when %s, keeping the route seeded", (_label, stale) => {
    const polar: PolarConfig = { ...defaultPolarConfig(), base: "cruiser_30ft", spi: "asymmetric" };
    const s = resolveInitialSession({
      url: parsePlanUrl(""),
      draft: null,
      cache: stale,
      polarConfig: polar,
      configFingerprint: FINGERPRINT,
      now: NOW,
    });
    expect(s.waypoints).toHaveLength(2);
    expect(s.passage).toBeNull();
    expect(s.mount).toEqual({ rewriteUrl: true, fetch: true });
  });

  it("does not require the departure to match, unlike path A", () => {
    const s = resolve({
      cache: cache({ single: { ...cache().single!, departure: PAST } }),
    });
    expect(s.departure).toBe(tomorrowRoundedLocal(NOW));
    expect(s.passage?.distance_nm).toBe(55);
  });
});

describe("resolveInitialSession: malformed URL", () => {
  it("reports the parse error and still seeds from the cache", () => {
    const s = resolve({ url: parsePlanUrl("?wpts=nope;nope"), cache: cache() });
    expect(s.urlError).toMatch(/Waypoints invalides/);
    expect(s.sources.route).toBe("cache");
  });

  it("carries the map centre hint through", () => {
    expect(resolve({ url: parsePlanUrl("?center=43.29,5.37") }).center).toEqual([43.29, 5.37]);
  });
});

describe("date helpers", () => {
  it("puts tomorrow's default on the hour, same hour as now", () => {
    const d = new Date("2026-09-02T10:37:42");
    expect(tomorrowRoundedLocal(d.getTime())).toBe("2026-09-03T10:00");
  });

  it("ends a default sweep two days after its start", () => {
    expect(defaultSweepLatest("2026-09-03T10:00")).toBe("2026-09-05T10:00");
  });

  it("formats a Date as the naive local string the slider and the URL share", () => {
    expect(toNaiveLocal(new Date("2026-01-05T07:04:00"))).toBe("2026-01-05T07:04");
  });
});
