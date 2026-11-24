// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import aasaRaw from "../../public/.well-known/apple-app-site-association?raw";
import headersRaw from "../../public/_headers?raw";
import androidManifestRaw from "../../../mobile/android/app/src/main/AndroidManifest.xml?raw";
import { matchRoute } from "../routeTable";
import { TRANSFER_PATH } from "./bridgeUrl";

/**
 * Which links to the site open the app instead of the browser: the same
 * pages on iOS (apple-app-site-association, served by the site) and on
 * Android (the https intent filter of the shell's manifest). The two files
 * live in two packages; this test keeps them saying the same thing, and
 * keeps /transfert out of both: that page has to run in the browser, where
 * the former app's data is.
 */

interface AasaComponent {
  "/": string;
  exclude?: boolean;
}

const aasa = JSON.parse(aasaRaw) as {
  applinks: { details: { appIDs: string[]; components: AasaComponent[] }[] };
};

/** The pages of the app itself, and nothing else. */
const APP_PAGES = ["/", "/plan", "/comparer", "/config"];

function aasaClaimed(): string[] {
  return aasa.applinks.details.flatMap((d) => d.components.filter((c) => !c.exclude).map((c) => c["/"]));
}

function androidClaimed(): string[] {
  const filter = androidManifestRaw
    .split("<intent-filter")
    .find((block) => block.includes('android:autoVerify="true"'));
  if (!filter) return [];
  return [...filter.matchAll(/android:path="([^"]+)"/g)].map((m) => m[1]);
}

describe("links that open the app", () => {
  it("claim the same pages on iOS and Android", () => {
    expect(aasaClaimed().sort()).toEqual([...APP_PAGES].sort());
    expect(androidClaimed().sort()).toEqual([...APP_PAGES].sort());
  });

  it("only claim pages the app routes", () => {
    for (const path of APP_PAGES) expect(matchRoute(path)).not.toBe("not-found");
  });

  it("never claim the transfer page", () => {
    expect(aasaClaimed()).not.toContain(TRANSFER_PATH);
    expect(androidClaimed()).not.toContain(TRANSFER_PATH);
    const excluded = aasa.applinks.details.flatMap((d) => d.components.filter((c) => c.exclude).map((c) => c["/"]));
    expect(excluded).toContain(TRANSFER_PATH);
    // Apple reads the components in order: an exclusion after a pattern
    // that matches would never apply.
    for (const d of aasa.applinks.details) {
      const firstClaim = d.components.findIndex((c) => !c.exclude);
      const lastExclusion = d.components.map((c) => !!c.exclude).lastIndexOf(true);
      expect(lastExclusion).toBeLessThan(firstClaim);
    }
  });

  it("name both iOS apps of the team", () => {
    expect(aasa.applinks.details.flatMap((d) => d.appIDs).sort()).toEqual([
      "Z2M67M742P.fr.ohmywind.app",
      "Z2M67M742P.fr.ohmywind.app.dev",
    ]);
  });

  it("serve the iOS file as JSON", () => {
    const block = headersRaw.split(/\n(?=\S)/).find((b) => b.startsWith("/.well-known/apple-app-site-association\n"));
    expect(block).toBeDefined();
    expect(block).toMatch(/^\s+Content-Type: application\/json$/m);
  });

  it("put the Android filter on the variant's host, verified", () => {
    const filter = androidManifestRaw.split("<intent-filter").find((b) => b.includes('android:autoVerify="true"'));
    expect(filter).toContain('android:host="${shellLinkHost}"');
    expect(filter).toContain('android:scheme="${shellLinkScheme}"');
    expect(filter).toContain("android.intent.category.BROWSABLE");
  });
});
