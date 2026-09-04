// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Every `localStorage` and `sessionStorage` key the app writes, in one place.
 *
 * Until now each module minted its own literal, and the fifteen keys had drifted
 * into three naming schemes (`ow_*`, `ohmywind_*`, `ohmywind:*`) with versioning
 * applied to some and not others. Nothing enforced uniqueness, nothing listed
 * what a "clear my data" would have to remove, and a rename had to be found by
 * grep. The registry fixes the three at once: the names are visible side by
 * side, `STORAGE_KEYS` is the exhaustive list, and TypeScript rejects a typo.
 *
 * Conventions for a new key:
 *
 * - prefix `ow_`, snake_case, and a `_vN` suffix as soon as the value is
 *   structured (anything JSON). A bare scalar whose meaning cannot change (a
 *   theme name, a boolean) may go unversioned.
 * - bump `_vN` rather than reinterpret an existing payload, and give the reader
 *   a migration. `config/polarConfig.ts` is the model to copy: it carries its
 *   own v1 to v3 upgrade path with sanitisers.
 * - a key renamed from an older release goes in `LEGACY_STORAGE_KEYS` and gets
 *   a one-shot `migrateLegacyKey` call, so a returning user keeps their data.
 *
 * Not listed here, on purpose: `history.state` markers (`ohmywind:layer`, see
 * `hooks/useBackDismiss.ts`) are navigation state, not storage, and cookies are
 * centralised in `utils/cookies.ts`.
 */

/** Keys written to `window.localStorage`, i.e. kept across sessions. */
export const LOCAL_STORAGE_KEYS = {
  /** `"dark" | "light"`. Read before first paint, so it stays a bare scalar. */
  theme: "ow_theme",
  /** `TimezoneMode`: which clock the forecast tables display. */
  timezone: "ow_tz",
  /** `Lang` code ("fr", "en", ...) picked in /config. Absent until the reader
      chooses: the browser language decides meanwhile. Bare scalar. */
  lang: "ow_lang",
  /** `"1"` once the user has declined geolocation, so we stop asking. */
  geolocDeclined: "ow_geoloc_declined_v1",
  /** Sea marks overlay, one flag per map surface. */
  seamarksExplore: "ow_seamarks_explore_v1",
  seamarksPlan: "ow_seamarks_plan_v1",
  /** Cached MARC atlas coverage (tiles + bbox), refreshed on a TTL. */
  marcCoverage: "ow_marc_coverage_v1",
  /** Boat configuration: archetype, polar overrides, efficiency. v1 to v3. */
  polarConfig: "ow_polar_config_v1",
  /** Weather model order and enabled set. */
  modelConfig: "ow_model_config_v1",
  /** Last spot opened, so the app reopens where the user left off. */
  lastSpot: "ow_last_spot_v1",
  /** EMODnet soundings already resolved for a waypoint, keyed by position. */
  waypointDepths: "ow_waypoint_depths_v1",
  /** Height of the mobile plan drawer, in vh. */
  drawerHeight: "ow_drawer_vh_v1",
  /** Width of the desktop plan sidebar, in px. */
  sidebarWidth: "ow_sidebar_px_v1",
  /** Last computed passage, replayed on reopening `/plan`. Versioned, capped. */
  lastSimulation: "ow_last_simulation_v1",
  /** User-created spots. Pre-rebrand name, kept: renaming costs a migration
      for no gain, and the value is a plain array. */
  customSpots: "ohmywind_custom_spots",
  /** `"done"` once the planner hint has been shown or dismissed. */
  onboarding: "ohmywind:onboarding-v1",
} as const;

/** Keys written to `window.sessionStorage`, i.e. dropped when the tab closes. */
export const SESSION_STORAGE_KEYS = {
  /** Where `/config` should return to when the user backs out of it. */
  configReturnPath: "ow_config_return_to",
  /** Waypoints drawn but not yet computed, so a service worker update or a
      reload does not throw away work in progress. */
  planDraft: "ow_plan_draft_v1",
} as const;

/**
 * Keys from an earlier release, migrated once on read. Never written again.
 * See `utils/localStorageMigration.ts`.
 */
export const LEGACY_STORAGE_KEYS = {
  customSpots: "openwind_custom_spots",
  onboarding: "openwind:onboarding-v1",
} as const;

export type LocalStorageKey = (typeof LOCAL_STORAGE_KEYS)[keyof typeof LOCAL_STORAGE_KEYS];
export type SessionStorageKey = (typeof SESSION_STORAGE_KEYS)[keyof typeof SESSION_STORAGE_KEYS];

/** Every key the app owns, for tests and for a future "erase my data". */
export const STORAGE_KEYS: readonly string[] = [
  ...Object.values(LOCAL_STORAGE_KEYS),
  ...Object.values(SESSION_STORAGE_KEYS),
];
