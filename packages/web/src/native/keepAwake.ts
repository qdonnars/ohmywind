// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { isNativeShell, loadPlugins } from "./index";

/**
 * Keeps the screen on while a computed plan is on screen: a skipper reading
 * the timings at the chart table should not have to tap the phone awake.
 *
 * The Screen Wake Lock API first, wherever it exists (Chrome and Android
 * WebView since 84, Safari and WKWebView since iOS 18.4). Inside the app,
 * when it is missing (iOS 15 to 18.3) or refuses, the KeepAwake plugin
 * (FLAG_KEEP_SCREEN_ON on Android, the idle timer on iOS). In a browser
 * without the API, nothing.
 *
 * Held only while wanted and the page is visible. A web lock is dropped by
 * the browser when the page is hidden; the native one is dropped here, at
 * the same moment, and both are taken again when the page comes back.
 */

export interface WakeLockSentinelLike {
  readonly released?: boolean;
  release(): Promise<void>;
}

export interface KeepAwakeEnv {
  inShell: boolean;
  /** `navigator.wakeLock.request("screen")`, or undefined without the API. */
  requestWebLock: (() => Promise<WakeLockSentinelLike>) | undefined;
  nativeKeepOn(): Promise<void>;
  nativeAllowOff(): Promise<void>;
  isVisible(): boolean;
  /** Subscribes, returns the unsubscribe. */
  onVisibilityChange(listener: () => void): () => void;
}

export interface ScreenKeeper {
  setWanted(wanted: boolean): void;
  dispose(): void;
}

type Held = { kind: "web"; sentinel: WakeLockSentinelLike } | { kind: "native" } | null;

export function createScreenKeeper(env: KeepAwakeEnv): ScreenKeeper {
  let wanted = false;
  let held: Held = null;
  // Bumped at every decision: an acquisition that resolves after the page
  // stopped wanting it must give the lock straight back.
  let generation = 0;

  const shouldHold = () => wanted && env.isVisible();

  function release(): void {
    const current = held;
    held = null;
    if (current?.kind === "web") {
      if (!current.sentinel.released) current.sentinel.release().catch(() => undefined);
    } else if (current?.kind === "native") {
      env.nativeAllowOff().catch(() => undefined);
    }
  }

  async function acquire(gen: number): Promise<void> {
    if (env.requestWebLock) {
      try {
        const sentinel = await env.requestWebLock();
        if (gen !== generation || !shouldHold()) {
          sentinel.release().catch(() => undefined);
          return;
        }
        held = { kind: "web", sentinel };
        return;
      } catch {
        // Refused (no permission in this WebView, low battery mode): the
        // app still has its own way; a browser has none.
      }
    }
    if (!env.inShell || gen !== generation || !shouldHold()) return;
    try {
      await env.nativeKeepOn();
    } catch {
      return;
    }
    if (gen !== generation || !shouldHold()) {
      env.nativeAllowOff().catch(() => undefined);
      return;
    }
    held = { kind: "native" };
  }

  function update(): void {
    generation += 1;
    if (!shouldHold()) {
      release();
      return;
    }
    // A web lock the browser released on its own (page hidden, then shown
    // again) is gone: take a new one.
    if (held?.kind === "web" && held.sentinel.released) held = null;
    if (held) return;
    void acquire(generation);
  }

  const unsubscribe = env.onVisibilityChange(update);

  return {
    setWanted(next) {
      if (next === wanted) return;
      wanted = next;
      update();
    },
    dispose() {
      unsubscribe();
      wanted = false;
      generation += 1;
      release();
    },
  };
}

export function browserKeepAwakeEnv(): KeepAwakeEnv {
  const wakeLock = typeof navigator === "undefined" ? undefined : (navigator as Navigator).wakeLock;
  return {
    inShell: isNativeShell(),
    requestWebLock: wakeLock && typeof wakeLock.request === "function" ? () => wakeLock.request("screen") : undefined,
    nativeKeepOn: async () => {
      const plugins = await loadPlugins();
      if (!plugins) throw new Error("no native shell");
      await plugins.keepScreenOn();
    },
    nativeAllowOff: async () => {
      const plugins = await loadPlugins();
      await plugins?.allowScreenOff();
    },
    isVisible: () => document.visibilityState === "visible",
    onVisibilityChange: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}
