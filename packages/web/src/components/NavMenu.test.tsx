// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NavMenu } from "./NavMenu";

/** jsdom starts every file at the same URL; the menu pushes a history entry
    while open, so reset between cases. */
beforeEach(() => {
  window.history.replaceState(null, "", "/plan");
});

describe("NavMenu", () => {
  it("is one control at rest, and lists the three destinations once open", () => {
    render(<NavMenu variant="map" current="plan" mapQuery="?center=43.30000,5.35000&zoom=9" />);
    expect(screen.queryByRole("navigation")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));

    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "ExplorerLa carte et la météo du spot",
      "PlanifierSimuler une route, comparer les fenêtres",
      "Comparer mes spotsMes favoris côte à côte",
    ]);
    // The camera travels with the two map pages, not with the comparison.
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/?center=43.30000,5.35000&zoom=9",
      "/plan?center=43.30000,5.35000&zoom=9",
      "/comparer",
    ]);
  });

  it("marks the current destination, and only it", () => {
    render(<NavMenu variant="header" current="compare" />);
    fireEvent.click(screen.getByRole("button"));
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, null, "page"]);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on Escape, on a click outside, and on picking an entry", () => {
    render(<NavMenu variant="map" current="explore" />);
    const trigger = screen.getByRole("button");

    fireEvent.click(trigger);
    expect(screen.getByRole("navigation")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("navigation").parentElement!.previousElementSibling!);
    expect(screen.queryByRole("navigation")).toBeNull();

    fireEvent.click(trigger);
    // Re-picking the page one is on: the router ignores the click, the
    // menu must still close.
    fireEvent.click(screen.getByRole("link", { name: /Explorer/ }));
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
