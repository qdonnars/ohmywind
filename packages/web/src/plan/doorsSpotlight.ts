// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useSyncExternalStore } from "react";

/**
 * The two comparison doors lit up for a moment, when « Y aller » on the
 * comparison hint brings the reader to them.
 *
 * A module store rather than plan state: it is a flash of the interface,
 * not a fact about the passage, and the hint sits over the map, nowhere
 * near the doors in the tree.
 */

/** Three turns of `.door-spotlight` (1.2 s each), which ends on no halo. */
export const SPOTLIGHT_MS = 3_600;

let lit = false;
let timer: number | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Light the doors up for `SPOTLIGHT_MS`; a second call restarts the clock. */
export function spotlightDoors(): void {
  window.clearTimeout(timer);
  lit = true;
  notify();
  timer = window.setTimeout(() => {
    lit = false;
    notify();
  }, SPOTLIGHT_MS);
}

/** Whether the doors are lit right now. */
export function useDoorsSpotlight(): boolean {
  return useSyncExternalStore(subscribe, () => lit, () => false);
}
