// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { AVAILABLE_LANGS, isLang, type Lang } from "./types";

const KEY = LOCAL_STORAGE_KEYS.lang;

function available(v: unknown): v is Lang {
  return isLang(v) && AVAILABLE_LANGS.includes(v);
}

/** The language picked in /config, or null when the reader never chose one
    (or chose one this build does not ship yet). */
export function readStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return available(v) ? v : null;
  } catch {
    // Private browsing or storage disabled: the browser language decides.
    return null;
  }
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage unavailable: the choice still holds for this session */
  }
}

/**
 * The first browser language the app speaks, else English. English rather
 * than French for the fallback: a Dutch or Spanish sailor is more likely to
 * read it, and the French reader is matched by the loop anyway.
 */
export function detectLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (available(base)) return base;
  }
  return "en";
}
