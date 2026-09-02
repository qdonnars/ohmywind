// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The route being drawn, before it is computed.
 *
 * `ow_last_simulation_v1` and the `/plan` URL both only ever record a
 * *successful* computation. Everything between two computations — waypoints
 * just dropped on the map, a departure dragged on the slider, a sweep range
 * being filled in — lived in React state alone, so any reload wiped it. A
 * service worker taking over used to reload the page on its own, which is how
 * a reader could lose a half-drawn passage without touching anything.
 *
 * This module is that missing tier: the tab's uncommitted state, in
 * `sessionStorage` (per tab, gone when the tab closes, never shared with the
 * next visit — a draft is not a plan). It wins over the URL and over the
 * cached simulation at mount, because by construction it is more recent
 * than both.
 */

import { SESSION_STORAGE_KEYS } from "../storage/keys";

/** Versioned: a shape change must not resurrect a draft written by an older
    build, and the SW update this feature protects is exactly the moment two
    builds meet. */
const STORAGE_KEY = SESSION_STORAGE_KEYS.planDraft;

/** Beyond this, "what I was drawing a moment ago" stops being true. Belt and
    braces on top of sessionStorage's own tab lifetime: a tab restored by the
    browser days later keeps its session storage. */
const MAX_AGE_MS = 24 * 3600 * 1000;

export interface PlanDraft {
  /** Route under construction. May hold a single point, or none at all when
      only the departure was touched. */
  waypoints: [number, number][];
  /** Naive local "YYYY-MM-DDTHH:MM". In ETA mode this is the target arrival,
      as on the slider itself. */
  departure: string;
  /** Whether `departure` reads as a departure or as a target arrival. */
  timeAnchor: "departure" | "arrival";
  archetype: string;
  mode: "single" | "compare";
  sweepEarliest: string;
  sweepLatest: string;
  sweepIntervalHours: number;
  savedAt: number;
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

/**
 * Shape check on the way in, so a corrupted or foreign payload can never
 * reach the page as waypoints. Exported for the tests.
 */
export function parsePlanDraft(raw: string, now: number): PlanDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const d = parsed as Record<string, unknown>;
  if (!Array.isArray(d.waypoints) || !d.waypoints.every(isCoordPair)) return null;
  if (typeof d.departure !== "string" || d.departure === "") return null;
  if (typeof d.archetype !== "string" || d.archetype === "") return null;
  if (d.mode !== "single" && d.mode !== "compare") return null;
  if (d.timeAnchor !== "departure" && d.timeAnchor !== "arrival") return null;
  if (typeof d.sweepEarliest !== "string" || typeof d.sweepLatest !== "string") return null;
  if (typeof d.sweepIntervalHours !== "number" || !Number.isFinite(d.sweepIntervalHours)) {
    return null;
  }
  if (typeof d.savedAt !== "number" || !Number.isFinite(d.savedAt)) return null;
  if (now - d.savedAt > MAX_AGE_MS) return null;
  return {
    waypoints: d.waypoints as [number, number][],
    departure: d.departure,
    timeAnchor: d.timeAnchor,
    archetype: d.archetype,
    mode: d.mode,
    sweepEarliest: d.sweepEarliest,
    sweepLatest: d.sweepLatest,
    sweepIntervalHours: d.sweepIntervalHours,
    savedAt: d.savedAt,
  };
}

export function savePlanDraft(draft: Omit<PlanDraft, "savedAt">): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...draft, savedAt: Date.now() } satisfies PlanDraft),
    );
  } catch {
    // Storage disabled or full. The draft is a safety net, not a feature:
    // failing to write one must never break the page.
  }
}

export function loadPlanDraft(): PlanDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? parsePlanDraft(raw, Date.now()) : null;
  } catch {
    return null;
  }
}

/** Cheap probe for the service worker: is anything uncommitted in this tab? */
export function hasPlanDraft(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearPlanDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}
