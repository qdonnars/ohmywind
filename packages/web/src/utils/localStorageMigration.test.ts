// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, beforeEach } from "vitest";
import { migrateLegacyKey } from "./localStorageMigration";

// vitest's default "node" environment has no global localStorage, so a
// minimal in-memory stand-in is installed before each test.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const LEGACY_KEY = "openwind_custom_spots";
const NEW_KEY = "ohmywind_custom_spots";

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
});

describe("migrateLegacyKey", () => {
  it("copies the value and drops the legacy key when only the legacy key exists", () => {
    localStorage.setItem(LEGACY_KEY, "[{\"name\":\"spot\"}]");
    migrateLegacyKey(LEGACY_KEY, NEW_KEY);
    expect(localStorage.getItem(NEW_KEY)).toBe("[{\"name\":\"spot\"}]");
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("does nothing when only the new key exists", () => {
    localStorage.setItem(NEW_KEY, "[]");
    migrateLegacyKey(LEGACY_KEY, NEW_KEY);
    expect(localStorage.getItem(NEW_KEY)).toBe("[]");
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("keeps the new value and leaves the legacy key untouched when both exist", () => {
    localStorage.setItem(LEGACY_KEY, "[\"old\"]");
    localStorage.setItem(NEW_KEY, "[\"new\"]");
    migrateLegacyKey(LEGACY_KEY, NEW_KEY);
    expect(localStorage.getItem(NEW_KEY)).toBe("[\"new\"]");
    expect(localStorage.getItem(LEGACY_KEY)).toBe("[\"old\"]");
  });

  it("does nothing when neither key exists", () => {
    migrateLegacyKey(LEGACY_KEY, NEW_KEY);
    expect(localStorage.getItem(NEW_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("is idempotent: calling it twice does not lose or duplicate data", () => {
    localStorage.setItem(LEGACY_KEY, "[\"spot\"]");
    migrateLegacyKey(LEGACY_KEY, NEW_KEY);
    migrateLegacyKey(LEGACY_KEY, NEW_KEY);
    expect(localStorage.getItem(NEW_KEY)).toBe("[\"spot\"]");
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});
