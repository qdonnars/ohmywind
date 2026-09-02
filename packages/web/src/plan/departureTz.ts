// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Turning the departure picker's naive "YYYY-MM-DDTHH:MM" into a
// timezone-aware timestamp for the server.
//
// Split out of PlanPage so the rule can be tested without a DOM, and so the
// test can pin an offset instead of depending on the machine's timezone.

const TZ_AWARE = /Z$|[+-]\d{2}:\d{2}$/;

/** "+02:00" / "-05:30" for an offset expressed in minutes east of UTC. */
export function tzSuffixFor(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/**
 * Local UTC offset, in minutes east of UTC, at the instant `iso` denotes.
 *
 * `new Date("YYYY-MM-DDTHH:MM")` parses a date-time form with no offset as
 * local time, so the resulting Date carries the offset in force on that day,
 * not today's. That distinction is the whole point: the slider reaches 14 days
 * out, which straddles a daylight-saving change twice a year.
 *
 * An unparsable string falls back to the current offset, which is what the
 * previous implementation always used.
 */
export function localOffsetFor(iso: string): number {
  const at = new Date(iso);
  const minutes = at.getTimezoneOffset();
  if (Number.isNaN(minutes)) return -new Date().getTimezoneOffset();
  return -minutes;
}

/**
 * Append the local timezone offset to a naive "YYYY-MM-DDTHH:MM" string.
 * Already timezone-aware input (trailing Z or ±HH:MM) is returned untouched.
 *
 * The offset is the one in force on the target date, not today's. Using
 * today's shifted the departure sent to the server by one hour whenever the
 * planned date sat on the other side of a daylight-saving change, and the
 * server-resolved departure then rewrote the slider and the URL: the hour
 * changed under the user right after "Calculer".
 *
 * The hour skipped by the spring-forward jump does not exist locally; the
 * runtime resolves it to the following hour, so the suffix is the post-change
 * offset. There is no right answer for a time that never happens, and the
 * picker cannot produce one on a whole hour anyway.
 */
export function toTzAware(iso: string, offsetMinutes: number = localOffsetFor(iso)): string {
  if (TZ_AWARE.test(iso)) return iso;
  return `${iso}:00${tzSuffixFor(offsetMinutes)}`;
}
