// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useSyncExternalStore } from "react";

/**
 * What the store reads: the browser's own idea of whether it has a network.
 *
 * Split from the event target so a test can move `onLine` under a live
 * subscription, which is exactly what a phone losing its signal does.
 */
export interface OnlineSourceLike {
  readonly onLine: boolean;
}

/** The slice of `window` the store subscribes to. */
export interface OnlineEventTargetLike {
  addEventListener(type: "online" | "offline", listener: () => void): void;
  removeEventListener(type: "online" | "offline", listener: () => void): void;
}

/**
 * Pure: turns `navigator` plus `window` into the `subscribe`/`getSnapshot`
 * pair `useSyncExternalStore` wants.
 *
 * Either half may be `null` (no DOM at all): the store then reads as online
 * and subscribes to nothing. Reading as online is the deliberate default,
 * see `useOnline` below.
 */
export function onlineStore(
  source: OnlineSourceLike | null,
  target: OnlineEventTargetLike | null,
): {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
} {
  return {
    subscribe(onChange) {
      if (!target) return () => {};
      target.addEventListener("online", onChange);
      target.addEventListener("offline", onChange);
      return () => {
        target.removeEventListener("online", onChange);
        target.removeEventListener("offline", onChange);
      };
    },
    getSnapshot: () => source?.onLine ?? true,
  };
}

/**
 * Whether the browser believes it has a network, kept in sync with the
 * `online` and `offline` events.
 *
 * ## What this value proves, and what it does not
 *
 * The two directions are not symmetric, and the copy keyed on this hook
 * depends on knowing which is which:
 *
 * - `false` is trustworthy. The browser reports no link at all (airplane
 *   mode, no interface up), and no request can succeed. That is the case
 *   worth telling the sailor about, because a forecast that cannot be
 *   refreshed is the one thing this app must never let pass silently.
 * - `true` proves nothing. A captive portal, a marina wifi with no route
 *   out, or an origin that is down all read as online. So `true` is never
 *   used to promise anything, only to hide the warning.
 *
 * That asymmetry is why the fallbacks read as online: a browser without the
 * API, and any non-DOM render path, must not be accused of being offline.
 * The request itself remains the source of truth for failure, and
 * `friendlyError` in `api/passage.ts` handles the network error on its own.
 *
 * `useSyncExternalStore` rather than state plus an effect: the value is read
 * from the browser during render, so there is no frame where the banner and
 * the actual connectivity disagree.
 */
export function useOnline(): boolean {
  const store = useMemo(
    () =>
      onlineStore(
        typeof navigator !== "undefined" ? navigator : null,
        typeof window !== "undefined" ? window : null,
      ),
    [],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => true);
}
