// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The departure axis of « Comparer ce trajet », as pure functions.
 *
 * A trip is one track times one departure. On this axis the track is frozen
 * and the departure varies: the sweep the server already runs, read as a
 * list of slots. Everything the screen derives from the sweep parameters or
 * from the windows lives here, so the components only lay it out:
 *
 * - the window presets (« les prochaines 24 h / 48 h / 3 j / 7 j / 12 j »)
 *   and the step deduced from the span, so the reader never has to pick a
 *   step to get a result;
 * - the grouping by day, the sorts, the motor share and the alert count of a
 *   slot.
 */

import type { PassageReport, PassageWindow } from "../types";
import { toNaiveLocal } from "../../domain/datetime";
import { SWEEP_HORIZON_DAYS } from "../validateSweep";
import { t } from "../../i18n";

export type CompareAxis = "slots" | "tracks";

/** Spans offered as chips, in hours from the plan's departure: 24 h, 48 h,
    3 days, 7 days, 12 days. Twelve days is the end of the forecast. */
export const WINDOW_PRESETS_H = [24, 48, 72, 168, 288] as const;

/** The window a comparison opens on: the two days after the plan's departure,
    « je veux partir dans les deux jours ». */
export const DEFAULT_WINDOW_H = 48;

/** Steps the reader may pick once « Changer » is open. */
export const STEP_CHOICES_H = [1, 3, 6, 12] as const;

const HOUR_MS = 3_600_000;

/**
 * The step deduced from the span: fine enough to read a day, coarse enough
 * that a week does not cost a minute of computation. 24 h to 3 days at 3 h
 * (9 to 25 slots), a week at 6 h (29), twelve days at 12 h (25).
 */
export function autoStepHours(spanH: number): 3 | 6 | 12 {
  if (spanH <= 72) return 3;
  if (spanH <= 168) return 6;
  return 12;
}

/** How many departures a sweep of `spanH` hours tests at `stepH`. Mirrors
    the server, which includes both bounds. */
export function windowCount(spanH: number, stepH: number): number {
  if (stepH <= 0 || spanH < 0) return 0;
  return Math.floor(spanH / stepH) + 1;
}

/** "48 h", "3 j": a span in the unit that reads best. Up to two days one
    still counts in hours (« les prochaines 48 h »), from three in days. */
export function spanLabel(hours: number): string {
  if (hours >= 72 && hours % 24 === 0) return t("panel.window.spanDays", { count: hours / 24 });
  return t("panel.window.spanHours", { count: hours });
}

/** Hours between two naive local bounds, rounded. 0 when either is unreadable. */
export function spanHours(earliest: string, latest: string): number {
  const e = new Date(earliest).getTime();
  const l = new Date(latest).getTime();
  if (Number.isNaN(e) || Number.isNaN(l)) return 0;
  return Math.max(0, Math.round((l - e) / HOUR_MS));
}

/** The latest bound `presetH` hours after `earliest`, held inside the
    forecast horizon counted from `now`. */
export function presetLatest(earliest: string, presetH: number, now: number): string {
  const e = new Date(earliest).getTime();
  const horizon = now + SWEEP_HORIZON_DAYS * 24 * HOUR_MS;
  return toNaiveLocal(new Date(Math.min(e + presetH * HOUR_MS, horizon)));
}

/** The preset a window matches, or null when the bounds were set by hand. */
export function matchPreset(earliest: string, latest: string): number | null {
  const span = spanHours(earliest, latest);
  return WINDOW_PRESETS_H.find((p) => p === span) ?? null;
}

export interface SweepParams {
  earliest: string;
  latest: string;
  intervalHours: number;
}

/** The sweep a comparison opens on: from the plan's departure, the default
    span, the deduced step. */
export function defaultSweep(departure: string, now: number): SweepParams {
  const latest = presetLatest(departure, DEFAULT_WINDOW_H, now);
  return {
    earliest: departure,
    latest,
    intervalHours: autoStepHours(spanHours(departure, latest)),
  };
}

// ── reading the windows ──────────────────────────────────────────────────────

export type SlotSort = "departure" | "duration" | "sea";

export function sortWindows(windows: PassageWindow[], sort: SlotSort): PassageWindow[] {
  const list = [...windows];
  const at = (w: PassageWindow) => new Date(w.departure).getTime();
  list.sort((a, b) => {
    if (sort === "duration") return (a.duration_h ?? 0) - (b.duration_h ?? 0) || at(a) - at(b);
    if (sort === "sea") {
      // Unknown sea sorts last: nothing to compare it on.
      const ha = a.conditions_summary?.hs_max_m ?? Infinity;
      const hb = b.conditions_summary?.hs_max_m ?? Infinity;
      return ha - hb || at(a) - at(b);
    }
    return at(a) - at(b);
  });
  return list;
}

export interface DayGroup {
  /** Local calendar day, "YYYY-MM-DD", the key of the group. */
  key: string;
  /** Any departure of the day, for the formatter. */
  sample: string;
  windows: PassageWindow[];
}

/** The windows in their given order, cut into runs of the same local day.
    A sort other than by departure can bring a day back later: it is then a
    second group, headed again, rather than a reorder of the first. */
export function groupByDay(windows: PassageWindow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const w of windows) {
    const key = toNaiveLocal(new Date(w.departure)).slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.windows.push(w);
    else groups.push({ key, sample: w.departure, windows: [w] });
  }
  return groups;
}

/** Share of the distance covered with the engine on, 0 to 100, or null when
    the window carries no passage (older deployments answer without it). */
export function motorShare(passage: PassageReport | undefined): number | null {
  if (!passage || passage.segments.length === 0) return null;
  let total = 0;
  let motor = 0;
  for (const seg of passage.segments) {
    total += seg.distance_nm;
    if (seg.motor_used) motor += seg.distance_nm;
  }
  if (total <= 0) return null;
  return Math.round((motor / total) * 100);
}

/** The server already folds the complexity warnings into `warnings`. */
export function alertCount(w: PassageWindow): number {
  return w.warnings?.length ?? 0;
}

/** Whether a slot is the plan's own departure, the one already on screen. */
export function isPlanDeparture(w: PassageWindow, departure: string): boolean {
  const at = new Date(w.departure);
  if (Number.isNaN(at.getTime())) return false;
  return toNaiveLocal(at) === departure;
}
