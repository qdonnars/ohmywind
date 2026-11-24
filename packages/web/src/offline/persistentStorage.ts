// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Ask the browser not to evict what the app keeps for the offline case.
 *
 * Without it the origin's storage is "best effort": under disk pressure, or
 * after a period without visits, the browser may clear the service worker's
 * caches and the IndexedDB forecasts together, and the app reopens at sea on
 * an empty page. `navigator.storage.persist()` asks for the opposite.
 *
 * How each engine answers (MDN, « Storage quotas and eviction criteria »):
 *
 * - Chromium (Chrome, Edge, Android WebView, the TWA): no prompt, granted or
 *   refused on the site's engagement (installed, bookmarked, visited often).
 *   A refusal is silent and the request can be repeated later.
 * - Safari and WKWebView (iOS 17 and later, the iOS app): no prompt either,
 *   decided on the history of interaction with the site.
 * - Firefox: a permission popup. That is the « invite intempestive » to
 *   avoid, so Firefox is never asked; its best-effort storage is only cleared
 *   under real disk pressure, oldest origin first.
 *
 * When: once per page, and only after the app has written something worth
 * keeping (a forecast or a plan). Asking on a first visit that only looked at
 * the map would spend Chromium's verdict on an origin with no engagement yet.
 */

export interface PersistDeps {
  userAgent: string;
  storage: Pick<StorageManager, "persist" | "persisted"> | undefined;
}

/** Firefox prompts; every other engine decides on its own (see above). The
    iOS Firefox is WebKit underneath and says `FxiOS`, not `Firefox/`. */
export function persistMayPrompt(userAgent: string): boolean {
  return /\bFirefox\//.test(userAgent);
}

let asked = false;

/**
 * Request persistent storage if it can be done without a prompt and has not
 * been done on this page. Resolves to the browser's answer, or null when the
 * request was not made. Never rejects.
 */
export async function requestPersistentStorage(
  deps: PersistDeps = {
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    storage: typeof navigator === "undefined" ? undefined : navigator.storage,
  },
): Promise<boolean | null> {
  if (asked) return null;
  asked = true;
  const { storage } = deps;
  if (!storage?.persist || persistMayPrompt(deps.userAgent)) return null;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}

/** Test seam: forget that the request was made. */
export function resetPersistRequest(): void {
  asked = false;
}
