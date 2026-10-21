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

  it("points to every way in: app, Play Store, MCP tutorial and endpoint, videos, code", () => {
    render(<PressReleasePage />);
    for (const href of [
      "/plan",
      "/methodologie/courants",
      "https://play.google.com/store/apps/details?id=fr.ohmywind.app",
      "https://mcp.ohmywind.fr",
      "https://ohmywind.fr/youtube",
      "https://github.com/qdonnars/ohmywind#try-it-in-30-seconds",
      "https://github.com/qdonnars/ohmywind",
      "mailto:contact@ohmywind.fr",
    ]) {
      expect(linkTo(href)).toBeDefined();
    }
    expect(screen.getAllByText("https://mcp.ohmywind.fr/mcp").length).toBeGreaterThan(0);
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
    const copy = [PRESS_RELEASE.title, PRESS_RELEASE.lead, releaseBody].join("\n");
    expect(copy).not.toContain("—");
    expect(copy).not.toMatch(/sans pub/i);
  });
});
