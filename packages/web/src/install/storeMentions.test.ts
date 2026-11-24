// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { mentionsPlatform, withoutPlatformItems } from "./storeMentions";
import { STORE_URLS } from "./stores";
import { de } from "../i18n/de";
import { en } from "../i18n/en";
import { es } from "../i18n/es";
import { fr } from "../i18n/fr";
import { it as itDict } from "../i18n/it";
import { parseChangelog } from "../content/changelog";
import { PRESS_RELEASES } from "../content/press";
import changelogFr from "../../../../CHANGELOG.md?raw";
import changelogEn from "../../../../CHANGELOG.en.md?raw";
import communiqueFr from "../content/communique.md?raw";
import communiqueEn from "../content/communique.en.md?raw";
import communiqueDe from "../content/communique.de.md?raw";
import communiqueIt from "../content/communique.it.md?raw";
import communiqueEs from "../content/communique.es.md?raw";
import conditionsFr from "../content/conditions.md?raw";
import conditionsEn from "../content/conditions.en.md?raw";
import conditionsDe from "../content/conditions.de.md?raw";
import conditionsIt from "../content/conditions.it.md?raw";
import conditionsEs from "../content/conditions.es.md?raw";
import confidentialiteFr from "../content/confidentialite.md?raw";
import confidentialiteEn from "../content/confidentialite.en.md?raw";
import confidentialiteDe from "../content/confidentialite.de.md?raw";
import confidentialiteIt from "../content/confidentialite.it.md?raw";
import confidentialiteEs from "../content/confidentialite.es.md?raw";
import methodologieFr from "../content/methodologie.md?raw";
import methodologieEn from "../content/methodologie.en.md?raw";
import courantsFr from "../content/methodologie-courants.md?raw";
import courantsEn from "../content/methodologie-courants.en.md?raw";

const COMMUNIQUES = { fr: communiqueFr, en: communiqueEn, de: communiqueDe, it: communiqueIt, es: communiqueEs };

describe("mentionsPlatform", () => {
  it.each([
    "Sur Android, via le Google Play Store",
    "the iPhone properly framed",
    "L'icône sur iOS est nette",
    "[lien](https://play.google.com/store/apps/details?id=x)",
    "https://apps.apple.com/app/id1",
    "Download on the App Store",
  ])("finds « %s »", (text) => {
    expect(mentionsPlatform(text)).toBe(true);
  });

  it.each([
    "Les applications mobiles sont distribuées dans les boutiques d'applications",
    "TWA 40°, angle au vent",
    // "ios" only as a word: never inside one.
    "los servicios y los escenarios",
  ])("leaves « %s » alone", (text) => {
    expect(mentionsPlatform(text)).toBe(false);
  });
});

describe("withoutPlatformItems", () => {
  it("drops a whole list item, continuation lines included, and keeps the rest", () => {
    const md = [
      "- Sur le web : [ohmywind.fr](/)",
      "- Sur Android, via le",
      "  [Google Play Store](https://play.google.com/x)",
      "- En cinq langues",
      "",
      "Un paragraphe.",
    ].join("\n");
    expect(withoutPlatformItems(md)).toBe(
      ["- Sur le web : [ohmywind.fr](/)", "- En cinq langues", "", "Un paragraphe."].join("\n"),
    );
  });

  it("drops a heading left with nothing under it", () => {
    const md = ["### Corrections", "", "- Un correctif.", "", "### Coulisses", "", "- Sur Android, un réglage."].join(
      "\n",
    );
    expect(withoutPlatformItems(md)).toBe(["### Corrections", "", "- Un correctif."].join("\n"));
  });

  it("leaves Markdown without a platform untouched", () => {
    const md = "## Titre\n\n- Un\n- Deux\n\nTexte.";
    expect(withoutPlatformItems(md)).toBe(md);
  });
});

describe("the press release inside the apps", () => {
  it.each(Object.entries(COMMUNIQUES))("%s: the store links go, nothing else of the platform is left", (_lang, md) => {
    expect(md).toContain(STORE_URLS.android);
    const inApp = withoutPlatformItems(md);
    expect(mentionsPlatform(inApp)).toBe(false);
    // Only the lines that had to go: the other links of the lists stay.
    expect(inApp).toContain("mcp.ohmywind.fr");
    expect(md.split("\n").length - inApp.split("\n").length).toBe(2);
  });

  it("links the Play page through the one source of the store links", () => {
    for (const md of Object.values(COMMUNIQUES)) {
      const playLinks = [...md.matchAll(/\((https:\/\/play\.google\.com[^)]*)\)/g)].map((m) => m[1]);
      expect(playLinks.length).toBeGreaterThan(0);
      for (const url of playLinks) expect(url).toBe(STORE_URLS.android);
    }
  });

  it.each(Object.entries(PRESS_RELEASES))("%s: a lead naming a platform has a neutral twin", (_lang, release) => {
    if (mentionsPlatform(release.lead)) expect(release.leadInApps).toBeDefined();
    if (release.leadInApps) expect(mentionsPlatform(release.leadInApps)).toBe(false);
    for (const text of [release.title, release.dateline]) expect(mentionsPlatform(text)).toBe(false);
  });
});

describe("the release notes inside the apps", () => {
  it.each([
    ["fr", changelogFr],
    ["en", changelogEn],
  ])("%s: no title names a platform, and the filtered notes name none", (_lang, md) => {
    const releases = parseChangelog(md);
    for (const r of releases) {
      expect(mentionsPlatform(r.title), r.version).toBe(false);
      expect(mentionsPlatform(withoutPlatformItems(r.body)), r.version).toBe(false);
    }
  });

  it("drops a list emptied by the filter, heading and all", () => {
    const v102 = parseChangelog(changelogFr).find((r) => r.version === "1.0.2");
    expect(v102?.body).toContain("### Coulisses");
    expect(withoutPlatformItems(v102!.body)).not.toContain("### Coulisses");
  });
});

describe("texts the apps show as they are", () => {
  it.each([
    ["conditions.md", conditionsFr],
    ["conditions.en.md", conditionsEn],
    ["conditions.de.md", conditionsDe],
    ["conditions.it.md", conditionsIt],
    ["conditions.es.md", conditionsEs],
    ["confidentialite.md", confidentialiteFr],
    ["confidentialite.en.md", confidentialiteEn],
    ["confidentialite.de.md", confidentialiteDe],
    ["confidentialite.it.md", confidentialiteIt],
    ["confidentialite.es.md", confidentialiteEs],
    ["methodologie.md", methodologieFr],
    ["methodologie.en.md", methodologieEn],
    ["methodologie-courants.md", courantsFr],
    ["methodologie-courants.en.md", courantsEn],
  ])("%s names no platform or store", (_file, md) => {
    expect(mentionsPlatform(md)).toBe(false);
  });

  it.each([
    ["fr", fr],
    ["en", en],
    ["de", de],
    ["it", itDict],
    ["es", es],
  ])("%s: no interface string names one, but the store buttons of the invitation", (_lang, dict) => {
    // The invitation is shown on the site only (see InstallInvite.tsx), and
    // its buttons say where they lead.
    const shownInApps = Object.entries(dict).filter(([key]) => !key.startsWith("common.install.open."));
    for (const [key, value] of shownInApps) expect(mentionsPlatform(value), key).toBe(false);
  });
});
