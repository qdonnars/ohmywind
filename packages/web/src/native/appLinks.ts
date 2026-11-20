// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Links handed to the native shell by the system: a launcher shortcut
 * ("Planifier", "Réglages") today, a link to the site opened from another
 * app once the shell claims them.
 *
 * The shell does not navigate its WebView by itself: it passes the URL to
 * the page, which opens it the way a click on one of its own links would,
 * without reloading the app.
 */

/**
 * Where in the app `url` points, as a path the router takes, or null when it
 * is not a page of this site. The origin must match exactly: the shell also
 * receives `ohmywind://` URLs (see `shellImport.ts`), and a link to another
 * host must never be turned into a path here.
 */
export function inAppPath(url: string, origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== origin) return null;
  return parsed.pathname + parsed.search + parsed.hash;
}
