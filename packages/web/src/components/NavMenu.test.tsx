// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { isLayerEntry } from "../hooks/useBackDismiss";
import { useRouter } from "../router";
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

describe("NavMenu, leaving the page", () => {
  // The regression, stated as the rule that prevents it. The ordering that
  // caused it (React flushing the discrete update inside the dispatch, so
  // the back-dismiss cleanup pops the layer entry before the router's own
  // document listener ever sees the click) does not reproduce under
  // `fireEvent`, which flushes at the end of `act`. What can be pinned is
  // the contract: nothing but the current page closes the menu by hand.
  it("leaves a click on another destination alone", () => {
    window.history.replaceState(null, "", "/comparer");
    render(<NavMenu variant="header" current="compare" />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));

    fireEvent.click(screen.getByRole("link", { name: /Planifier/ }));

    // Not closed by hand: the router takes it from here, and the page change
    // is what unmounts the menu.
    expect(screen.queryByRole("navigation")).toBeTruthy();
  });

  it("closes itself, and only itself, on the page one is already on", () => {
    window.history.replaceState(null, "", "/plan");
    render(<NavMenu variant="header" current="plan" />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));

    fireEvent.click(screen.getByRole("link", { name: /Planifier/ }));

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("NavMenu, under the router", () => {
  it("hands a click on another destination to the router, and stays there", () => {
    window.history.replaceState(null, "", "/comparer");
    const back = vi.spyOn(window.history, "back");
    render(<Page current="compare" />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
    fireEvent.click(screen.getByRole("link", { name: /Planifier/ }));
    fireEvent.popState(window);
    expect(window.location.pathname).toBe("/plan");
  });
});
