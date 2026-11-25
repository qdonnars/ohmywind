// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { getLocale } from "../i18n/store";
import { clockMinutes } from "./displayRounding";

// Shared number/duration formatters for the /plan panel. Consolidates helpers
// that had drifted into separate copies across PlanStates.tsx and
// WindowsTable.tsx so the "12h30" convention and the decimal separator of the
// active language stay in one tested place.
//
// Dates and clocks are not here: they live in `domain/datetime.ts`, alongside
// the timezone rules they depend on.

/**
 * Whole minutes to the compact "12h30" convention.
 * - whole hours drop the minutes: 180 → "3h"
 * - sub-hour durations show only minutes: 30 → "30m"
 * - otherwise minutes are zero-padded: 750 → "12h30"
 *
 * Durations are counted in whole minutes before they are written: from
 * decimal hours, rounding the minutes alone turned 1h59m45s into « 1h60 ».
 */
export function fmtMinutes(totalMin: number): string {
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${String(mins).padStart(2, "0")}`;
}

/**
 * The duration between two clocks printed beside it, read on those clocks
 * (see `clockMinutes`): a departure at « 10:00 » and an arrival at « 15:31 »
 * read « 5h31 », whatever the seconds. The server's `duration_h` is not
 * used: rounded on its own it could say a minute more than the clocks, and in
 * the sweep it comes rounded to the hundredth of an hour. "—" when either end
 * is missing (an older deployment) or does not parse, rather than « NaNh ».
 */
export function fmtSpanSafe(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "—";
  const min = clockMinutes(start, end);
  return Number.isFinite(min) ? fmtMinutes(min) : "—";
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

const NUM_BY_LOCALE = new Map<string, Intl.NumberFormat>();

/** `n` with exactly `digits` decimals in the active language: 0.3 → "0,3"
    in French, "0.3" in English. No grouping: nothing formatted here reaches
    four digits. One formatter per locale and precision, built on first use. */
export function numFixed(n: number, digits: number): string {
  const locale = getLocale();
  const id = `${locale}:${digits}`;
  let f = NUM_BY_LOCALE.get(id);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    });
    NUM_BY_LOCALE.set(id, f);
  }
  return f.format(n);
}

/** One decimal in the active language: 38.2 → "38,2" in French, "38.2" in English. */
export function num1(n: number): string {
  return numFixed(n, 1);
}

/** "12–14", "1,1–1,4": a range in the active language, collapsed to one
    value when its two ends read the same at that precision. */
export function numRange(min: number, max: number, digits: number): string {
  const a = numFixed(min, digits);
  const b = numFixed(max, digits);
  return a === b ? a : `${a}–${b}`;
}
