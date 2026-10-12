// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { rememberAboutReturnPath } from "../config/returnPath";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { APP_VERSION } from "../utils/version";
import { AboutPage } from "./AboutPage";

const SEEN = LOCAL_STORAGE_KEYS.whatsNewSeen;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("AboutPage", () => {
  it("goes back, top left, to the page whose « i » was tapped", () => {
    window.history.replaceState(null, "", "/comparer");
    rememberAboutReturnPath();
    window.history.replaceState(null, "", "/a-propos");
    render(<AboutPage />);
    expect(screen.getByRole("link", { name: "← OhMyWind" }).getAttribute("href")).toBe("/comparer");
    expect(screen.getByRole("heading", { level: 1, name: "À propos d'OhMyWind" })).toBeTruthy();
  });

  it("goes back to the map when opened directly", () => {
    render(<AboutPage />);
    expect(screen.getByRole("link", { name: "← OhMyWind" }).getAttribute("href")).toBe("/");
  });

  it("keeps its way back after a visit to its sub-page", () => {
    window.history.replaceState(null, "", "/plan");
    rememberAboutReturnPath();
    // Back from /a-propos/nouveautes: the page mounts again.
    render(<AboutPage />).unmount();
    render(<AboutPage />);
    expect(screen.getByRole("link", { name: "← OhMyWind" }).getAttribute("href")).toBe("/plan");
  });

  it("opens on « Quoi de neuf », its sub-page, with the version and the dot", () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.lastSpot, "{}");
    localStorage.setItem(SEEN, "0.0.1");
    render(<AboutPage />);
    const entry = screen.getByRole("link", { name: /Quoi de neuf/ });
    expect(entry.getAttribute("href")).toBe("/a-propos/nouveautes");
    expect(entry.textContent).toContain(`Version ${APP_VERSION}`);
    expect(entry.textContent).toContain("Nouvelle version");
    // The version is said once on the page, on that entry.
    expect(screen.getAllByText(`Version ${APP_VERSION}`)).toHaveLength(1);
  });
});
