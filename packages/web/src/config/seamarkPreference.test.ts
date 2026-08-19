// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, afterEach, vi } from "vitest";
import { loadSeamarksEnabled, saveSeamarksEnabled } from "./seamarkPreference";

/** Minimal in-memory Storage. The suite runs on the node environment, so
    there is no localStorage to spy on: we install one. */
function installStorage(store = new Map<string, string>()) {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

/** Storage that throws on every access, like Safari private browsing. */
function installBrokenStorage() {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("storage disabled");
    },
    setItem: () => {
      throw new Error("storage disabled");
    },
    removeItem: () => {
      throw new Error("storage disabled");
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seamarkPreference defaults", () => {
  it("leaves the explore map clean, so the wind arrows are not competing with beacons on first visit", () => {
    installStorage();
    expect(loadSeamarksEnabled("explore")).toBe(false);
  });

  it("opens the planner with the marks on, since placing waypoints in real water is what it is for", () => {
    installStorage();
    expect(loadSeamarksEnabled("plan")).toBe(true);
  });

  it("falls back to each map's own default when storage is unreadable", () => {
    installBrokenStorage();
    expect(loadSeamarksEnabled("explore")).toBe(false);
    expect(loadSeamarksEnabled("plan")).toBe(true);
    expect(() => saveSeamarksEnabled("plan", false)).not.toThrow();
  });
});

describe("seamarkPreference persistence", () => {
  it("round-trips both states on each map", () => {
    installStorage();
    for (const surface of ["explore", "plan"] as const) {
      saveSeamarksEnabled(surface, true);
      expect(loadSeamarksEnabled(surface)).toBe(true);
      saveSeamarksEnabled(surface, false);
      expect(loadSeamarksEnabled(surface)).toBe(false);
    }
  });

  it("persists an explicit off rather than clearing the key, so the planner default does not hand the marks back to someone who turned them off", () => {
    const store = installStorage();
    saveSeamarksEnabled("plan", false);
    expect(store.get("ow_seamarks_plan_v1")).toBe("0");
    expect(loadSeamarksEnabled("plan")).toBe(false);
  });

  it("keeps the two maps independent: turning the marks off while routing must not strip them from the forecast map", () => {
    installStorage();
    saveSeamarksEnabled("explore", true);
    saveSeamarksEnabled("plan", false);
    expect(loadSeamarksEnabled("explore")).toBe(true);
    expect(loadSeamarksEnabled("plan")).toBe(false);
  });

  it("stores each map under its own key", () => {
    const store = installStorage();
    saveSeamarksEnabled("explore", true);
    saveSeamarksEnabled("plan", true);
    expect([...store.keys()].sort()).toEqual(["ow_seamarks_explore_v1", "ow_seamarks_plan_v1"]);
  });
});
