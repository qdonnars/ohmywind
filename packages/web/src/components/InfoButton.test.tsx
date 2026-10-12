// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { APP_VERSION } from "../utils/version";
import { InfoButton } from "./InfoButton";

const SEEN = LOCAL_STORAGE_KEYS.whatsNewSeen;

beforeEach(() => {
  window.history.replaceState(null, "", "/plan");
  localStorage.clear();
});

describe("InfoButton, the release log", () => {
  it("opens on the « Quoi de neuf » entry with the version the app runs", () => {
    render(<InfoButton />);
    fireEvent.click(screen.getByRole("button", { name: "À propos d'OhMyWind" }));
    const entry = screen.getByRole("link", { name: /Quoi de neuf/ });
    expect(entry.getAttribute("href")).toBe("/nouveautes");
    expect(entry.textContent).toContain(`Version ${APP_VERSION}`);
    // The version is said once in the panel, on that entry.
    expect(screen.getAllByText(`Version ${APP_VERSION}`)).toHaveLength(1);
  });

  it("shows no dot on a first visit, and records the version for next time", () => {
    render(<InfoButton />);
    expect(screen.queryByTestId("whats-new-dot")).toBeNull();
    expect(localStorage.getItem(SEEN)).toBe(APP_VERSION);
  });

  it("shows the dot on the button and on the entry for a returning reader with an older version", () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.lastSpot, "{}");
    localStorage.setItem(SEEN, "0.0.1");
    render(<InfoButton />);
    expect(screen.getByTestId("whats-new-dot")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Nouvelle version/ }));
    expect(screen.getByRole("link", { name: /Quoi de neuf/ }).textContent).toContain("Nouvelle version");
    // Reading the panel is not reading the page: the version stays unseen.
    expect(localStorage.getItem(SEEN)).toBe("0.0.1");
  });

  it("shows no dot once the current version has been seen", () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.lastSpot, "{}");
    localStorage.setItem(SEEN, APP_VERSION);
    render(<InfoButton />);
    expect(screen.queryByTestId("whats-new-dot")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("link", { name: /Quoi de neuf/ }).textContent).not.toContain("Nouvelle version");
  });
});
