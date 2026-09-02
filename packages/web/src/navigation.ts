// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The address bar, as one store the whole app writes through.
 *
 * `history.pushState` and `history.replaceState` are silent: the browser fires
 * no event for them, only for a back or forward press. Any code that wrote to
 * the address bar directly therefore left the router holding the URL from
 * before the write, and the router only found out at the next `popstate`.
 *
 * That is a real bug, not a tidiness point. On `/plan` opened without a query
 * string, the mount rewrote the URL with the restored route; the router kept
 * `search: ""`. The first back press (closing the boat selector, which pushes
 * an entry of its own) re-read the location, the page key changed from
 * `/plan` to `/plan?wpts=…`, and `PlanPage` remounted from the draft, results
 * gone. The reader saw their computed passage vanish on a gesture that was
 * only meant to close a panel.
 *
 * So every internal write goes through `navigate`, which writes and then
 * notifies. No listener can be missed, and there is one place to look when
 * asking what changes the URL.
 *
 * Kept apart from `router.tsx` so it stays free of React and of the service
 * worker: the plan session persists its URL from a layout effect, and must be
 * able to import this without dragging either in.
 */

export interface AppLocation {
  /** Pathname, trailing slash removed. */
  path: string;
  /** Query string including its leading "?", or "". */
  search: string;
}

/** GitHub Pages appended trailing slashes when a matching directory existed
    under public/. Strip it so route matching stays a plain comparison. */
export function normalisePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function readLocation(): AppLocation {
  return {
    path: normalisePath(window.location.pathname),
    search: window.location.search,
  };
}

let snapshot: AppLocation = readLocation();
const listeners = new Set<() => void>();

/**
 * The current location.
 *
 * The returned object keeps its identity while the URL does not change, which
 * is what `useSyncExternalStore` requires. It is re-read on every call rather
 * than trusted from the last `navigate`, so a write from outside this module
 * (a browser extension, a test, code we have not written yet) is picked up at
 * the next render instead of being ignored forever.
 */
export function getLocation(): AppLocation {
  const next = readLocation();
  if (next.path !== snapshot.path || next.search !== snapshot.search) {
    snapshot = next;
  }
  return snapshot;
}

/** Subscribe to location changes. The first subscriber wires `popstate`. */
export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("popstate", notify);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("popstate", notify);
    }
  };
}

/** Tell every subscriber to re-read the location. */
function notify(): void {
  for (const listener of [...listeners]) listener();
}

export interface NavigateOptions {
  /**
   * Replace the current history entry instead of stacking a new one. Used for
   * a URL that *describes* the page rather than being a place the reader
   * chose to go: the plan URL rewritten after a computation, or a navigation
   * away from a page whose open panel had pushed an entry of its own.
   */
  replace?: boolean;
}

/**
 * Change the address bar, and tell the router.
 *
 * `replaceState(null, …)` also resets `history.state`, which is the signal
 * `BackStack.close` reads to leave behind an entry it no longer owns. That
 * behaviour is unchanged and load-bearing; see `hooks/useBackDismiss.ts`.
 */
export function navigate(url: string, options: NavigateOptions = {}): void {
  if (options.replace) {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
  }
  notify();
}
