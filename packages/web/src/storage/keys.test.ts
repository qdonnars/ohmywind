// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import {
  LEGACY_STORAGE_KEYS,
  LOCAL_STORAGE_KEYS,
  SESSION_STORAGE_KEYS,
  STORAGE_KEYS,
} from "./keys";

describe("storage key registry", () => {
  it("pins the shipped names, so a rename cannot be silent", () => {
    // These strings are on users' machines. Changing one without a migration
    // loses their boat, their spots or their last plan, and the loss shows up
    // as "the app forgot everything" with nothing in the console. The literals
    // are repeated here on purpose: this is the test that turns a rename into
    // a deliberate act.
    expect(LOCAL_STORAGE_KEYS).toEqual({
      theme: "ow_theme",
      timezone: "ow_tz",
      geolocDeclined: "ow_geoloc_declined_v1",
      seamarksExplore: "ow_seamarks_explore_v1",
      seamarksPlan: "ow_seamarks_plan_v1",
      marcCoverage: "ow_marc_coverage_v1",
      polarConfig: "ow_polar_config_v1",
      modelConfig: "ow_model_config_v1",
      lastSpot: "ow_last_spot_v1",
      waypointDepths: "ow_waypoint_depths_v1",
      drawerHeight: "ow_drawer_vh_v1",
      sidebarWidth: "ow_sidebar_px_v1",
      lastSimulation: "ow_last_simulation_v1",
      customSpots: "ohmywind_custom_spots",
      onboarding: "ohmywind:onboarding-v1",
    });
    expect(SESSION_STORAGE_KEYS).toEqual({
      configReturnPath: "ow_config_return_to",
      planDraft: "ow_plan_draft_v1",
    });
  });

  it("never reuses a name across the two stores", () => {
    expect(new Set(STORAGE_KEYS).size).toBe(STORAGE_KEYS.length);
  });

  it("keeps legacy names distinct from the live ones", () => {
    for (const legacy of Object.values(LEGACY_STORAGE_KEYS)) {
      expect(STORAGE_KEYS).not.toContain(legacy);
    }
  });

  it("lists every key of both stores", () => {
    expect(STORAGE_KEYS).toHaveLength(
      Object.keys(LOCAL_STORAGE_KEYS).length + Object.keys(SESSION_STORAGE_KEYS).length,
    );
  });
});
