// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The passing word that a request could not go out for want of a network
 * (issue #607).
 *
 * The app used to say it all the time, in a banner under the search on every
 * page, and a second time in the very place that lacked data. Now it says it
 * once, when the reader asks for something the network should have served
 * (a point tapped, a passage computed, departures or another route compared,
 * a spot added to the comparison, the app opened on its last spot) and the
 * browser reports no link. The toast (`components/OfflineToast.tsx`) shows
 * for `OFFLINE_NOTICE_MS`, then goes by itself.
 *
 * A module-level store rather than a context: the requests that fail live in
 * hooks and in plain functions far from the toast, and there is only ever
 * one toast on screen. A second failure while it shows restarts its clock;
 * it never stacks a second one.
 */

/** How long the toast stays up. Long enough to read four words on a moving
    deck, short enough not to sit over the chart. */
export const OFFLINE_NOTICE_MS = 5000;

type Listener = () => void;

let shown = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Whether the browser reports no network at all.
 *
 * Only `false` is trusted (see `hooks/useOnline.ts`): a captive portal or a
 * server that is down read as online, and keep their own error messages.
 */
function browserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Show the toast, or keep it up for another full period if it already is. */
export function notifyOffline(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    shown = false;
    emit();
  }, OFFLINE_NOTICE_MS);
  if (!shown) {
    shown = true;
    emit();
  }
}

/**
 * For a request that just failed: when the browser reports no network, say
 * so in the toast and answer true, so the caller treats the failure as "not
 * now" rather than as an error. False otherwise, and nothing is shown.
 */
export function noteIfOffline(): boolean {
  if (!browserOffline()) return false;
  notifyOffline();
  return true;
}

/** Take the toast down at once (the network is back). */
export function dismissOfflineNotice(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (shown) {
    shown = false;
    emit();
  }
}

export function subscribeOfflineNotice(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function offlineNoticeShown(): boolean {
  return shown;
}
