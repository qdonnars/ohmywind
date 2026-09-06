// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The comparison page's data, kept pure: what a row is, which columns the
 * table has, how the hours of a column are folded into one cell. No React,
 * no network, so the rules can be tested in Node.
 *
 * The design brief this follows: no interpretation (no score, no ranking,
 * the reader judges); the model is not shown; the hour window is a setting;
 * the days follow each other in the horizontal scroll; the step is a
 * setting, and a cell whose step exceeds the hour shows a min–max range,
 * never a mean alone; the wind is the base, the sea an optional band.
 */

import type { MarineHourly, ModelForecast, Spot } from "../types";

export interface CompareRow {
  spot: Spot;
  /** The model read for this spot: the first of the reader's models that
      covers it, in their own order (AROME first by default), or null when
      none does. Never displayed: comparing two spots on two models means
      nothing, so the page reads one and does not say which. */
  forecast: ModelForecast | null;
  marine: MarineHourly | null;
}

/** Hours folded into one cell. */
export type Resolution = 1 | 3 | 6;
export const RESOLUTIONS: readonly Resolution[] = [1, 3, 6];

/** The hours read each day, `[start, end)` in the series' local time. */
export type HourWindow = readonly [number, number];
export const DEFAULT_WINDOW: HourWindow = [6, 22];
export const WINDOW_PRESETS: readonly HourWindow[] = [
  [6, 22],
  [0, 24],
  [8, 14],
  [12, 20],
];
/** A window narrower than this has nothing to compare. */
export const MIN_WINDOW_H = 2;

export function rowKey(spot: Spot): string {
  return `${spot.latitude},${spot.longitude}`;
}

export function sameSpot(a: Spot | null, b: Spot | null): boolean {
  return a != null && b != null && a.latitude === b.latitude && a.longitude === b.longitude;
}

export function isResolution(v: unknown): v is Resolution {
  return v === 1 || v === 3 || v === 6;
}

/** A window with integer bounds inside the day, at least MIN_WINDOW_H wide. */
export function clampWindow(win: readonly [number, number]): HourWindow {
  const start = Math.min(Math.max(Math.round(win[0]), 0), 24 - MIN_WINDOW_H);
  const end = Math.min(Math.max(Math.round(win[1]), start + MIN_WINDOW_H), 24);
  return [start, end];
}

/** Every date of the longest series among the rows, in order. */
export function compareDays(rows: CompareRow[]): string[] {
  let longest: string[] = [];
  for (const row of rows) {
    const times = row.forecast?.hourly.time;
    if (times && times.length > longest.length) longest = times;
  }
  const days: string[] = [];
  for (const t of longest) {
    const day = t.slice(0, 10);
    if (days[days.length - 1] !== day) days.push(day);
  }
  return days;
}

export interface CompareColumn {
  key: string;
  day: string;
  /** The hours this column folds, as series timestamps "YYYY-MM-DDTHH:00". */
  times: string[];
  /** Local hours, for the label: the first, and the one after the last. */
  from: number;
  to: number;
  /** First column of its day: the day separator sits before it. */
  first: boolean;
}

function pad(h: number): string {
  return String(h).padStart(2, "0");
}

/** The columns of the table: each day of `days`, the window cut by `res`. */
export function compareColumns(
  days: readonly string[],
  res: Resolution,
  win: HourWindow,
): CompareColumn[] {
  const out: CompareColumn[] = [];
  for (const day of days) {
    for (let h = win[0]; h < win[1]; h += res) {
      const hours: number[] = [];
      for (let k = 0; k < res && h + k < win[1]; k++) hours.push(h + k);
      out.push({
        key: `${day}T${pad(h)}`,
        day,
        times: hours.map((x) => `${day}T${pad(x)}:00`),
        from: h,
        to: h + hours.length,
        first: h === win[0],
      });
    }
  }
  return out;
}

/** The column that holds the current hour, if the table has one. */
export function nowColumnKey(columns: readonly CompareColumn[], nowHour: string): string | null {
  const time = `${nowHour}:00`;
  return columns.find((c) => c.times.includes(time))?.key ?? null;
}

export function buildTimeIndex(times: readonly string[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  times?.forEach((t, i) => map.set(t, i));
  return map;
}

/** Mean of directions on the circle, so 350° and 10° average to 0° and
    not to 180°. Null when there is nothing to average. */
export function circularMean(degrees: readonly number[]): number | null {
  if (degrees.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const d of degrees) {
    const r = (d * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null;
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (Math.round(deg) + 360) % 360;
}

export interface WindAgg {
  /** Slowest and fastest hour of the column, in knots, rounded. */
  lo: number;
  hi: number;
  /** Mean over the column, for the colour and the single-hour reading. */
  mid: number;
  /** Strongest gust of the column, or null when the series has none. */
  gust: number | null;
  /** Mean direction the wind comes from, or null. */
  dir: number | null;
}

export interface WaveAgg {
  /** Mean significant height, in metres. */
  hs: number;
  /** Mean direction the waves come from, or null. */
  dir: number | null;
  /** Mean period, in seconds, or null. */
  period: number | null;
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** The wind of a column, folded from its hours. Null when no hour has a
    reading (outside the model's horizon, or its grid). */
export function aggregateWind(
  forecast: ModelForecast | null,
  index: Map<string, number>,
  times: readonly string[],
): WindAgg | null {
  if (!forecast) return null;
  const { wind_speed_10m, wind_gusts_10m, wind_direction_10m } = forecast.hourly;
  const speeds: number[] = [];
  const gusts: number[] = [];
  const dirs: number[] = [];
  for (const t of times) {
    const i = index.get(t);
    if (i == null) continue;
    const speed = wind_speed_10m[i];
    if (speed == null) continue;
    speeds.push(speed);
    const gust = wind_gusts_10m[i];
    if (gust != null) gusts.push(gust);
    const dir = wind_direction_10m[i];
    if (dir != null) dirs.push(dir);
  }
  if (speeds.length === 0) return null;
  return {
    lo: Math.round(Math.min(...speeds)),
    hi: Math.round(Math.max(...speeds)),
    mid: Math.round(mean(speeds)),
    gust: gusts.length > 0 ? Math.round(Math.max(...gusts)) : null,
    dir: circularMean(dirs),
  };
}

/** The sea of a column, folded from its hours. Null without a reading. */
export function aggregateWaves(
  marine: MarineHourly | null,
  index: Map<string, number>,
  times: readonly string[],
): WaveAgg | null {
  if (!marine) return null;
  const heights: number[] = [];
  const dirs: number[] = [];
  const periods: number[] = [];
  for (const t of times) {
    const i = index.get(t);
    if (i == null) continue;
    const hs = marine.wave_height_m[i];
    if (hs == null) continue;
    heights.push(hs);
    const dir = marine.wave_direction_deg[i];
    if (dir != null) dirs.push(dir);
    const period = marine.wave_period_s[i];
    if (period != null) periods.push(period);
  }
  if (heights.length === 0) return null;
  return {
    hs: Math.round(mean(heights) * 10) / 10,
    dir: circularMean(dirs),
    period: periods.length > 0 ? Math.round(mean(periods) * 10) / 10 : null,
  };
}

/** What the wind band prints: the hour's value, or the column's range. A
    range is never reduced to its mean once the step exceeds the hour. */
export function windLabel(agg: WindAgg, res: Resolution): string {
  return res === 1 || agg.lo === agg.hi ? String(agg.mid) : `${agg.lo}–${agg.hi}`;
}

/** The sea's own colour ramp, six steps on the design's thresholds. */
export function waveLevel(hs: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (hs < 0.3) return 0;
  if (hs < 0.6) return 1;
  if (hs < 1.0) return 2;
  if (hs < 1.5) return 3;
  if (hs < 2.5) return 4;
  return 5;
}
