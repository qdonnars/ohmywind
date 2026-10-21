// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PressReleasePage } from "./PressReleasePage";
import { PRESS_RELEASES } from "../content/press";
import { AVAILABLE_LANGS, type Lang } from "../i18n";
import { setLang } from "../i18n/store";
import bodyFr from "../content/communique.md?raw";
import bodyEn from "../content/communique.en.md?raw";
import bodyDe from "../content/communique.de.md?raw";
import bodyIt from "../content/communique.it.md?raw";
import bodyEs from "../content/communique.es.md?raw";

const BODIES: Record<Lang, string> = { fr: bodyFr, en: bodyEn, de: bodyDe, it: bodyIt, es: bodyEs };

/** Every way in a journalist may want to follow, in every language. */
const LINKS = [
  "/plan",
  "/comparer",
  "/methodologie",
  "/methodologie/courants",
  "/a-propos/nouveautes",
  "/presse",
  "https://play.google.com/store/apps/details?id=fr.ohmywind.app",
  "https://mcp.ohmywind.fr",
  "https://github.com/qdonnars/ohmywind#try-it-in-30-seconds",
  "https://github.com/qdonnars/ohmywind",
  "https://www.parisnauticshow.com/cap-innovation/",
  "mailto:contact@ohmywind.fr",
];

/** "Ad-free" in the five languages: the copy may not promise it. */
const NO_ADS = /sans pub|ad-free|no ads|werbefrei|ohne werbung|senza pubblicit|sin publicidad/i;

function linkTo(href: string): HTMLAnchorElement {
  const link = document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
  if (!link) throw new Error(`no link to ${href}`);
  return link;
}

afterEach(async () => {
  cleanup();
  await setLang("fr");
});

describe.each(AVAILABLE_LANGS)("PressReleasePage in %s", (lang) => {
  const release = PRESS_RELEASES[lang];

  it("heads the page with that language's title and highlight", async () => {
    await setLang(lang);
    render(<PressReleasePage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(release.title);
    if (release.highlight) {
      const box = screen.getByRole("complementary", { name: release.highlight.title });
      expect(box.textContent).toContain(release.highlight.body);
    }
  });

  it("points to every way in, outbound links in a new tab", async () => {
    await setLang(lang);
    render(<PressReleasePage />);
    for (const href of LINKS) expect(linkTo(href)).toBeDefined();
    expect(screen.getAllByText("https://mcp.ohmywind.fr/mcp").length).toBeGreaterThan(0);
    expect(linkTo("https://mcp.ohmywind.fr").getAttribute("target")).toBe("_blank");
    expect(linkTo("https://mcp.ohmywind.fr").getAttribute("rel")).toBe("noreferrer");
    expect(linkTo("/plan").hasAttribute("target")).toBe(false);
    expect(linkTo("mailto:contact@ohmywind.fr").hasAttribute("target")).toBe(false);
  });

  it("keeps the copy free of em-dashes and of any no-ads promise", () => {
    const { highlight } = release;
    const copy = [release.title, release.lead, highlight?.title, highlight?.body, BODIES[lang]].join("\n");
    expect(copy).not.toContain("—");
    expect(copy).not.toMatch(NO_ADS);
  });
});

describe("press release translations", () => {
  it("carry the same sections as the French reference", () => {
    const headings = (md: string) => md.match(/^## /gm)?.length ?? 0;
    for (const lang of AVAILABLE_LANGS) {
      expect(headings(BODIES[lang]), lang).toBe(headings(bodyFr));
    }
  });
});
