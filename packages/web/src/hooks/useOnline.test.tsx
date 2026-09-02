// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { onlineStore, useOnline, type OnlineEventTargetLike, type OnlineSourceLike } from "./useOnline";

function fakeTarget() {
  const listeners = new Map<string, Set<() => void>>();
  const target: OnlineEventTargetLike & { fire: (type: string) => void; count: number } = {
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type, listener) => void listeners.get(type)?.delete(listener),
    fire: (type) => listeners.get(type)?.forEach((l) => l()),
    get count() {
      let n = 0;
      listeners.forEach((set) => (n += set.size));
      return n;
    },
  };
  return target;
}

describe("onlineStore", () => {
  it("reads the browser's current answer", () => {
    expect(onlineStore({ onLine: true }, null).getSnapshot()).toBe(true);
    expect(onlineStore({ onLine: false }, null).getSnapshot()).toBe(false);
  });

  it("re-reads the source rather than caching the first answer", () => {
    const source: OnlineSourceLike & { onLine: boolean } = { onLine: true };
    const store = onlineStore(source, null);
    source.onLine = false;
    expect(store.getSnapshot()).toBe(false);
  });

  it("subscribes to both events and detaches on unsubscribe", () => {
    const target = fakeTarget();
    const store = onlineStore({ onLine: true }, target);
    let notified = 0;
    const unsubscribe = store.subscribe(() => (notified += 1));
    expect(target.count).toBe(2);
    target.fire("offline");
    target.fire("online");
    expect(notified).toBe(2);
    unsubscribe();
    expect(target.count).toBe(0);
    target.fire("offline");
    expect(notified).toBe(2);
  });

  it("reads as online without a DOM, and unsubscribing is safe", () => {
    // No `navigator`, no `window`: a browser too old for the API, or any
    // non-DOM render path. Neither may be accused of being offline.
    const store = onlineStore(null, null);
    expect(store.getSnapshot()).toBe(true);
    expect(() => store.subscribe(() => {})()).not.toThrow();
  });
});

function Probe() {
  return <span>{useOnline() ? "en ligne" : "hors ligne"}</span>;
}

// jsdom's `navigator.onLine` is a getter on the prototype and always true.
// Overriding the own property is how a lost signal is simulated; each test
// puts it back so the next one starts from a connected browser.
function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setOnLine(true);
});

describe("useOnline", () => {
  it("starts from what the browser reports at mount", () => {
    setOnLine(false);
    render(<Probe />);
    expect(screen.getByText("hors ligne")).toBeTruthy();
  });

  it("follows the offline and online events", () => {
    render(<Probe />);
    expect(screen.getByText("en ligne")).toBeTruthy();

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("hors ligne")).toBeTruthy();

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByText("en ligne")).toBeTruthy();
  });
});
