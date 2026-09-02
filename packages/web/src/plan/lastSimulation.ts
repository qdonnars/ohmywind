// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import type {
  PassageReport,
  ComplexityScore,
  PassageWindow,
} from "./types";

// Persists the last successful simulation (single-mode passage and/or
// compare-mode windows) so the user sees their plan immediately on reload —
// no re-fetch, no empty form. Cache is invalidated implicitly when the URL
// route changes (we restore only when waypoints + archetype match the URL).

/** Exported so the one other reader of this cache (the onboarding hint, which
    only probes for existence) cannot drift from the writer. It used to repeat
    the literal. */
export const LAST_SIMULATION_KEY = LOCAL_STORAGE_KEYS.lastSimulation;

/** Payload version. Absent in everything written before this module started
    validating, which is why `undefined` is accepted as "legacy v1" rather
    than rejected: those caches are perfectly usable and dropping them would
    empty the planner of returning users for no reason. A version we do not
    know (a newer build, then a rollback) is rejected: better an empty planner
    than a half-read shape. */
export const LAST_SIMULATION_VERSION = 1;

/** Above this many windows the compare payload stops being worth its weight in
    the localStorage budget: 48 windows is 6 days at the 3 h default step, well
    past what a comparison table is actually read on. */
const MAX_WINDOWS = 48;

/** Serialized size beyond which the compare payload is cut down. localStorage
    quotas start around 5 MB per origin and are shared with every other key of
    the app, so a single simulation has no business claiming more than this. */
const MAX_BYTES = 500_000;

export interface LastSimulation {
  /** See LAST_SIMULATION_VERSION. Written by `saveLastSimulation`, optional on
      the way in for the caches that predate it. */
  v?: number;
  waypoints: [number, number][];
  archetype: string;
  // Fingerprint of the /config preferences in effect when the simulation ran
  // (model order + polar customization). Compared on rehydration so a user
  // tweaking /config and returning to /plan never sees stale results
  // computed against the previous preferences.
  configFingerprint?: string;
  // Last active mode at save time. Drives which tab the user lands on when
  // we rehydrate after a navigation away from /plan (e.g. round-trip via /).
  mode: "single" | "compare";
  // Single-mode (may be null if the user only ran a sweep)
  single?: {
    departure: string; // naive local "YYYY-MM-DDTHH:MM"
    passage: PassageReport;
    complexity: ComplexityScore;
    forecastUpdatedAt: string;
  };
  // Compare-mode (may be null if the user only ran single)
  compare?: {
    sweepEarliest: string;
    sweepLatest: string;
    sweepIntervalHours: number;
    sweepTargetEta?: string;
    windows: PassageWindow[];
    metaWarnings: string[];
    forecastUpdatedAt: string;
  };
  cachedAt: number;
}

// ── shape validation ─────────────────────────────────────────────────────────
//
// The cache is JSON the app wrote itself, but it outlives the build that wrote
// it. A payload from a deploy whose types have since moved, or scrambled by an
// extension, used to reach the page cast as a `PassageReport` and blow up the
// sidebar on the first `passage.segments.map`. Everything below is a *light*
// structural check: required fields with the right primitive kind, nothing
// about values. An invalid sub-block is dropped on its own rather than taking
// the whole cache with it, so a corrupted sweep never costs the user the
// single-mode result they were looking at.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isCoordPair(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Math.abs(v[0]) <= 90 &&
    Math.abs(v[1]) <= 180
  );
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

function isPassageReport(v: unknown): v is PassageReport {
  if (!isRecord(v)) return false;
  return (
    typeof v.departure_time === "string" &&
    typeof v.arrival_time === "string" &&
    typeof v.duration_h === "number" &&
    typeof v.distance_nm === "number" &&
    Array.isArray(v.segments) &&
    v.segments.every(isRecord) &&
    isStringArray(v.warnings)
  );
}

function isComplexityScore(v: unknown): v is ComplexityScore {
  if (!isRecord(v)) return false;
  return typeof v.level === "number" && typeof v.label === "string";
}

function isPassageWindow(v: unknown): v is PassageWindow {
  if (!isRecord(v)) return false;
  return (
    typeof v.departure === "string" &&
    typeof v.arrival === "string" &&
    typeof v.duration_h === "number" &&
    isRecord(v.complexity) &&
    typeof v.complexity.level === "number"
  );
}

function parseSingle(v: unknown): LastSimulation["single"] {
  if (!isRecord(v)) return undefined;
  if (typeof v.departure !== "string" || v.departure === "") return undefined;
  if (!isPassageReport(v.passage)) return undefined;
  if (!isComplexityScore(v.complexity)) return undefined;
  if (typeof v.forecastUpdatedAt !== "string") return undefined;
  return {
    departure: v.departure,
    passage: v.passage,
    complexity: v.complexity,
    forecastUpdatedAt: v.forecastUpdatedAt,
  };
}

function parseCompare(v: unknown): LastSimulation["compare"] {
  if (!isRecord(v)) return undefined;
  if (typeof v.sweepEarliest !== "string" || typeof v.sweepLatest !== "string") {
    return undefined;
  }
  if (typeof v.sweepIntervalHours !== "number" || !Number.isFinite(v.sweepIntervalHours)) {
    return undefined;
  }
  if (!Array.isArray(v.windows) || !v.windows.every(isPassageWindow)) return undefined;
  if (typeof v.forecastUpdatedAt !== "string") return undefined;
  return {
    sweepEarliest: v.sweepEarliest,
    sweepLatest: v.sweepLatest,
    sweepIntervalHours: v.sweepIntervalHours,
    sweepTargetEta: typeof v.sweepTargetEta === "string" ? v.sweepTargetEta : undefined,
    windows: v.windows,
    // Warnings are decoration: a bad list is emptied, not a reason to lose the
    // table it annotates.
    metaWarnings: isStringArray(v.metaWarnings) ? v.metaWarnings : [],
    forecastUpdatedAt: v.forecastUpdatedAt,
  };
}

/**
 * Parse a raw localStorage payload into a usable cache, or null.
 *
 * Exported for the tests: they are the only place where a corrupted, oversized
 * or legacy payload can be produced on purpose.
 */
export function parseLastSimulation(raw: string): LastSimulation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.v !== undefined && parsed.v !== LAST_SIMULATION_VERSION) return null;
  if (!Array.isArray(parsed.waypoints) || !parsed.waypoints.every(isCoordPair)) return null;
  if (typeof parsed.archetype !== "string" || parsed.archetype === "") return null;
  if (typeof parsed.cachedAt !== "number" || !Number.isFinite(parsed.cachedAt)) return null;

  const single = parseSingle(parsed.single);
  const compare = parseCompare(parsed.compare);

  // Caches written before `mode` existed default to single: that's the mode
  // the user was last looking at if their cache only has `single`, and a safe
  // fallback if it has `compare` (the table reappears as soon as they toggle,
  // no data lost).
  const mode =
    parsed.mode === "single" || parsed.mode === "compare"
      ? parsed.mode
      : compare && !single
        ? "compare"
        : "single";

  return {
    v: LAST_SIMULATION_VERSION,
    waypoints: parsed.waypoints,
    archetype: parsed.archetype,
    configFingerprint:
      typeof parsed.configFingerprint === "string" ? parsed.configFingerprint : undefined,
    mode,
    single,
    compare,
    cachedAt: parsed.cachedAt,
  };
}

/**
 * Trim a simulation until it fits the budget, in three steps that each cost
 * strictly more than the one before:
 *
 * 1. keep at most MAX_WINDOWS windows;
 * 2. still over MAX_BYTES: strip the per-window `passage` / `complexity_full`.
 *    Drill-down then re-fetches, which is exactly the fallback
 *    `handleWindowSelect` already ships for older server deployments;
 * 3. still over MAX_BYTES: drop the compare block entirely, keeping `single`.
 *
 * Until now an oversized payload simply threw QuotaExceededError, and the
 * whole cache, single-mode result included, was silently not written.
 */
function fitToBudget(sim: LastSimulation): string {
  let out = sim;
  if (out.compare && out.compare.windows.length > MAX_WINDOWS) {
    out = {
      ...out,
      compare: { ...out.compare, windows: out.compare.windows.slice(0, MAX_WINDOWS) },
    };
  }
  let json = JSON.stringify(out);
  if (json.length <= MAX_BYTES || !out.compare) return json;

  out = {
    ...out,
    compare: {
      ...out.compare,
      windows: out.compare.windows.map((w) => {
        const light: PassageWindow = { ...w };
        delete light.passage;
        delete light.complexity_full;
        return light;
      }),
    },
  };
  json = JSON.stringify(out);
  if (json.length <= MAX_BYTES) return json;

  return JSON.stringify({ ...out, compare: undefined });
}

export function saveLastSimulation(sim: LastSimulation): void {
  try {
    localStorage.setItem(
      LAST_SIMULATION_KEY,
      fitToBudget({ ...sim, v: LAST_SIMULATION_VERSION }),
    );
  } catch {
    // localStorage unavailable / full — silently skip; next load just won't
    // restore. Better than crashing the success path.
  }
}

export function loadLastSimulation(): LastSimulation | null {
  try {
    const raw = localStorage.getItem(LAST_SIMULATION_KEY);
    return raw ? parseLastSimulation(raw) : null;
  } catch {
    return null;
  }
}

export function clearLastSimulation(): void {
  try {
    localStorage.removeItem(LAST_SIMULATION_KEY);
  } catch {
    // best-effort
  }
}

/** Budget constants, exported so the tests describe the contract instead of
    re-encoding the magic numbers next to it. */
export const LAST_SIMULATION_LIMITS = { MAX_WINDOWS, MAX_BYTES } as const;

// Tolerance ~10 m at typical latitudes — accounts for floating-point round-trip
// through the URL. Tighter than human eyeball precision, looser than IEEE bits.
const COORD_EPS = 1e-4;

export function waypointsEqual(
  a: [number, number][],
  b: [number, number][],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    ([lat, lon], i) =>
      Math.abs(lat - b[i][0]) < COORD_EPS && Math.abs(lon - b[i][1]) < COORD_EPS,
  );
}
