// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { aboutReturnPath } from "../config/returnPath";
import { isLayerEntry } from "../hooks/useBackDismiss";
import { useRouter } from "../router";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { hideSettings, isSettingsOpen } from "../settings/settingsStore";
import { NavMenu } from "./NavMenu";

// The router pings the service worker on every navigation; that module
// registers a worker and imports a virtual one, neither of which belongs in a
// menu test (same seam as `router.test.tsx`).
vi.mock("../sw", () => ({
  checkForAppUpdate: vi.fn(),
  flushPendingUpdate: vi.fn(),
}));

/** The menu as a page mounts it: under the router that listens for clicks. */
function Page({ current }: { current: "explore" | "plan" | "compare" }) {
  const { path } = useRouter();
  return (
    <>
      <span data-testid="path">{path}</span>
      <NavMenu variant="header" current={current} />
    </>
  );
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));

/** jsdom starts every file at the same URL; the drawer pushes a history
    entry while open, so reset between cases. */
beforeEach(() => {
  window.history.replaceState(null, "", "/plan");
  localStorage.clear();
  sessionStorage.clear();
});

describe("NavMenu", () => {
  it("is one control at rest, and opens a modal drawer with the destinations, then the pages around them", () => {
    render(<NavMenu variant="map" current="plan" mapQuery="?center=43.30000,5.35000&zoom=9" />);
    expect(screen.queryByRole("dialog")).toBeNull();

    open();

    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "ExplorerLa carte et la météo du spot",
      "PlanifierSimuler une route, comparer les fenêtres",
      "Comparer mes spotsMes favoris côte à côte",
      "Quoi de neuf",
      "Méthodologie",
      "À propos",
    ]);
    // The camera travels with the two map pages, not with the comparison.
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/?center=43.30000,5.35000&zoom=9",
      "/plan?center=43.30000,5.35000&zoom=9",
      "/comparer",
      "/a-propos/nouveautes",
      "/methodologie",
      "/a-propos",
    ]);
    // Settings are an action, not a link: the entry will open them over the page.
    expect(screen.getByRole("button", { name: "Réglages" })).toBeTruthy();
    expect(dialog.textContent).toContain("Prévisions Open-Meteo (CC BY 4.0)");
  });

  it("marks the current destination, and only it", () => {
    render(<NavMenu variant="header" current="compare" />);
    open();
    const links = screen.getAllByRole("link").slice(0, 3);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, null, "page"]);
    expect(screen.getByRole("button", { name: "Ouvrir le menu" }).getAttribute("aria-expanded")).toBe("true");
    // Keyboard readers land on it.
    expect(document.activeElement).toBe(links[2]);
  });

  it("closes on Escape, on the scrim, on the cross and on the current entry, focus back on the trigger", () => {
    render(<NavMenu variant="map" current="explore" />);
    const trigger = screen.getByRole("button", { name: "Ouvrir le menu" });

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId("nav-scrim"));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Fermer le menu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    // Re-picking the page one is on: the router ignores the click, the
    // drawer must still close.
    fireEvent.click(screen.getByRole("link", { name: /Explorer/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the focus inside the drawer", () => {
    render(<NavMenu variant="header" current="explore" />);
    open();
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "Fermer le menu" });
    const about = screen.getByRole("link", { name: "À propos" });

    about.focus();
    fireEvent.keyDown(about, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(about);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("carries the release dot on « Quoi de neuf » for a returning reader", () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.lastSpot, "{}");
    localStorage.setItem(LOCAL_STORAGE_KEYS.whatsNewSeen, "0.0.1");
    render(<NavMenu variant="header" current="plan" />);
    open();
    expect(screen.getByTestId("whats-new-dot")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Quoi de neuf.*Nouvelle version/ })).toBeTruthy();
  });

  it("shows no dot once the current version has been seen", () => {
    render(<NavMenu variant="header" current="plan" />);
    open();
    expect(screen.queryByTestId("whats-new-dot")).toBeNull();
  });
});

describe("NavMenu, leaving the page", () => {
  // The regression, stated as the rule that prevents it. The ordering that
  // caused it (React flushing the discrete update inside the dispatch, so
  // the back-dismiss cleanup pops the layer entry before the router's own
  // document listener ever sees the click) does not reproduce under
  // `fireEvent`, which flushes at the end of `act`. What can be pinned is
  // the contract: no link but the current page closes the drawer by hand.
  it("leaves a click on another destination alone", () => {
    window.history.replaceState(null, "", "/comparer");
    render(<NavMenu variant="header" current="compare" />);
    open();

    fireEvent.click(screen.getByRole("link", { name: /Planifier/ }));

    // Not closed by hand: the router takes it from here, and the page change
    // is what unmounts the drawer.
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("leaves a click on the pages around them alone too", () => {
    render(<NavMenu variant="header" current="plan" />);
    for (const name of ["Quoi de neuf", "Méthodologie", "À propos"]) {
      if (!screen.queryByRole("dialog")) open();
      fireEvent.click(screen.getByRole("link", { name }));
      expect(screen.queryByRole("dialog")).toBeTruthy();
    }
  });

  it("remembers the page for the way back from « À propos » and « Quoi de neuf »", () => {
    window.history.replaceState(null, "", "/plan?wpts=43.29,5.37;43.00,6.20");
    render(<NavMenu variant="header" current="plan" />);
    open();
    fireEvent.click(screen.getByRole("link", { name: "À propos" }));
    expect(aboutReturnPath()).toBe("/plan?wpts=43.29,5.37;43.00,6.20");

    sessionStorage.clear();
    fireEvent.click(screen.getByRole("link", { name: "Quoi de neuf" }));
    expect(aboutReturnPath()).toBe("/plan?wpts=43.29,5.37;43.00,6.20");
  });

  it("closes itself, and only itself, on the page one is already on", () => {
    render(<NavMenu variant="header" current="plan" />);
    open();

    fireEvent.click(screen.getByRole("link", { name: /Planifier/ }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("NavMenu, under the router", () => {
  it("hands a click on another destination to the router, and stays there", () => {
    window.history.replaceState(null, "", "/comparer");
    const back = vi.spyOn(window.history, "back");
    render(<Page current="compare" />);
    open();
    fireEvent.click(screen.getByRole("link", { name: /Planifier/ }));

    expect(window.location.pathname).toBe("/plan");
    expect(screen.getByTestId("path").textContent).toBe("/plan");
    // The heart of it. Closing the menu from the link ran the back-dismiss
    // cleanup inside React's own dispatch, while the layer entry was still
    // the current one, so the stack asked for a `history.back()`. The router
    // then replaced the URL and the pending pop undid the navigation. The
    // link must reach the router with no pop pending behind it.
    expect(back).not.toHaveBeenCalled();
    expect(isLayerEntry(window.history.state)).toBe(false);
    fireEvent.popState(window);
    expect(window.location.pathname).toBe("/plan");
    back.mockRestore();
  });

  it("keeps the reader on the page it navigated to", () => {
    window.history.replaceState(null, "", "/comparer");
    render(<Page current="compare" />);
    open();
    fireEvent.click(screen.getByRole("link", { name: /Planifier/ }));
    fireEvent.popState(window);
    expect(window.location.pathname).toBe("/plan");
  });

  it("opens the settings from « Réglages », without leaving the page", () => {
    window.history.replaceState(null, "", "/comparer");
    render(<Page current="compare" />);
    open();
    expect(isSettingsOpen()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Réglages" }));

    // The settings are a sheet over the page, not a page of their own: the
    // drawer closes in the same click and the address does not move.
    expect(isSettingsOpen()).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("path").textContent).toBe("/comparer");
    hideSettings();
  });
});
