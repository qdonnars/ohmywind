// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { storeBounded } from "./boundedCache";

const TTL = 30 * 60 * 1000;

function entry(fetchedAt: number) {
  return { fetchedAt };
}

describe("storeBounded", () => {
  it("drops the oldest entries beyond the cap", () => {
    const cache = new Map<string, { fetchedAt: number }>();
    for (let i = 0; i < 5; i++) storeBounded(cache, `k${i}`, entry(1000 + i), TTL, 3);
    expect([...cache.keys()]).toEqual(["k2", "k3", "k4"]);
  });

  it("drops what has expired, whatever the cap", () => {
    // Read-side expiry never freed these: nobody asks for them again.
    const cache = new Map<string, { fetchedAt: number }>();
    storeBounded(cache, "old1", entry(0), TTL, 100);
    storeBounded(cache, "old2", entry(1), TTL, 100);
    storeBounded(cache, "fresh", entry(TTL - 1), TTL, 100);
    storeBounded(cache, "now", entry(TTL + 1), TTL, 100);
    expect([...cache.keys()]).toEqual(["fresh", "now"]);
  });

  it("keeps an entry that is refreshed: a rewrite moves it to the tail", () => {
    const cache = new Map<string, { fetchedAt: number }>();
    storeBounded(cache, "a", entry(1), TTL, 2);
    storeBounded(cache, "b", entry(2), TTL, 2);
    storeBounded(cache, "a", entry(3), TTL, 2);
    storeBounded(cache, "c", entry(4), TTL, 2);
    expect([...cache.keys()]).toEqual(["a", "c"]);
    expect(cache.get("a")?.fetchedAt).toBe(3);
  });

  it("never drops the entry it has just stored", () => {
    const cache = new Map<string, { fetchedAt: number }>();
    storeBounded(cache, "a", entry(0), TTL, 1);
    storeBounded(cache, "b", entry(10 * TTL), TTL, 1);
    expect([...cache.keys()]).toEqual(["b"]);
  });
});
