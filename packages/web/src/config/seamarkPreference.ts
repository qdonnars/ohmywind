// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Remembers whether the marine-chart overlay is on.
 *
 * Deliberately one flag shared by the explore map and the planner map: a
 * sailor who turned the marks on to read an approach expects them still on
 * when they switch to tracing the route, and the reverse. Defaults to off,
 * so a first visit still opens on the clean basemap the app is designed
 * around.
 */

const STORAGE_KEY = "ow_seamarks_v1";

export function loadSeamarksEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private browsing or storage disabled: the overlay is a preference,
    // not a requirement. Fall back to the default.
    return false;
  }
}

export function saveSeamarksEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable: the toggle still works for this session */
  }
}
