// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { launchedByTwa, mobilePlatform, runsInstalled } from "./platform";

const UA = {
  androidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ipadMobileSite:
    "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  // iPadOS, and a Mac: the same string.
  macintosh:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
};

describe("mobilePlatform", () => {
  it("recognises Android phones and tablets, whatever the browser", () => {
    expect(mobilePlatform({ userAgent: UA.androidPhone, maxTouchPoints: 5 })).toBe("android");
    expect(mobilePlatform({ userAgent: UA.androidTablet, maxTouchPoints: 10 })).toBe("android");
    expect(mobilePlatform({ userAgent: UA.firefoxAndroid, maxTouchPoints: 5 })).toBe("android");
  });

  it("recognises the iPhone and the iPad", () => {
    expect(mobilePlatform({ userAgent: UA.iphone, maxTouchPoints: 5 })).toBe("ios");
    expect(mobilePlatform({ userAgent: UA.ipadMobileSite, maxTouchPoints: 5 })).toBe("ios");
  });

  it("tells an iPad asking for the desktop site from a Mac by its touch screen", () => {
    expect(mobilePlatform({ userAgent: UA.macintosh, maxTouchPoints: 5 })).toBe("ios");
    expect(mobilePlatform({ userAgent: UA.macintosh, maxTouchPoints: 0 })).toBeNull();
    // Some Macs report a single touch point for a trackpad: still a Mac.
    expect(mobilePlatform({ userAgent: UA.macintosh, maxTouchPoints: 1 })).toBeNull();
  });

  it("returns null on a computer, touch screen or not", () => {
    expect(mobilePlatform({ userAgent: UA.windows, maxTouchPoints: 10 })).toBeNull();
    expect(mobilePlatform({ userAgent: UA.linux, maxTouchPoints: 0 })).toBeNull();
  });
});

describe("launchedByTwa", () => {
  it("knows the TWA by its own package, production and dev", () => {
    expect(launchedByTwa("android-app://fr.ohmywind.app/")).toBe(true);
    expect(launchedByTwa("android-app://fr.ohmywind.app")).toBe(true);
    expect(launchedByTwa("android-app://fr.ohmywind.app.dev/")).toBe(true);
  });

  it("ignores another app that opened a link in Chrome", () => {
    expect(launchedByTwa("android-app://com.google.android.gm/")).toBe(false);
    expect(launchedByTwa("android-app://fr.ohmywind.application/")).toBe(false);
    expect(launchedByTwa("https://ohmywind.fr/")).toBe(false);
    expect(launchedByTwa("")).toBe(false);
  });
});

describe("runsInstalled", () => {
  const tab = { standalone: false, iosStandalone: false, referrer: "" };

  it("is false in a browser tab", () => {
    expect(runsInstalled(tab)).toBe(false);
    expect(runsInstalled({ ...tab, referrer: "https://www.google.com/" })).toBe(false);
  });

  it("is true for an installed PWA, on Android or from Safari's home screen", () => {
    expect(runsInstalled({ ...tab, standalone: true })).toBe(true);
    expect(runsInstalled({ ...tab, iosStandalone: true })).toBe(true);
  });

  it("is true in the TWA", () => {
    expect(runsInstalled({ ...tab, referrer: "android-app://fr.ohmywind.app/" })).toBe(true);
  });
});
