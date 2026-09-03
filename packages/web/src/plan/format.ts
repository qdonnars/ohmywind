// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { getLocale } from "../i18n/store";

// Shared number/duration formatters for the /plan panel. Consolidates helpers
// that had drifted into separate copies across PlanStates.tsx and
// WindowsTable.tsx so the "12h30" convention and the decimal separator of the
// active language stay in one tested place.
//
// Dates and clocks are not here: they live in `domain/datetime.ts`, alongside
// the timezone rules they depend on.

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
 * Sounding under a waypoint, in metres below chart datum. One decimal below
 * 10 m, rounded above, because the metre that matters under the keel is the
 * shallow one. e.g. 4.62 → "4,6 m" in French, "4.6 m" in English, 23.4 → "23 m".
 */
export function fmtDepthM(m: number): string {
  if (m < 10) return `${num1(m)} m`;
  return `${Math.round(m)} m`;
}

const NUM1_BY_LOCALE = new Map<string, Intl.NumberFormat>();

/** One decimal in the active language: 38.2 → "38,2" in French, "38.2" in
    English. No grouping: nothing formatted here reaches four digits. */
export function num1(n: number): string {
  const locale = getLocale();
  let f = NUM1_BY_LOCALE.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    });
    NUM1_BY_LOCALE.set(locale, f);
  }
  return f.format(n);
}
