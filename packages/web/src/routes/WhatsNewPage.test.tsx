// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { APP_VERSION } from "../utils/version";
import { WhatsNewPage } from "./WhatsNewPage";

beforeEach(() => {
  localStorage.clear();
});

describe("WhatsNewPage", () => {
  it("lists the releases newest first, the running one marked as current", () => {
    const { container } = render(<WhatsNewPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Quoi de neuf" })).toBeTruthy();

    const cards = container.querySelectorAll("article");
    expect(cards.length).toBeGreaterThan(10);
    const current = container.querySelector(`article#v${CSS.escape(APP_VERSION)}`) as HTMLElement;
    expect(within(current).getByText("Version actuelle")).toBeTruthy();
    // The oldest release closes the list.
    expect(cards[cards.length - 1].id).toBe("v1.0.0");
  });

  it("links pull request numbers to GitHub, in a new tab", () => {
    render(<WhatsNewPage />);
    // #429, the fix outside the AROME domain, in the 1.8.0 notes.
    const link = screen.getByRole("link", { name: "#429" });
    expect(link.getAttribute("href")).toBe("https://github.com/qdonnars/ohmywind/pull/429");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("goes back, top left, to « À propos », the page it hangs from", () => {
    render(<WhatsNewPage />);
    expect(screen.getByRole("link", { name: "← À propos" }).getAttribute("href")).toBe("/a-propos");
  });

  it("clears the dot on the \"i\" by recording the version as seen", () => {
    render(<WhatsNewPage />);
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.whatsNewSeen)).toBe(APP_VERSION);
  });
});
