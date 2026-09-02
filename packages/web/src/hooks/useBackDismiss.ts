// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef } from "react";

/**
 * The Android back button, mapped onto the panels the app opens over the map.
 *
 * In a TWA the system back button is the browser's back button: with a single
 * history entry it leaves the app outright. So opening the forecast panel, the
 * infos modal or a leg detail used to be undismissable by the gesture every
 * Android user reaches for first, and pressing back threw them out of the app
 * instead (issue #300).
 *
 * A layer therefore pushes a history entry of its own while it is open. Back
 * pops that entry, the layer closes, and the app stays put. Closing the layer
 * from inside (a close button, picking something else) pops the entry back off
 * so a later back press still leaves the app on the first try.
 *
 * The entries carry no URL change: a layer is transient state, not a place one
 * bookmarks or shares. What marks them is `history.state`, which is also how
 * the router knows to replace such an entry rather than stack a navigation on
 * top of it (see `router.tsx`).
 */

const LAYER_KEY = "ohmywind:layer";

/** The slice of `window.history` this module needs, so the stack below can be
    driven by a fake in tests (there is no DOM in this test environment). */
export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  back(): void;
}

/** Whether a history entry is one a layer pushed for itself. */
export function isLayerEntry(state: unknown): boolean {
  return typeof state === "object" && state !== null && LAYER_KEY in state;
}

function entryToken(state: unknown): number | null {
  if (!isLayerEntry(state)) return null;
  const token = (state as Record<string, unknown>)[LAYER_KEY];
  return typeof token === "number" ? token : null;
}

export class BackStack {
  private readonly history: HistoryLike;
  private layers: { token: number; dismiss: () => void }[] = [];
  /** Pops this stack asked for itself. Their `popstate` must dismiss nothing:
      the layer that triggered them is already closing. */
  private selfPops = 0;
  private nextToken = 1;

  constructor(history: HistoryLike) {
    this.history = history;
  }

  get depth(): number {
    return this.layers.length;
  }

  /** Opens a layer: one history entry to spend on the next back press. */
  open(dismiss: () => void): number {
    const token = this.nextToken++;
    this.layers.push({ token, dismiss });
    this.history.pushState({ [LAYER_KEY]: token }, "");
    return token;
  }

  /** A back gesture. Dismisses the topmost layer, nothing else: nested layers
      close one press at a time, innermost first. */
  handlePop(): void {
    if (this.selfPops > 0) {
      this.selfPops -= 1;
      return;
    }
    this.layers.pop()?.dismiss();
  }

  /** The layer closed from inside the app. Its entry is dropped so the user
      never has to press back on a layer that is already gone. Skipped when the
      entry is not the current one (another layer opened over it, or a
      navigation replaced it): rewriting history from under them would cost
      more than the stray entry it saves. */
  close(token: number): void {
    const idx = this.layers.findIndex((layer) => layer.token === token);
    if (idx === -1) return;
    this.layers.splice(idx, 1);
    if (entryToken(this.history.state) !== token) return;
    this.selfPops += 1;
    this.history.back();
  }

  /** Navigating to another page. The layers belong to the page being left and
      are about to unmount; forgetting them keeps a later back press from
      dismissing something nobody can see. */
  detachAll(): void {
    this.layers.length = 0;
  }
}

const noopHistory: HistoryLike = {
  state: null,
  pushState() {},
  back() {},
};

export const backStack = new BackStack(
  typeof window === "undefined" ? noopHistory : window.history,
);

/** One listener for every layer: `popstate` says a press happened, the stack
    says which layer it belongs to. Installed on the first layer and kept, the
    way the router keeps its own. */
let listening = false;
function listenOnce(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("popstate", () => backStack.handlePop());
}

/**
 * Dismiss `active` state with the back button.
 *
 * `onDismiss` is read through a ref, so callers can pass an inline closure
 * without reopening a history entry on every render.
 */
export function useBackDismiss(active: boolean, onDismiss: () => void): void {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!active) return;
    listenOnce();
    const token = backStack.open(() => dismissRef.current());
    return () => backStack.close(token);
  }, [active]);
}
