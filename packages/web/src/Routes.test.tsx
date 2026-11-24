// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";

// The pages pull Leaflet, MapLibre and the network: stood in for by a mark
// that counts its mounts, which is all the routing has to answer for.
const mounts = vi.hoisted(() => ({ explore: 0 }));
vi.mock("./App", () => ({
  default: function Explore() {
    useEffect(() => {
      mounts.explore += 1;
    }, []);
    return <p>explorer</p>;
  },
}));
vi.mock("./routes/PlanPage", () => ({ PlanPage: () => <p>plan</p> }));
vi.mock("./routes/ComparePage", () => ({ ComparePage: () => <p>comparer</p> }));
vi.mock("./routes/PressPage", () => ({ PressPage: () => <p>presse</p> }));
// The router pings the service worker on every navigation (same seam as
// `router.test.tsx`).
vi.mock("./sw", () => ({
  checkForAppUpdate: vi.fn(),
  flushPendingUpdate: vi.fn(),
}));

import { Routes } from "./Routes";
import { isSettingsOpen, hideSettings } from "./settings/settingsStore";

beforeEach(() => {
  mounts.explore = 0;
});

afterEach(async () => {
  act(() => hideSettings());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  window.history.replaceState(null, "", "/");
});

describe("/config", () => {
  it("opens the explorer with the settings over it, at the explorer's address", () => {
    window.history.replaceState(null, "", "/config");
    render(<Routes />);
    expect(screen.getByText("explorer")).toBeTruthy();
    expect(isSettingsOpen()).toBe(true);
    // Rewritten in place, not stacked: back from there leaves the app, as
    // from any page opened directly.
    expect(window.location.pathname).toBe("/");
    // And the rewrite did not remount the page the settings were opened on.
    expect(mounts.explore).toBe(1);
  });

  it("leaves the settings closed on the explorer itself", () => {
    window.history.replaceState(null, "", "/");
    render(<Routes />);
    expect(screen.getByText("explorer")).toBeTruthy();
    expect(isSettingsOpen()).toBe(false);
  });
});
