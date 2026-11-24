// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hideSettings, isSettingsOpen } from "../settings/settingsStore";
import { MapTopBar } from "./MapTopBar";

vi.mock("../api/geocoding", () => ({ searchPlaces: vi.fn().mockResolvedValue([]) }));

/** jsdom has no matchMedia: a screen wide enough for lg, or not. */
function screenIsWide(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide && query.includes("min-width"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  act(() => hideSettings());
  vi.unstubAllGlobals();
});

function mount() {
  render(<MapTopBar current="explore" mapQuery="" onSelectSpot={vi.fn()} savedSpots={[]} />);
}

describe("MapTopBar", () => {
  it.each([
    ["a phone", false],
    ["a wide screen", true],
  ])("on %s: one menu, the search and the settings, which open over the page", (_, wide) => {
    screenIsWide(wide);
    mount();
    expect(screen.getAllByRole("button", { name: "Ouvrir le menu" })).toHaveLength(1);
    if (wide) {
      // The field itself, with its suggestions under it.
      expect(screen.getByRole("combobox", { name: "Rechercher un lieu" })).toBeTruthy();
    } else {
      // A way into the search over the whole screen.
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(screen.getByRole("button", { name: /Rechercher un lieu/ }).getAttribute("aria-haspopup")).toBe("dialog");
    }
    const settings = screen.getByRole("button", { name: "Réglages" });
    fireEvent.click(settings);
    expect(isSettingsOpen()).toBe(true);
  });

  it("carries no logo, no « i » and no theme switch", () => {
    screenIsWide(true);
    mount();
    expect(screen.queryByText("OhMy")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: /thème/ })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
