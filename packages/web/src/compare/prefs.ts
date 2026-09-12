// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import {
  clampWindow,
  DEFAULT_WINDOW,
  isResolution,
  type HourWindow,
  type Resolution,
} from "./data";

/**
 * The comparison page's settings, kept across visits: the step, the hour
 * window, whether the sea band is shown, the favourites left out of the
 * table, and how tall the phone's sheet was left. The favourites themselves
 * live in `useCustomSpots`; what is kept here is only which of them the
 * reader unticked, by position, so a renamed spot stays unticked and a
 * deleted one is simply never matched again.
 */
export interface ComparePrefs {
  res: Resolution;
  win: HourWindow;
  wave: boolean;
  /** `rowKey`s of the favourites not compared. */
  hidden: string[];
  /** Height of the phone's sheet, as a percentage of the map area. 100 is
      full screen, the map entirely covered. Ignored on a wide screen. */
  sheet: number;
}

/** The sheet never gives up its handle, and never grows past the screen. */
export const SHEET_MIN = 15;
export const SHEET_MAX = 100;
/** Its two tap heights: the table read wide, and a glance over the map. */
export const SHEET_OPEN = 78;
export const SHEET_PEEK = 40;
/** Below this the sheet is a peek, and the footer would eat the table. */
export const SHEET_FOOTER_MIN = 60;

export const DEFAULT_PREFS: ComparePrefs = {
  res: 3,
  win: DEFAULT_WINDOW,
  wave: true,
  hidden: [],
  sheet: SHEET_OPEN,
};

/** A height brought back inside the sheet's bounds, rounded to the percent. */
export function clampSheet(value: number): number {
  return Math.min(Math.max(Math.round(value), SHEET_MIN), SHEET_MAX);
}

const STORAGE_KEY = LOCAL_STORAGE_KEYS.compare;

/** A stored payload, whatever its shape, brought back to a valid one. */
export function sanitisePrefs(raw: unknown): ComparePrefs {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  const win =
    Array.isArray(r.win) && r.win.length === 2 && r.win.every((v) => typeof v === "number" && Number.isFinite(v))
      ? clampWindow([r.win[0] as number, r.win[1] as number])
      : DEFAULT_WINDOW;
  return {
    res: isResolution(r.res) ? r.res : DEFAULT_PREFS.res,
    win,
    wave: typeof r.wave === "boolean" ? r.wave : DEFAULT_PREFS.wave,
    hidden: Array.isArray(r.hidden) ? r.hidden.filter((k): k is string => typeof k === "string") : [],
    sheet: typeof r.sheet === "number" && Number.isFinite(r.sheet) ? clampSheet(r.sheet) : DEFAULT_PREFS.sheet,
  };
}

export function loadComparePrefs(): ComparePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitisePrefs(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveComparePrefs(prefs: ComparePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: the settings still apply, they just do not survive a reload */
  }
}
