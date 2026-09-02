// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Shared number/duration formatters for the /plan panel. Consolidates helpers
// that had drifted into separate copies across PlanStates.tsx and
// WindowsTable.tsx so the "12h30" convention and French decimals stay in one
// tested place.

/**
 * Duration in decimal hours to the compact "12h30" convention.
 * - whole hours drop the minutes: 3 → "3h"
 * - sub-hour durations show only minutes: 0.5 → "30m"
 * - otherwise minutes are zero-padded: 12.5 → "12h30"
 */
export function fmtDuration(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${String(mins).padStart(2, "0")}`;
}

/**
 * Defensive wrapper: a HF Space deployment lag may serve a response missing a
 * duration field. Prefer a graceful "—" over rendering "NaNh".
 */
export function fmtDurationSafe(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  return fmtDuration(h);
}

/**
 * Sounding under a waypoint, in metres below chart datum. Same shape as
 * ``fmtNm``: French comma, one decimal below 10 m, rounded above, because
 * the metre that matters under the keel is the shallow one. e.g.
 * 4.62 → "4,6 m", 23.4 → "23 m".
 */
export function fmtDepthM(m: number): string {
  if (m < 10) {
    return `${m.toFixed(1).replace(".", ",")} m`;
  }
  return `${Math.round(m)} m`;
}

/** One-decimal French number: 38.2 → "38,2". Matches sailing-French copy. */
export function fr1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

/** Short French weekday + date, e.g. "jeu. 3 sept.". Feeds the recap strips. */
export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Wall clock, e.g. "08:00". */
export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** First letter upper-cased. `toLocaleDateString` lower-cases the weekday, and
    the recap strip starts a sentence with it. */
export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
