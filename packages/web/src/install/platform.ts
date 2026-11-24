// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { isNativeShell } from "../native";
import { SESSION_STORAGE_KEYS } from "../storage/keys";
import type { MobilePlatform } from "./stores";

/**
 * Where the page is running: which phone, and whether inside an app.
 *
 * The same build is the site, the installed PWA, the Android TWA still on
 * Google Play, and the page the Capacitor shell loads on Android and iOS.
 * Two questions follow from that, answered here and nowhere else:
 *
 * - may the site invite the reader to install the app (a phone's browser,
 *   not already in an app or an installed PWA);
 * - may the page mention a store or another platform (not inside a store
 *   app: Apple refuses an iOS app that names Android or Google Play, and the
 *   apps carry no such mention either way).
 *
 * The decisions are pure functions over plain signals, so the tests can
 * hand them any phone; the `current*` readers fetch the signals from the
 * browser.
 */

export interface DeviceSignals {
  userAgent: string;
  /** `navigator.maxTouchPoints`. */
  maxTouchPoints: number;
}

/**
 * The phone or tablet platform, or null on a computer.
 *
 * iPadOS asks for the desktop site by default, so an iPad says "Macintosh"
 * like a Mac. No Mac has a touch screen: a Mac user agent with several touch
 * points is an iPad.
 */
export function mobilePlatform({ userAgent, maxTouchPoints }: DeviceSignals): MobilePlatform | null {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return null;
}

/**
 * The referrer the TWA hands the first page it loads. Only ours: any Android
 * app that opens a link in Chrome (a mail client, a messenger) leaves its own
 * `android-app://` referrer, and that tab is the plain site.
 */
const TWA_REFERRER = /^android-app:\/\/fr\.ohmywind\.app(\.dev)?(\/|$)/;

export function launchedByTwa(referrer: string): boolean {
  return TWA_REFERRER.test(referrer);
}

export interface DisplaySignals {
  /** `(display-mode: standalone)`: an installed PWA, on any platform. */
  standalone: boolean;
  /** Safari's own flag for a page opened from the home screen. */
  iosStandalone: boolean;
  referrer: string;
}

/** Whether the page runs as an installed app rather than in a browser tab. */
export function runsInstalled(s: DisplaySignals): boolean {
  return s.standalone || s.iosStandalone || launchedByTwa(s.referrer);
}

function readDisplaySignals(): DisplaySignals {
  let standalone = false;
  try {
    standalone = window.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    /* no matchMedia: a browser tab as far as we can tell */
  }
  return {
    standalone,
    iosStandalone: (navigator as { standalone?: boolean }).standalone === true,
    referrer: document.referrer,
  };
}

const STORE_APP_KEY = SESSION_STORAGE_KEYS.storeApp;

/**
 * Whether this tab was opened by the TWA. The referrer is only there on the
 * first load, so the answer is kept for the tab: `sessionStorage` belongs to
 * the TWA's own tab, never to the reader's Chrome tabs.
 */
function inTwaSession(): boolean {
  const launched = launchedByTwa(document.referrer);
  try {
    if (launched) sessionStorage.setItem(STORE_APP_KEY, "1");
    return launched || sessionStorage.getItem(STORE_APP_KEY) === "1";
  } catch {
    return launched;
  }
}

/** Inside an app installed from a store: the Capacitor shell, or the TWA. */
export function inStoreApp(): boolean {
  if (typeof window === "undefined") return false;
  return isNativeShell() || inTwaSession();
}

/** In an app of any kind: a store app, or the site installed as a PWA. */
export function inInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return inStoreApp() || runsInstalled(readDisplaySignals());
}

export function currentMobilePlatform(): MobilePlatform | null {
  if (typeof navigator === "undefined") return null;
  return mobilePlatform({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 });
}
