// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { registerSW } from "virtual:pwa-register";
import { hasPlanDraft } from "./plan/draft";

/**
 * Service worker registration, plus an update check the router can trigger.
 *
 * Before client-side routing, every mode switch was a full navigation, which
 * gave the browser a natural occasion to look for a new service worker. Now
 * that navigations stop after the first load, a long session could sit on a
 * stale worker indefinitely and never pick up a deploy. Checking on each
 * in-app navigation restores roughly the old cadence.
 *
 * ## Why the silent auto-update was replaced
 *
 * This used to run in vite-plugin-pwa's `autoUpdate` mode, with Workbox's
 * `skipWaiting`. In that mode the plugin's own client reloads the page,
 * unconditionally, the moment the new worker activates: its `activated`
 * handler calls `window.location.reload()` whenever the event is an update
 * and no `onNeedReload` was supplied. Combined with an update check on every
 * in-app navigation, a deploy landing while someone was drawing a route
 * reloaded the page under them, and everything not yet computed was gone:
 * the URL and `ow_last_simulation_v1` are only written after a *successful*
 * computation.
 *
 * We now register in `prompt` mode and drive the swap ourselves. The original
 * motivation for `skipWaiting` still holds and is still met: a new worker must
 * never sit in `waiting` forever, which on a phone that never closes its last
 * tab means the app stays pinned to the old shell, refresh after refresh. The
 * difference is only *when* we let it through. We call `updateSW()` ourselves,
 * within the same session, at a moment that costs the reader nothing:
 *
 *   - straight away when nothing is being drafted;
 *   - otherwise when the tab goes to the background, or on the reader's next
 *     in-app navigation (the router calls `flushPendingUpdate`).
 *
 * The draft itself (see `plan/draft.ts`) is the other half of the fix: even a
 * reload the reader did not ask for now hands their route back.
 */

let registration: ServiceWorkerRegistration | undefined;
let lastCheckedAt = 0;

/** Set once a new worker is waiting: calling it swaps it in and reloads. */
let applyUpdate: (() => void) | undefined;

/** Navigations can come in bursts (back, forward, back). One network check a
    minute is plenty to catch a deploy without hammering the origin. */
const MIN_INTERVAL_MS = 60_000;

/** Pure, so the throttle is testable without a service worker or a clock. */
export function shouldCheckForUpdate(now: number, lastAt: number): boolean {
  return now - lastAt >= MIN_INTERVAL_MS;
}

/**
 * What woke the pending-update check.
 *
 * `found` is the only one that can interrupt anybody: the worker turned up on
 * its own while the reader was looking at the page. The other two are moments
 * the reader created, where a reload is invisible or expected anyway.
 */
export type UpdateTrigger = "found" | "hidden" | "navigation";

/**
 * Pure decision: may a waiting worker be swapped in right now?
 *
 * Kept free of `document` and `sessionStorage` so the policy can be tested on
 * its own. The ugly part of the old behaviour was that there was no policy at
 * all.
 */
export function shouldApplyUpdateNow(trigger: UpdateTrigger, hasDraft: boolean): boolean {
  // Backgrounded tab, or a navigation the reader just made: nothing on screen
  // is worth protecting, take the update.
  if (trigger !== "found") return true;
  // Found mid-session: only interrupt when there is no uncommitted route.
  return !hasDraft;
}

function flush(trigger: UpdateTrigger): void {
  if (!applyUpdate) return;
  if (!shouldApplyUpdateNow(trigger, hasPlanDraft())) return;
  const apply = applyUpdate;
  applyUpdate = undefined;
  apply();
}

/** Called by the router on every in-app navigation: an update that has been
    waiting for a safe moment gets one here. */
export function flushPendingUpdate(): void {
  flush("navigation");
}

export function registerServiceWorker(): void {
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, r) {
      registration = r;
    },
    onNeedRefresh() {
      // `prompt` mode names this "needs refresh"; we do not prompt. The
      // callback only tells us a worker is waiting, and vite-plugin-pwa has
      // already armed the `controlling` listener that reloads the page once
      // we let the swap through.
      applyUpdate = () => void updateSW(true);
      flush(document.visibilityState === "hidden" ? "hidden" : "found");
    },
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush("hidden");
  });
}

/**
 * Ask the browser whether a newer worker exists.
 *
 * Safe to call on every navigation: throttled, and failures are swallowed.
 * A worker found here installs and waits; `onNeedRefresh` then decides when it
 * takes over. Pages read their state from the URL, and now from the session
 * draft, at mount, so the eventual reload lands the reader back where they
 * were, on the new build.
 */
export function checkForAppUpdate(): void {
  if (!registration) return;
  const now = Date.now();
  if (!shouldCheckForUpdate(now, lastCheckedAt)) return;
  lastCheckedAt = now;
  // Rejects when offline, or when the origin is unreachable. Neither is
  // worth surfacing: the app keeps running on what it already has.
  registration.update().catch(() => {});
}
