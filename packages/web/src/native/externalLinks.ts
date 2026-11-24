// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Links to other sites, inside the native shell: opened in the app's own
 * browser sheet (Custom Tab on Android, Safari view on iOS) rather than
 * handed to the system browser, which leaves the app, or loaded in the
 * WebView, which would replace the app.
 *
 * Only http(s) links to another origin are taken. `mailto:`, `tel:` and the
 * other schemes stay with the system (mail, phone), and a link to the site
 * itself stays an in-app navigation. A tap with a modifier, a link with
 * `download` and a click already handled by the page are left alone.
 *
 * Listened to in the capture phase: Leaflet stops the propagation of clicks
 * in its controls (the map attribution links among them), so a listener on
 * the way back up would never see them.
 *
 * No Capacitor here: the opener comes in from `capacitorShell.ts`.
 */

/** The URL to open in the browser sheet, or null when the app keeps it. */
export function externalHttpUrl(href: string, base: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.origin === origin) return null;
  return url.href;
}

interface ClickLike {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

function anchorOf(target: EventTarget | null): Element | null {
  const el = target as { closest?: (s: string) => Element | null } | null;
  return typeof el?.closest === "function" ? el.closest("a[href]") : null;
}

/**
 * Decides one click. Returns the URL it opened, or null when the click goes
 * on as usual. Exported for the tests.
 */
export function handleLinkClick(
  event: ClickLike,
  base: string,
  origin: string,
  open: (url: string) => Promise<void>,
): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = anchorOf(event.target);
  if (!anchor || anchor.hasAttribute("download")) return null;
  const href = anchor.getAttribute("href");
  if (!href) return null;
  const url = externalHttpUrl(href, base, origin);
  if (!url) return null;
  event.preventDefault();
  // A sheet that fails to open leaves the reader where they were, which is
  // better than an exception in the middle of a tap.
  open(url).catch(() => undefined);
  return url;
}

export function openExternalLinksInApp(
  win: Pick<Window, "addEventListener" | "location">,
  open: (url: string) => Promise<void>,
): void {
  win.addEventListener(
    "click",
    (event) => {
      handleLinkClick(event, win.location.href, win.location.origin, open);
    },
    true,
  );
}
