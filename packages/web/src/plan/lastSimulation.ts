// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type {
  PassageReport,
  ComplexityScore,
  PassageWindow,
} from "./types";

// Persists the last successful simulation (single-mode passage and/or
// compare-mode windows) so the user sees their plan immediately on reload —
// no re-fetch, no empty form. Cache is invalidated implicitly when the URL
// route changes (we restore only when waypoints + archetype match the URL).

const STORAGE_KEY = "ow_last_simulation_v1";

export interface LastSimulation {
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

export function saveLastSimulation(sim: LastSimulation): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sim));
  } catch {
    // localStorage unavailable / full — silently skip; next load just won't
    // restore. Better than crashing the success path.
  }
}

export function loadLastSimulation(): LastSimulation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastSimulation;
    // Caches written before `mode` existed default to single — that's the
    // mode the user was last looking at if their cache only has `single`,
    // and a safe fallback if it has `compare` (the table reappears as soon
    // as they toggle, no data lost).
    if (parsed.mode !== "single" && parsed.mode !== "compare") {
      parsed.mode = parsed.compare && !parsed.single ? "compare" : "single";
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastSimulation(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}

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
