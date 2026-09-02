// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import webManifestRaw from "../public/manifest.json?raw";
import twaProdRaw from "../../android/twa-manifest.json?raw";
import twaDevRaw from "../../android-dev/twa-manifest.json?raw";
// Imported for their side effect on this test: resolution fails if the file
// is not in public/, which is exactly the breakage we are guarding against.
import planIconUrl from "../public/shortcut-plan-192.png?url";
import configIconUrl from "../public/shortcut-config-192.png?url";

/**
 * The web manifest's shortcuts are also the Android app's shortcuts: they are
 * mirrored into each flavour's `twa-manifest.json`, and Bubblewrap downloads
 * every `chosenIconUrl` from the live site while building the bundle. A missing
 * field or an icon that is not deployed breaks the release build months after
 * the commit that caused it, so the contract is pinned here.
 */

interface WebShortcut {
  name: string;
  short_name: string;
  url: string;
  icons: { src: string; sizes: string }[];
}

interface TwaShortcut {
  name: string;
  shortName: string;
  url: string;
  chosenIconUrl: string;
}

const webManifest = JSON.parse(webManifestRaw) as { shortcuts: WebShortcut[] };
const shortcuts = webManifest.shortcuts;
/** Basenames of the icon files that actually exist, per the imports above. */
const onDisk = [planIconUrl, configIconUrl].map((url) => url.split("/").pop());

describe("web manifest shortcuts", () => {
  it("declares the two long-press entries", () => {
    expect(shortcuts.map((s) => s.url)).toEqual(["/plan", "/config"]);
  });

  it("carries every field Bubblewrap requires", () => {
    for (const shortcut of shortcuts) {
      expect(shortcut.name).toBeTruthy();
      expect(shortcut.short_name).toBeTruthy();
      // The launcher truncates the label past roughly ten characters.
      expect(shortcut.short_name.length).toBeLessThanOrEqual(12);
      expect(shortcut.url.startsWith("/")).toBe(true);
      expect(shortcut.icons.length).toBeGreaterThan(0);
    }
  });

  it("ships an icon of at least 96 px, the Bubblewrap floor", () => {
    for (const shortcut of shortcuts) {
      const sizes = shortcut.icons.map((i) => Number.parseInt(i.sizes.split("x")[0], 10));
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(96);
    }
  });

  it("points at files the site actually serves", () => {
    for (const shortcut of shortcuts) {
      for (const icon of shortcut.icons) {
        expect(onDisk).toContain(icon.src.replace(/^\//, ""));
      }
    }
  });
});

describe.each([
  ["prod", twaProdRaw, "ohmywind.fr"],
  ["dev", twaDevRaw, "dev.ohmywind.fr"],
])("%s TWA manifest", (_flavour, raw, host) => {
  const twa = JSON.parse(raw) as {
    shortcuts: TwaShortcut[];
    appVersion: string;
    appVersionName: string;
  };

  it("mirrors the web manifest onto its own host", () => {
    expect(twa.shortcuts.map((s) => s.name)).toEqual(shortcuts.map((s) => s.name));
    expect(twa.shortcuts.map((s) => s.url)).toEqual(
      shortcuts.map((s) => `https://${host}${s.url}`),
    );
    expect(twa.shortcuts.map((s) => s.chosenIconUrl)).toEqual(
      shortcuts.map((s) => `https://${host}${s.icons[0].src}`),
    );
  });

  it("keeps the displayed version and the build version in step", () => {
    // Seed: 1.0.1 nearly shipped labelled 1.0.0 because only one of the two was
    // bumped. Bubblewrap reads `appVersion` for the bundle's versionName.
    expect(twa.appVersion).toBe(twa.appVersionName);
  });
});
