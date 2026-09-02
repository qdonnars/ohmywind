// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  clearPlanDraft,
  hasPlanDraft,
  loadPlanDraft,
  parsePlanDraft,
  savePlanDraft,
  type PlanDraft,
} from "./draft";

/** Minimal in-memory Storage. The suite runs on the node environment, so
    there is no sessionStorage to spy on: we install one. */
function installStorage(store = new Map<string, string>()) {
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

/** Storage that throws on every access, like Safari private browsing. */
function installBrokenStorage() {
  const boom = () => {
    throw new Error("storage disabled");
  };
  vi.stubGlobal("sessionStorage", { getItem: boom, setItem: boom, removeItem: boom });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const draft: Omit<PlanDraft, "savedAt"> = {
  waypoints: [
    [43.2, 5.36],
    [43.01, 6.2],
  ],
  departure: "2026-09-03T09:00",
  timeAnchor: "departure",
  archetype: "cruiser_30ft",
  mode: "single",
  sweepEarliest: "2026-09-03T09:00",
  sweepLatest: "2026-09-05T09:00",
  sweepIntervalHours: 3,
};

describe("plan draft round-trip", () => {
  it("restores the route being drawn", () => {
    installStorage();
    savePlanDraft(draft);
    expect(loadPlanDraft()).toMatchObject(draft);
  });

  it("stamps the write so age can be judged later", () => {
    installStorage();
    const before = Date.now();
    savePlanDraft(draft);
    expect(loadPlanDraft()!.savedAt).toBeGreaterThanOrEqual(before);
  });

  it("reports nothing pending on a fresh tab", () => {
    installStorage();
    expect(hasPlanDraft()).toBe(false);
    expect(loadPlanDraft()).toBeNull();
  });

  it("reports a pending draft without parsing it", () => {
    installStorage();
    savePlanDraft(draft);
    expect(hasPlanDraft()).toBe(true);
  });

  it("forgets the draft once the route is computed", () => {
    installStorage();
    savePlanDraft(draft);
    clearPlanDraft();
    expect(hasPlanDraft()).toBe(false);
    expect(loadPlanDraft()).toBeNull();
  });

  it("keeps a single waypoint, the state a reload used to destroy", () => {
    installStorage();
    savePlanDraft({ ...draft, waypoints: [[43.2, 5.36]] });
    expect(loadPlanDraft()!.waypoints).toEqual([[43.2, 5.36]]);
  });

  it("survives a storage that throws on every access", () => {
    installBrokenStorage();
    expect(() => savePlanDraft(draft)).not.toThrow();
    expect(loadPlanDraft()).toBeNull();
    expect(hasPlanDraft()).toBe(false);
    expect(() => clearPlanDraft()).not.toThrow();
  });
});

describe("parsePlanDraft", () => {
  const now = 1_800_000_000_000;
  const stored = JSON.stringify({ ...draft, savedAt: now });

  it("accepts a well-formed payload", () => {
    expect(parsePlanDraft(stored, now)).toMatchObject(draft);
  });

  it("rejects a payload that is not JSON", () => {
    expect(parsePlanDraft("{oops", now)).toBeNull();
  });

  it("rejects a JSON scalar", () => {
    expect(parsePlanDraft('"hello"', now)).toBeNull();
    expect(parsePlanDraft("null", now)).toBeNull();
  });

  it("rejects waypoints that are not coordinate pairs", () => {
    const bad = [
      [["43.2", "5.36"]],
      [[43.2]],
      [[43.2, 5.36, 7]],
      [[91, 5.36]],
      [[43.2, 181]],
      [[Number.NaN, 5.36]],
      ["43.2,5.36"],
    ];
    for (const waypoints of bad) {
      expect(parsePlanDraft(JSON.stringify({ ...draft, waypoints, savedAt: now }), now)).toBeNull();
    }
  });

  it("rejects an unknown mode or time anchor", () => {
    expect(
      parsePlanDraft(JSON.stringify({ ...draft, mode: "sweep", savedAt: now }), now),
    ).toBeNull();
    expect(
      parsePlanDraft(JSON.stringify({ ...draft, timeAnchor: "eta", savedAt: now }), now),
    ).toBeNull();
  });

  it("rejects a missing departure or archetype", () => {
    expect(parsePlanDraft(JSON.stringify({ ...draft, departure: "", savedAt: now }), now)).toBeNull();
    expect(parsePlanDraft(JSON.stringify({ ...draft, archetype: 3, savedAt: now }), now)).toBeNull();
  });

  it("rejects a non-numeric sweep interval", () => {
    expect(
      parsePlanDraft(JSON.stringify({ ...draft, sweepIntervalHours: "3", savedAt: now }), now),
    ).toBeNull();
  });

  it("rejects a draft written by a version that had no stamp", () => {
    expect(parsePlanDraft(JSON.stringify(draft), now)).toBeNull();
  });

  it("rejects a draft older than a day, restored with the tab", () => {
    const old = now - 25 * 3600 * 1000;
    expect(parsePlanDraft(JSON.stringify({ ...draft, savedAt: old }), now)).toBeNull();
    const recent = now - 23 * 3600 * 1000;
    expect(parsePlanDraft(JSON.stringify({ ...draft, savedAt: recent }), now)).not.toBeNull();
  });

  it("accepts an empty route, the state right after a reset", () => {
    expect(
      parsePlanDraft(JSON.stringify({ ...draft, waypoints: [], savedAt: now }), now)?.waypoints,
    ).toEqual([]);
  });
});
