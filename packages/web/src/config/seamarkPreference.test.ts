// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

type Module = typeof import("./seamarkPreference");

/** The module keeps the value for the page's lifetime: each test gets a
    fresh copy, as a fresh page load would. */
async function load(): Promise<Module> {
  vi.resetModules();
  return import("./seamarkPreference");
}

/** Minimal in-memory Storage. The suite runs on the node environment, so
    there is no localStorage to spy on: we install one. */
function installStorage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

/** Storage that throws on every access, like Safari private browsing. */
function installBrokenStorage() {
  const fail = () => {
    throw new Error("storage disabled");
  };
  vi.stubGlobal("localStorage", { getItem: fail, setItem: fail, removeItem: fail });
}

const NEW = "ow_seamarks_v2";
const EXPLORE = "ow_seamarks_explore_v1";
const PLAN = "ow_seamarks_plan_v1";

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seamarkPreference default", () => {
  it("is Always", async () => {
    const m = await load();
    expect(m.SEAMARKS_DEFAULT).toBe(true);
  });

  it("applies to a reader who never chose, on either map", async () => {
    installStorage();
    const m = await load();
    expect(m.loadSeamarksEnabled()).toBe(m.SEAMARKS_DEFAULT);
  });

  it("applies when storage is unreadable, and a choice still holds for the session", async () => {
    installBrokenStorage();
    const m = await load();
    expect(m.loadSeamarksEnabled()).toBe(m.SEAMARKS_DEFAULT);
    expect(() => m.saveSeamarksEnabled(false)).not.toThrow();
    expect(m.loadSeamarksEnabled()).toBe(false);
  });
});

describe("seamarkPreference persistence", () => {
  it("round-trips both choices under the one key", async () => {
    const store = installStorage();
    const m = await load();
    m.saveSeamarksEnabled(false);
    expect(store.get(NEW)).toBe("0");
    m.saveSeamarksEnabled(true);
    expect(store.get(NEW)).toBe("1");
    expect([...store.keys()]).toEqual([NEW]);
  });

  it("reads a stored choice back on the next page load", async () => {
    installStorage({ [NEW]: "0" });
    const m = await load();
    expect(m.loadSeamarksEnabled()).toBe(false);
  });

  it("stores an explicit Never rather than clearing the key, so the default cannot hand the marks back", async () => {
    const store = installStorage();
    const m = await load();
    m.saveSeamarksEnabled(false);
    expect(store.get(NEW)).toBe("0");
  });

  it("tells every subscriber when the choice changes, so both maps and the settings stay in step", async () => {
    installStorage();
    const m = await load();
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = m.subscribeSeamarks(a);
    m.subscribeSeamarks(b);
    m.saveSeamarksEnabled(false);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubscribeA();
    m.saveSeamarksEnabled(true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("picks up a choice made in another tab", async () => {
    const store = installStorage({ [NEW]: "1" });
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const m = await load();
    const listener = vi.fn();
    m.subscribeSeamarks(listener);
    expect(m.loadSeamarksEnabled()).toBe(true);
    store.set(NEW, "0");
    target.dispatchEvent(Object.assign(new Event("storage"), { key: NEW }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(m.loadSeamarksEnabled()).toBe(false);
    // Another key: nothing to hear.
    target.dispatchEvent(Object.assign(new Event("storage"), { key: "ow_theme" }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("seamarkPreference migration from the per-map flags", () => {
  // [explorer flag, planner flag, expected]. A flag was only ever written by
  // its map's button, so a stored value is an explicit choice. The planner's
  // choice decides first, then the explorer's, then the default.
  const cases: [string | null, string | null, boolean, string][] = [
    [null, null, true, "no flag: the default"],
    [null, "0", false, "planner turned off: Never"],
    [null, "1", true, "planner turned off then on again: Always"],
    ["1", null, true, "explorer turned on: Always"],
    ["0", null, false, "explorer turned on then off: Never"],
    ["1", "0", false, "conflict, explorer on and planner off: the planner decides"],
    ["0", "1", true, "conflict, explorer off and planner on: the planner decides"],
    ["1", "1", true, "on for both: Always"],
    ["0", "0", false, "off for both: Never"],
    ["yes", "garbage", true, "unreadable values count as no choice"],
  ];

  for (const [explore, plan, expected, label] of cases) {
    it(label, async () => {
      const entries: Record<string, string> = {};
      if (explore !== null) entries[EXPLORE] = explore;
      if (plan !== null) entries[PLAN] = plan;
      installStorage(entries);
      const m = await load();
      expect(m.loadSeamarksEnabled()).toBe(expected);
    });
  }

  it("lets the new choice win over the old flags once it exists", async () => {
    installStorage({ [NEW]: "1", [PLAN]: "0", [EXPLORE]: "0" });
    const m = await load();
    expect(m.loadSeamarksEnabled()).toBe(true);
  });

  it("never writes nor removes the old flags, so an earlier build still finds them", async () => {
    const store = installStorage({ [PLAN]: "0", [EXPLORE]: "1" });
    const m = await load();
    m.loadSeamarksEnabled();
    expect(store.has(NEW)).toBe(false);
    m.saveSeamarksEnabled(true);
    expect(store.get(PLAN)).toBe("0");
    expect(store.get(EXPLORE)).toBe("1");
  });
});
