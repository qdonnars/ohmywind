// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { LG_MEDIA_QUERY, mediaQueryStore, type MediaQueryListLike } from "./useMediaQuery";

function fakeMql(matches: boolean) {
  const listeners = new Set<() => void>();
  const mql: MediaQueryListLike & { matches: boolean; fire: () => void; count: number } = {
    matches,
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
    fire: () => listeners.forEach((l) => l()),
    get count() {
      return listeners.size;
    },
  };
  return mql;
}

describe("mediaQueryStore", () => {
  it("reads the current match", () => {
    expect(mediaQueryStore(fakeMql(true)).getSnapshot()).toBe(true);
    expect(mediaQueryStore(fakeMql(false)).getSnapshot()).toBe(false);
  });

  it("re-reads the list rather than caching the first answer", () => {
    const mql = fakeMql(false);
    const store = mediaQueryStore(mql);
    mql.matches = true;
    expect(store.getSnapshot()).toBe(true);
  });

  it("notifies on a breakpoint crossing and detaches on unsubscribe", () => {
    const mql = fakeMql(false);
    const store = mediaQueryStore(mql);
    let notified = 0;
    const unsubscribe = store.subscribe(() => (notified += 1));
    expect(mql.count).toBe(1);
    mql.fire();
    expect(notified).toBe(1);
    unsubscribe();
    expect(mql.count).toBe(0);
    mql.fire();
    expect(notified).toBe(1);
  });

  it("reads as no-match without matchMedia, and unsubscribing is safe", () => {
    // Ancient browsers, and any non-DOM render path. The planner then mounts
    // its mobile layout, which is the one that works at every width.
    const store = mediaQueryStore(null);
    expect(store.getSnapshot()).toBe(false);
    expect(() => store.subscribe(() => {})()).not.toThrow();
  });
});

describe("LG_MEDIA_QUERY", () => {
  it("mirrors Tailwind's lg breakpoint", () => {
    // 64rem is what `lg:` compiles to. If this ever moves, the planner would
    // mount one panel while the CSS shows the other.
    expect(LG_MEDIA_QUERY).toBe("(min-width: 64rem)");
  });
});
