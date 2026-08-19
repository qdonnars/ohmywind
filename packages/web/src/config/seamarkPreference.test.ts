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

describe("seamarkPreference", () => {
  it("defaults to off, so a first visit opens on the clean basemap", () => {
    installStorage();
    expect(loadSeamarksEnabled()).toBe(false);
  });

  it("round-trips both states", () => {
    installStorage();
    saveSeamarksEnabled(true);
    expect(loadSeamarksEnabled()).toBe(true);
    saveSeamarksEnabled(false);
    expect(loadSeamarksEnabled()).toBe(false);
  });

  it("persists an explicit off rather than clearing the key: a user who turned the overlay off must not be handed it back by a future default flip", () => {
    const store = installStorage();
    saveSeamarksEnabled(false);
    expect(store.get("ow_seamarks_v1")).toBe("0");
  });

  it("treats an unreadable storage as off instead of throwing into the render", () => {
    installBrokenStorage();
    expect(loadSeamarksEnabled()).toBe(false);
    expect(() => saveSeamarksEnabled(true)).not.toThrow();
  });
});
