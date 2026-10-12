// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { aboutReturnPath } from "../config/returnPath";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { APP_VERSION } from "../utils/version";
import { InfoButton } from "./InfoButton";

const SEEN = LOCAL_STORAGE_KEYS.whatsNewSeen;

beforeEach(() => {
  window.history.replaceState(null, "", "/plan?wpts=43.29,5.37;43.00,6.20");
  localStorage.clear();
  sessionStorage.clear();
});

describe("InfoButton", () => {
  it("leads to the about page, remembering the page it was tapped from", () => {
    render(<InfoButton />);
    const link = screen.getByRole("link", { name: "À propos d'OhMyWind" });
    expect(link.getAttribute("href")).toBe("/a-propos");
    // No window to open over the map any more.
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(link);
    expect(aboutReturnPath()).toBe("/plan?wpts=43.29,5.37;43.00,6.20");
  });

  it("shows no dot on a first visit, and records the version for next time", () => {
    render(<InfoButton />);
    expect(screen.queryByTestId("whats-new-dot")).toBeNull();
    expect(localStorage.getItem(SEEN)).toBe(APP_VERSION);
  });

  it("shows the dot for a returning reader with an older version, and says so", () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.lastSpot, "{}");
    localStorage.setItem(SEEN, "0.0.1");
    render(<InfoButton />);
    expect(screen.getByTestId("whats-new-dot")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Nouvelle version/ })).toBeTruthy();
  });

  it("shows no dot once the current version has been seen", () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.lastSpot, "{}");
    localStorage.setItem(SEEN, APP_VERSION);
    render(<InfoButton />);
    expect(screen.queryByTestId("whats-new-dot")).toBeNull();
  });
});
