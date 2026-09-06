// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The comparison page's data, kept pure: what a row is, which hours the
 * table has columns for, which hour it opens on. No React, no network, so
 * the rules can be tested in Node.
 */

import { MODEL_META, type ModelName } from "../config/modelConfig";
import type { MarineHourly, ModelForecast, Spot } from "../types";

export interface CompareRow {
  spot: Spot;
  /** The model read for this spot: the first of the reader's models that
      covers it, in their own order (AROME first by default), or null when
      none does. */
  forecast: ModelForecast | null;
  marine: MarineHourly | null;
}

/** What the table reads: the sea is offered only where a spot has waves. */
export type CompareMetric = "wind" | "waves";

export function rowKey(spot: Spot): string {
  return `${spot.latitude},${spot.longitude}`;
}

export function sameSpot(a: Spot | null, b: Spot | null): boolean {
  return a != null && b != null && a.latitude === b.latitude && a.longitude === b.longitude;
}

function modelStep(name: string): number {
  return MODEL_META[name as ModelName]?.nativeStepHours ?? 3;
}

/**
 * The hours the table has columns for: the longest series among the rows,
 * thinned to the finest native step among the models actually read. Same
 * rule as the wind table, where the rows are models rather than spots.
 */
export function compareTimeline(rows: CompareRow[]): string[] {
  let longest: string[] = [];
  let finest = 6;
  for (const row of rows) {
    if (!row.forecast) continue;
    const step = modelStep(row.forecast.modelName);
    if (step < finest) finest = step;
    if (row.forecast.hourly.time.length > longest.length) {
      longest = row.forecast.hourly.time;
    }
  }
  return longest.filter((t) => parseInt(t.slice(11, 13)) % finest === 0);
}

/**
 * The hour the table shows: the reader's pick while it is still on the
 * timeline and not in the past, else the current hour, else the first hour
 * to come. `nowHour` is a "YYYY-MM-DDTHH" prefix.
 */
export function resolveHour(
  selected: string | null,
  timeline: string[],
  nowHour: string,
): string | null {
  if (selected && selected.slice(0, 13) >= nowHour && timeline.includes(selected)) {
    return selected;
  }
  return (
    timeline.find((t) => t.startsWith(nowHour)) ??
    timeline.find((t) => t > nowHour) ??
    null
  );
}
