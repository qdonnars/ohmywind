// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PressReleasePage } from "./PressReleasePage";
import { PRESS_RELEASE } from "../content/press";
import releaseBody from "../content/communique.md?raw";

function linkTo(href: string): HTMLAnchorElement {
  const link = document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
  if (!link) throw new Error(`no link to ${href}`);
  return link;
}

describe("PressReleasePage", () => {
  it("heads the page with the release's title, marked as French", () => {
    render(<PressReleasePage />);
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.textContent).toBe(PRESS_RELEASE.title);
    expect(title.closest("article")?.getAttribute("lang")).toBe("fr");
  });

  it("points to every way in: app, Play Store, MCP tutorial and endpoint, code", () => {
    render(<PressReleasePage />);
    for (const href of [
      "/plan",
      "/methodologie/courants",
      "https://play.google.com/store/apps/details?id=fr.ohmywind.app",
      "https://mcp.ohmywind.fr",
      "https://github.com/qdonnars/ohmywind#try-it-in-30-seconds",
      "https://github.com/qdonnars/ohmywind",
      "mailto:contact@ohmywind.fr",
      "/a-propos/nouveautes",
      "https://www.parisnauticshow.com/cap-innovation/",
    ]) {
      expect(linkTo(href)).toBeDefined();
    }
    expect(screen.getAllByText("https://mcp.ohmywind.fr/mcp").length).toBeGreaterThan(0);
  });

  it("sets the highlight apart under the lead, as its own landmark", () => {
    render(<PressReleasePage />);
    const highlight = PRESS_RELEASE.highlight;
    if (!highlight) return;
    const box = screen.getByRole("complementary", { name: highlight.title });
    expect(box.textContent).toContain(highlight.body);
  });

  it("opens outbound links in a new tab and keeps in-app ones in place", () => {
    render(<PressReleasePage />);
    const outbound = linkTo("https://mcp.ohmywind.fr");
    expect(outbound.getAttribute("target")).toBe("_blank");
    expect(outbound.getAttribute("rel")).toBe("noreferrer");
    expect(linkTo("/plan").hasAttribute("target")).toBe(false);
    expect(linkTo("mailto:contact@ohmywind.fr").hasAttribute("target")).toBe(false);
  });

  it("keeps the copy free of em-dashes and of any no-ads promise", () => {
    const { highlight } = PRESS_RELEASE;
    const copy = [
      PRESS_RELEASE.title,
      PRESS_RELEASE.lead,
      highlight?.title,
      highlight?.body,
      releaseBody,
    ].join("\n");
    expect(copy).not.toContain("—");
    expect(copy).not.toMatch(/sans pub/i);
  });
});
