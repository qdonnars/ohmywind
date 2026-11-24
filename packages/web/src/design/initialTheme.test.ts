// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readSystemTheme,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  subscribeSystemTheme,
} from "./initialTheme";

function installStorage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

function installBrokenStorage() {
  const fail = () => {
    throw new Error("storage disabled");
  };
  vi.stubGlobal("localStorage", { getItem: fail, setItem: fail, removeItem: fail });
}

/** A device whose light/dark setting the test flips. */
function installSystem(light: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    matches: light,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => void listeners.add(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => void listeners.delete(l),
  };
  vi.stubGlobal("window", { matchMedia: () => mql });
  return {
    flip(toLight: boolean) {
      mql.matches = toLight;
      for (const l of listeners) l({ matches: toLight });
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme preference", () => {
  it("reads light and dark as stored, and anything else as Auto", () => {
    installStorage({ ow_theme: "light" });
    expect(readThemePreference()).toBe("light");
    installStorage({ ow_theme: "dark" });
    expect(readThemePreference()).toBe("dark");
    installStorage();
    expect(readThemePreference()).toBe("auto");
    installStorage({ ow_theme: "auto" });
    expect(readThemePreference()).toBe("auto");
  });

  it("stores Auto as the absence of the key, and the two others as such", () => {
    const store = installStorage();
    storeThemePreference("dark");
    expect(store.get("ow_theme")).toBe("dark");
    storeThemePreference("auto");
    expect(store.has("ow_theme")).toBe(false);
    storeThemePreference("light");
    expect(store.get("ow_theme")).toBe("light");
  });

  it("falls back to Auto, and does not throw, without storage", () => {
    installBrokenStorage();
    expect(readThemePreference()).toBe("auto");
    expect(() => storeThemePreference("dark")).not.toThrow();
    expect(() => storeThemePreference("auto")).not.toThrow();
  });

  it("resolves Auto to the device's setting and leaves the others alone", () => {
    expect(resolveTheme("auto", "light")).toBe("light");
    expect(resolveTheme("auto", "dark")).toBe("dark");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
  });
});

describe("device setting", () => {
  it("reads light or dark from prefers-color-scheme", () => {
    installSystem(true);
    expect(readSystemTheme()).toBe("light");
    installSystem(false);
    expect(readSystemTheme()).toBe("dark");
  });

  it("reads dark when matchMedia is missing or throws", () => {
    vi.stubGlobal("window", {});
    expect(readSystemTheme()).toBe("dark");
    vi.stubGlobal("window", {
      matchMedia: () => {
        throw new Error("denied");
      },
    });
    expect(readSystemTheme()).toBe("dark");
    expect(() => subscribeSystemTheme(() => {})()).not.toThrow();
  });

  it("reports each flip while subscribed, and nothing after", () => {
    const system = installSystem(false);
    const heard: string[] = [];
    const unsubscribe = subscribeSystemTheme((t) => heard.push(t));
    system.flip(true);
    system.flip(false);
    unsubscribe();
    system.flip(true);
    expect(heard).toEqual(["light", "dark"]);
    expect(system.listenerCount()).toBe(0);
  });
});
