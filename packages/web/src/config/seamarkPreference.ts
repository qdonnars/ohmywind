// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Whether the marine-chart overlay is on, remembered per map.
 *
 * The two maps do different jobs, so they get different defaults rather
 * than one shared flag. The explore map exists to read wind arrows over a
 * clean coastline: a screenful of beacons competing with the arrows is the
 * wrong first impression, so it opens without them. The planner map exists
 * to place waypoints in real water, where the marks are the point, so it
 * opens with them on.
 *
 * Each map also remembers its own choice. Sharing one flag would mean
 * turning the marks off while routing also strips them from the forecast
 * map, which the user never asked for.
 */

export type MapSurface = "explore" | "plan";

const STORAGE_KEYS: Record<MapSurface, string> = {
  explore: "ow_seamarks_explore_v1",
  plan: "ow_seamarks_plan_v1",
};

const DEFAULTS: Record<MapSurface, boolean> = {
  explore: false,
  plan: true,
};

export function loadSeamarksEnabled(surface: MapSurface): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS[surface]);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return DEFAULTS[surface];
  } catch {
    // Private browsing or storage disabled: the overlay is a preference,
    // not a requirement. Fall back to this map's default.
    return DEFAULTS[surface];
  }
}

export function saveSeamarksEnabled(surface: MapSurface, enabled: boolean): void {
  try {
    // An explicit "0" rather than clearing the key: a user who turned the
    // marks off on the planner must not be handed them back by the default.
    localStorage.setItem(STORAGE_KEYS[surface], enabled ? "1" : "0");
  } catch {
    /* storage unavailable: the toggle still works for this session */
  }
}
