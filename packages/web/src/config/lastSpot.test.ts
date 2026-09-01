// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, afterEach, vi } from "vitest";
import { loadLastSpot, saveLastSpot } from "./lastSpot";
import type { Spot } from "../types";

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

const spot: Spot = { name: "Brest", latitude: 48.39, longitude: -4.49 };

describe("lastSpot", () => {
  it("returns null when nothing was ever consulted", () => {
    installStorage();
    expect(loadLastSpot()).toBeNull();
  });

  it("round-trips the last consulted spot, saved or previewed", () => {
    installStorage();
    saveLastSpot(spot);
    expect(loadLastSpot()).toEqual(spot);
  });

  it("keeps the most recently consulted spot when it changes", () => {
    installStorage();
    const other: Spot = { name: "-4.490, 48.390", latitude: 48.4, longitude: -4.5 };
    saveLastSpot(spot);
    saveLastSpot(other);
    expect(loadLastSpot()).toEqual(other);
  });

  it("falls back to null when storage is unreadable", () => {
    installBrokenStorage();
    expect(loadLastSpot()).toBeNull();
    expect(() => saveLastSpot(spot)).not.toThrow();
  });

  it("falls back to null on corrupted or unexpected stored content", () => {
    const store = installStorage();
    store.set("ow_last_spot_v1", "not json");
    expect(loadLastSpot()).toBeNull();
    store.set("ow_last_spot_v1", JSON.stringify({ name: "Brest" }));
    expect(loadLastSpot()).toBeNull();
  });
});
