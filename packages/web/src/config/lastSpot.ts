// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import type { Spot } from "../types";

/**
 * Remembers the last spot the user looked at, so the app reopens there
 * instead of always defaulting to the first saved favourite (issue #301).
 *
 * Any spot the user views counts, saved or not: a preview spot (map tap)
 * is still "where they were looking" and is the more useful place to
 * resume than an arbitrary favourite.
 */

const STORAGE_KEY = LOCAL_STORAGE_KEYS.lastSpot;

export function loadLastSpot(): Spot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.name === "string" &&
      typeof parsed?.latitude === "number" &&
      typeof parsed?.longitude === "number"
    ) {
      return parsed as Spot;
    }
    return null;
  } catch {
    // Private browsing or storage disabled: no resume point, land on the
    // usual defaults instead.
    return null;
  }
}

export function saveLastSpot(spot: Spot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spot));
  } catch {
    /* storage unavailable: the app still works, just without resume */
  }
}
