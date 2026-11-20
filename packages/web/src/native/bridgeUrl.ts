// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { collectTransferableItems, fitPayload } from "../storage/transfer";

/**
 * The two URLs of the storage bridge between Chrome and the native shell.
 *
 * Out: the app opens `/transfert?n=<nonce>` in a Custom Tab. Back: that page
 * hands the payload to the app through a URL only the app can receive. Both
 * ends live here so the format is read in one place. No Capacitor code: the
 * page runs in a plain browser.
 */

/** Version of the return URL. Bumped only if its meaning changes. */
export const BRIDGE_VERSION = "1";

/** Path of the page that exports the browser's storage. */
export const TRANSFER_PATH = "/transfert";

const RETURN_SCHEME = "ohmywind";
const RETURN_HOST = "import";

/** What the app generates: 32 hex characters. The page accepts any
    base64url-safe token in a sane length range, so it never has to escape
    one into the return URL. */
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function isValidNonce(nonce: unknown): nonce is string {
  return typeof nonce === "string" && NONCE_PATTERN.test(nonce);
}

export interface BrowserEnv {
  hostname: string;
  userAgent: string;
}

/**
 * Android: an `intent:` URL pinned to the app's package. A bare
 * `ohmywind://` link would go to whichever app claims the scheme, and the
 * payload holds the reader's saved spots, which are locations. The package
 * follows the host serving this page, never a query parameter: production
 * returns to the store app, every other host (dev, localhost) to the dev
 * build.
 */
function androidReturnUrl(nonce: string, payload: string, hostname: string): string {
  const pkg = hostname === "ohmywind.fr" ? "fr.ohmywind.app" : "fr.ohmywind.app.dev";
  return (
    `intent://${RETURN_HOST}?v=${BRIDGE_VERSION}&n=${nonce}&d=${payload}` +
    `#Intent;scheme=${RETURN_SCHEME};package=${pkg};end`
  );
}

/**
 * How this browser can hand a payload back to the app, or null when it
 * cannot. The one platform-specific step of the export: an iOS return
 * (a universal link, say) is a new branch here and nothing else.
 */
export function returnUrlBuilder(env: BrowserEnv): ((nonce: string, payload: string) => string) | null {
  if (/Android/i.test(env.userAgent)) {
    return (nonce, payload) => androidReturnUrl(nonce, payload, env.hostname);
  }
  return null;
}

/**
 * The URL that hands this browser's data back to the app, or null when there
 * is no app to return to: no valid nonce, or a platform we cannot reach.
 */
export function prepareReturnUrl(
  search: string,
  storage: Pick<Storage, "getItem">,
  env: BrowserEnv,
): string | null {
  const nonce = new URLSearchParams(search).get("n");
  if (!isValidNonce(nonce)) return null;
  const build = returnUrlBuilder(env);
  if (!build) return null;
  // An empty payload is still sent: it is how the app learns there was
  // nothing to bring across, and closes the loop instead of waiting.
  return build(nonce, fitPayload(collectTransferableItems(storage)).encoded);
}

export interface ReturnParams {
  v: string;
  n: string;
  d: string;
}

/**
 * The parameters of `ohmywind://import?v=..&n=..&d=..` as the app receives
 * it, or null for any other URL. Says nothing about whether to trust them:
 * that is the importer's job, against its own pending state.
 */
export function parseReturnUrl(url: string): ReturnParams | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${RETURN_SCHEME}:` || parsed.hostname !== RETURN_HOST) return null;
  const v = parsed.searchParams.get("v");
  const n = parsed.searchParams.get("n");
  const d = parsed.searchParams.get("d");
  if (v === null || n === null || d === null) return null;
  return { v, n, d };
}
