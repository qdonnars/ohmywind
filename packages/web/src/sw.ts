// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { registerSW } from "virtual:pwa-register";

/**
 * Service worker registration, plus an update check the router can trigger.
 *
 * Before client-side routing, every mode switch was a full navigation, which
 * gave the browser a natural occasion to look for a new service worker. Now
 * that navigations stop after the first load, a long session could sit on a
 * stale worker indefinitely and never pick up a deploy. Checking on each
 * in-app navigation restores roughly the old cadence.
 */

let registration: ServiceWorkerRegistration | undefined;
let lastCheckedAt = 0;

/** Navigations can come in bursts (back, forward, back). One network check a
    minute is plenty to catch a deploy without hammering the origin. */
const MIN_INTERVAL_MS = 60_000;

/** Pure, so the throttle is testable without a service worker or a clock. */
export function shouldCheckForUpdate(now: number, lastAt: number): boolean {
  return now - lastAt >= MIN_INTERVAL_MS;
}

export function registerServiceWorker(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, r) {
      registration = r;
    },
  });
}

/**
 * Ask the browser whether a newer worker exists.
 *
 * Safe to call on every navigation: throttled, and failures are swallowed.
 * An update found here is applied on the next load, per the `autoUpdate`
 * registration, so nothing is swapped under the running page.
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
