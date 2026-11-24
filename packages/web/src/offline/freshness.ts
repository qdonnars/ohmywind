// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { MarineHourly, ModelForecast } from "../types";
import { fmtClock, fmtDay } from "../domain/datetime";
import { t } from "../i18n";

/**
 * How old forecasts read from the device are, and what is left of them.
 *
 * A forecast kept for the offline case is shown with its date, never as if it
 * had just arrived. Past a couple of days it is not a plan any more: the
 * screens add a warning, at the one threshold below. The copy reads it through
 * the `{hours}` placeholder, so the number lives here and nowhere else.
 */
export const FORECAST_STALE_WARNING_HOURS = 48;

const HOUR_MS = 3_600_000;

/** Whole hours since `fetchedAt`, never negative (a clock set back). */
export function forecastAgeHours(fetchedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - fetchedAt) / HOUR_MS));
}

/** Past the warning threshold: the screens say the forecast has aged. */
export function isForecastStale(fetchedAt: number, now: number): boolean {
  return now - fetchedAt > FORECAST_STALE_WARNING_HOURS * HOUR_MS;
}

/**
 * Index of the first hour still ahead of us (the current hour included) in a
 * Paris-naive "YYYY-MM-DDTHH:MM" timeline, compared against
 * `nowParisHourPrefix()` ("YYYY-MM-DDTHH"). Lexicographic order is time order
 * for that format. `times.length` when every hour has passed.
 */
function firstCurrentIndex(times: readonly string[], nowHour: string): number {
  const i = times.findIndex((t) => t.slice(0, 13) >= nowHour);
  return i === -1 ? times.length : i;
}

/** Every array of `record` aligned on its `time` axis, cut from `from`.
    Scalars (a coefficient, a source label) are kept as they are. */
function sliceAligned<T extends { time: string[] }>(record: T, from: number): T {
  const n = record.time.length;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = Array.isArray(v) && v.length === n ? v.slice(from) : v;
  }
  return out as T;
}

/**
 * The forecast without the hours already behind us.
 *
 * A forecast from the day before yesterday starts two days ago: the tables
 * would open on hours that are history, under the same look as the ones to
 * come. They are masked rather than greyed: what is past is of no use for a
 * decision at sea, and the timeline then starts at « Maint. », exactly where
 * a fresh one is scrolled to.
 *
 * Returns null when nothing is left (a forecast older than its horizon): the
 * caller then has nothing to show, rather than an empty table with a date.
 */
export function trimPastHours(
  models: readonly ModelForecast[],
  marine: MarineHourly | null,
  nowHour: string,
): { models: ModelForecast[]; marine: MarineHourly | null } | null {
  const trimmedModels = models
    .map((m) => ({ ...m, hourly: sliceAligned(m.hourly, firstCurrentIndex(m.hourly.time, nowHour)) }))
    .filter((m) => m.hourly.time.length > 0);
  if (trimmedModels.length === 0) return null;
  let trimmedMarine: MarineHourly | null = null;
  if (marine) {
    const cut = sliceAligned(marine, firstCurrentIndex(marine.time, nowHour));
    trimmedMarine = cut.time.length > 0 ? cut : null;
  }
  return { models: trimmedModels, marine: trimmedMarine };
}

/**
 * "mar. 17 nov. à 09:00" in the reader's language and clock: the date the
 * screens put on a forecast read from the device, and on a plan's forecast.
 */
export function formatForecastWhen(when: number | string | Date): string {
  const at = when instanceof Date ? when : new Date(when);
  return t("common.forecast.dateAtTime", { day: fmtDay(at), time: fmtClock(at) });
}
