// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { createScreenKeeper, type KeepAwakeEnv, type WakeLockSentinelLike } from "./keepAwake";

const flush = () => new Promise((r) => setTimeout(r, 0));

function sentinel(): WakeLockSentinelLike & { released: boolean } {
  const s = {
    released: false,
    release: vi.fn(async () => {
      s.released = true;
    }),
  };
  return s;
}

function harness(over: Partial<KeepAwakeEnv> = {}) {
  let visible = true;
  const listeners = new Set<() => void>();
  const sentinels: ReturnType<typeof sentinel>[] = [];
  const env: KeepAwakeEnv = {
    inShell: false,
    requestWebLock: vi.fn(async () => {
      const s = sentinel();
      sentinels.push(s);
      return s;
    }),
    nativeKeepOn: vi.fn(async () => undefined),
    nativeAllowOff: vi.fn(async () => undefined),
    isVisible: () => visible,
    onVisibilityChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    ...over,
  };
  const setVisible = (v: boolean) => {
    visible = v;
    // The browser drops a web lock by itself when the page is hidden.
    if (!v) for (const s of sentinels) s.released = true;
    for (const l of listeners) l();
  };
  return { env, sentinels, setVisible, listeners };
}

describe("createScreenKeeper, web API", () => {
  it("takes a screen lock when wanted and gives it back when not", async () => {
    const h = harness();
    const keeper = createScreenKeeper(h.env);
    expect(h.env.requestWebLock).not.toHaveBeenCalled();
    keeper.setWanted(true);
    await flush();
    expect(h.env.requestWebLock).toHaveBeenCalledTimes(1);
    keeper.setWanted(false);
    expect(h.sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(h.env.nativeKeepOn).not.toHaveBeenCalled();
  });

  it("takes a new lock when the page comes back from the background", async () => {
    const h = harness();
    const keeper = createScreenKeeper(h.env);
    keeper.setWanted(true);
    await flush();
    h.setVisible(false);
    await flush();
    expect(h.env.requestWebLock).toHaveBeenCalledTimes(1);
    h.setVisible(true);
    await flush();
    expect(h.env.requestWebLock).toHaveBeenCalledTimes(2);
    keeper.dispose();
    expect(h.sentinels[1].release).toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  });

  it("does not ask while hidden", async () => {
    const h = harness();
    const keeper = createScreenKeeper(h.env);
    h.setVisible(false);
    keeper.setWanted(true);
    await flush();
    expect(h.env.requestWebLock).not.toHaveBeenCalled();
  });

  it("gives back a lock granted after the page stopped wanting it", async () => {
    let grant: (s: WakeLockSentinelLike) => void = () => undefined;
    const late = sentinel();
    const h = harness({ requestWebLock: vi.fn(() => new Promise<WakeLockSentinelLike>((r) => (grant = r))) });
    const keeper = createScreenKeeper(h.env);
    keeper.setWanted(true);
    keeper.setWanted(false);
    grant(late);
    await flush();
    expect(late.release).toHaveBeenCalledTimes(1);
  });

  it("does nothing in a browser without the API, or that refuses", async () => {
    const none = harness({ requestWebLock: undefined });
    createScreenKeeper(none.env).setWanted(true);
    const refused = harness({ requestWebLock: vi.fn(() => Promise.reject(new Error("NotAllowedError"))) });
    createScreenKeeper(refused.env).setWanted(true);
    await flush();
    expect(none.env.nativeKeepOn).not.toHaveBeenCalled();
    expect(refused.env.nativeKeepOn).not.toHaveBeenCalled();
  });
});

describe("createScreenKeeper, inside the app", () => {
  it("prefers the web API when the WebView has it", async () => {
    const h = harness({ inShell: true });
    createScreenKeeper(h.env).setWanted(true);
    await flush();
    expect(h.env.requestWebLock).toHaveBeenCalled();
    expect(h.env.nativeKeepOn).not.toHaveBeenCalled();
  });

  it("falls back to the plugin when the API is missing", async () => {
    const h = harness({ inShell: true, requestWebLock: undefined });
    const keeper = createScreenKeeper(h.env);
    keeper.setWanted(true);
    await flush();
    expect(h.env.nativeKeepOn).toHaveBeenCalledTimes(1);
    h.setVisible(false);
    expect(h.env.nativeAllowOff).toHaveBeenCalledTimes(1);
    h.setVisible(true);
    await flush();
    expect(h.env.nativeKeepOn).toHaveBeenCalledTimes(2);
    keeper.dispose();
    expect(h.env.nativeAllowOff).toHaveBeenCalledTimes(2);
  });

  it("falls back to the plugin when the API refuses", async () => {
    const h = harness({ inShell: true, requestWebLock: vi.fn(() => Promise.reject(new Error("NotAllowedError"))) });
    createScreenKeeper(h.env).setWanted(true);
    await flush();
    expect(h.env.nativeKeepOn).toHaveBeenCalledTimes(1);
  });

  it("lets the screen sleep again when the plugin answers too late", async () => {
    let done: () => void = () => undefined;
    const h = harness({
      inShell: true,
      requestWebLock: undefined,
      nativeKeepOn: vi.fn(() => new Promise<void>((r) => (done = r))),
    });
    const keeper = createScreenKeeper(h.env);
    keeper.setWanted(true);
    keeper.setWanted(false);
    done();
    await flush();
    expect(h.env.nativeAllowOff).toHaveBeenCalled();
  });

  it("survives a plugin that rejects", async () => {
    const h = harness({
      inShell: true,
      requestWebLock: undefined,
      nativeKeepOn: vi.fn(() => Promise.reject(new Error("missing"))),
    });
    const keeper = createScreenKeeper(h.env);
    keeper.setWanted(true);
    await flush();
    expect(() => keeper.setWanted(false)).not.toThrow();
    expect(h.env.nativeAllowOff).not.toHaveBeenCalled();
  });
});
