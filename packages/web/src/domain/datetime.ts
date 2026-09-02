// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Every date and time rule the app owns, in one module.
 *
 * Three unrelated jobs used to live in as many places, each with its own copy:
 *
 * - the naive "YYYY-MM-DDTHH:MM" string the departure picker, the URL and the
 *   `datetime-local` input all speak (was `plan/session/initial.ts`);
 * - the Europe/Paris wall clock Open-Meteo answers with, projected onto UTC
 *   milliseconds so MARC and Open-Meteo series can share one axis (was
 *   `api/marine.ts` and, with a second implementation, in what used to be
 *   `utils/format.ts`);
 * - the French display formatters, "jeu. 3 sept." and "08:00", which had
 *   drifted into seven near-identical local helpers.
 *
 * They are grouped here because they share the same trap: JavaScript has no
 * timezone type, so each of them has to be explicit about which of the three
 * clocks (boat/Paris, UTC, browser-local) it reads and writes.
 */

import type { TimezoneMode } from "../hooks/useTimezone";

// ── Naive local strings ──────────────────────────────────────────────────────

const TZ_AWARE = /Z$|[+-]\d{2}:\d{2}$/;

/** "YYYY-MM-DDTHH:MM" in local time, the format the slider and the URL share. */
export function toNaiveLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

// ── Europe/Paris wall clock ──────────────────────────────────────────────────

// Open-Meteo is fetched with timezone=Europe/Paris, so its timestamps read
// "2026-05-08T00:00": Paris wall clock, no offset suffix. MARC returns proper
// ISO strings with an explicit offset. Aligning the two means resolving the
// Paris offset in force at each naive timestamp, DST included, without a
// timezone library.
//
// Hoisted out of the function body: constructing an Intl.DateTimeFormat costs
// ~70 us, and assembling a 200 NM forecast cache resolves ~76k timestamps (41
// corridor points x 5 series x 168 hours x 2 passes). Building it once and
// memoising per input string takes that from ~5 s of main thread to a few ms.
const PARIS_PARTS_DTF = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});

// A single passage touches at most a few hundred distinct timestamps, so the
// map stays tiny in practice. The cap only guards a long-lived tab that keeps
// planning: past it we drop everything rather than evict one by one, since a
// full reset costs one cold pass and the entries are cheap to recompute.
const PARIS_MEMO_MAX = 4096;
const parisOffsetMemo = new Map<string, number>();

/** A naive "YYYY-MM-DDTHH:MM[:SS]" read as if the wall clock were UTC. */
function naiveAsUtcMs(naive: string): number {
  const withSeconds = naive.length === 16 ? `${naive}:00` : naive;
  return new Date(`${withSeconds}Z`).getTime();
}

/** Paris offset, in minutes east of UTC, at an absolute instant. */
function parisOffsetMinForInstant(utcMs: number): number {
  const parts: Record<string, string> = {};
  for (const p of PARIS_PARTS_DTF.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  // Some engines emit "24" at the midnight rollover; coerce to 00.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const parisAsIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (parisAsIfUtc - utcMs) / 60000;
}

/**
 * Paris offset, in minutes east of UTC, in force *at the Paris wall clock*
 * `parisNaive` denotes.
 *
 * Two passes, and the second one is the whole point. Reading the string as UTC
 * and asking for the offset there answers for an instant one or two hours off
 * the one meant, which lands on the wrong side of a DST switch for the hour
 * that precedes it: "2026-03-29T01:00" (still CET, +01:00) used to resolve as
 * CEST and come back an hour early, and "2026-10-25T01:00" (still CEST) as
 * CET and come back an hour late. The first pass gives a candidate instant,
 * the second reads the offset actually in force there.
 *
 * Two hours a year, and only for a boat sailing through the change, but the
 * error silently shifted a whole marine series against the wind series.
 */
export function parisOffsetMinAt(parisNaive: string): number {
  const hit = parisOffsetMemo.get(parisNaive);
  if (hit !== undefined) return hit;

  const asUtcMs = naiveAsUtcMs(parisNaive);
  const candidate = asUtcMs - parisOffsetMinForInstant(asUtcMs) * 60000;
  const offset = parisOffsetMinForInstant(candidate);

  if (parisOffsetMemo.size >= PARIS_MEMO_MAX) parisOffsetMemo.clear();
  parisOffsetMemo.set(parisNaive, offset);
  return offset;
}

/** A Paris wall-clock timestamp projected onto UTC milliseconds since epoch. */
export function parisIsoToUtcMs(parisNaive: string): number {
  return naiveAsUtcMs(parisNaive) - parisOffsetMinAt(parisNaive) * 60000;
}

// Hoisted for the same reason as PARIS_PARTS_DTF: `nowParisHourPrefix` is
// called once per table render, and the constructor dominated its cost.
const PARIS_HOUR_PREFIX_DTF = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
});

/** "YYYY-MM-DDTHH" for the current moment in Europe/Paris time. The heatmap
    timeline is keyed in Paris time, so "now" must be expressed there too. */
export function nowParisHourPrefix(): string {
  const parts = PARIS_HOUR_PREFIX_DTF.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const h = get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${h === "24" ? "00" : h}`;
}

// ── Timeline hour, in the clock the reader picked ────────────────────────────

// The API is fetched with timezone=Europe/Paris, so timestamps like
// "2026-04-26T14:00" represent 14:00 Paris time (no suffix).
// Boat mode: read hours directly from the string (= Paris time as-is).
// UTC mode: append the Paris UTC offset so Date can convert to UTC.
// Local mode: interpret as-is via Date (current browser local time).


/**
 * Format the hour for a timeline cell.
 * The iso string is in Paris time (no timezone suffix).
 */
export function formatHour(iso: string, mode: TimezoneMode = "local"): string {
  if (mode === "boat") {
    // Read directly from the string — it's already Paris time
    return String(parseInt(iso.slice(11, 13), 10));
  }
  if (mode === "utc") {
    // The string represents Paris time. To get UTC, subtract the Paris offset.
    const offsetMin = parisOffsetMinAt(iso);
    const parisHour = parseInt(iso.slice(11, 13), 10);
    const parisMin = parseInt(iso.slice(14, 16), 10);
    const totalUTCMin = (parisHour * 60 + parisMin - offsetMin + 1440) % 1440;
    return String(Math.floor(totalUTCMin / 60));
  }
  // local: iso is Paris time without offset — convert Paris→UTC→browser-local
  const offsetMin = parisOffsetMinAt(iso);
  const realUtcMs = new Date(iso + "Z").getTime() - offsetMin * 60000;
  return String(new Date(realUtcMs).getHours());
}

// ── French display formatters ────────────────────────────────────────────────

// One formatter per shape, built once. `toLocaleTimeString` rebuilds one on
// every call, and the leg list, the windows table and both sliders format
// hundreds of timestamps per render between them.
const CLOCK_FR = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const DAY_SHORT_FR = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const DAY_LONG_FR = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function asDate(when: Date | string): Date {
  return typeof when === "string" ? new Date(when) : when;
}

/** Wall clock in the browser timezone, e.g. "08:00". */
export function fmtClock(when: Date | string): string {
  return CLOCK_FR.format(asDate(when));
}

/** Short French weekday and date, e.g. "jeu. 3 sept.". Feeds the recap strips. */
export function fmtDay(when: Date | string): string {
  return DAY_SHORT_FR.format(asDate(when));
}

/** Long French weekday and date, e.g. "jeudi 3 septembre", for the slider. */
export function fmtDayLong(when: Date | string): string {
  return DAY_LONG_FR.format(asDate(when));
}

/** First letter upper-cased. French locales lower-case the weekday, and the
    recap strip starts a sentence with it. */
export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
