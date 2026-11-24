// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { loadKeepAwakeEnabled, saveKeepAwakeEnabled, subscribeKeepAwake } from "./keepAwakePreference";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

describe("keep-awake preference", () => {
  it("is on by default", () => {
    expect(loadKeepAwakeEnabled(memory())).toBe(true);
  });

  it("remembers an explicit off, and on again", () => {
    const s = memory();
    saveKeepAwakeEnabled(false, s);
    expect(s.getItem(LOCAL_STORAGE_KEYS.keepAwake)).toBe("0");
    expect(loadKeepAwakeEnabled(s)).toBe(false);
    saveKeepAwakeEnabled(true, s);
    expect(loadKeepAwakeEnabled(s)).toBe(true);
  });

  it("falls back to on when storage throws or holds garbage", () => {
    const broken = { getItem: () => { throw new Error("blocked"); } };
    expect(loadKeepAwakeEnabled(broken)).toBe(true);
    const s = memory();
    s.setItem(LOCAL_STORAGE_KEYS.keepAwake, "maybe");
    expect(loadKeepAwakeEnabled(s)).toBe(true);
    expect(() => saveKeepAwakeEnabled(false, { setItem: () => { throw new Error("quota"); } })).not.toThrow();
  });

  it("tells its readers of a change, so a plan on screen follows the settings", () => {
    const heard: number[] = [];
    const off = subscribeKeepAwake(() => heard.push(1));
    saveKeepAwakeEnabled(false, memory());
    off();
    saveKeepAwakeEnabled(true, memory());
    expect(heard).toHaveLength(1);
  });
});
