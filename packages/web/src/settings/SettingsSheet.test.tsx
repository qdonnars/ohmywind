// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSettings } from "../config/openSettings";
import { loadKeepAwakeEnabled } from "../config/keepAwakePreference";
import { loadSeamarksEnabled } from "../config/seamarkPreference";
import { ThemeProvider } from "../design/theme";
import { isLayerEntry, useBackDismiss } from "../hooks/useBackDismiss";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { goTo } from "../router";
import { SettingsSheet } from "./SettingsSheet";
import { hideSettings } from "./settingsStore";

// The router pings the service worker on every navigation (same seam as
// `router.test.tsx`).
vi.mock("../sw", () => ({
  checkForAppUpdate: vi.fn(),
  flushPendingUpdate: vi.fn(),
}));

/** jsdom has no matchMedia: a light device, never changing. */
function stubMatchMedia() {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** The app as main.tsx mounts it: a page with a control that opens the
    settings, and the settings beside the routes. */
function App({ children }: { children?: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div id="root-probe">
        <button type="button" onClick={openSettings}>
          Ouvrir
        </button>
        {children}
      </div>
      <SettingsSheet />
    </ThemeProvider>
  );
}

const dialog = () => screen.getByRole("dialog");
const title = () => within(dialog()).getByRole("heading", { level: 2 }).textContent;

/** Lets the `history.back()` calls in flight land: jsdom, like a browser,
    fires their `popstate` asynchronously. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

/** A back press of the browser or of the phone. */
async function pressBack() {
  window.history.back();
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia();
  window.history.replaceState(null, "", "/");
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
});

afterEach(async () => {
  act(() => hideSettings());
  // The back-button stack is one for the page: no pop of this test may land
  // in the next one.
  await settle();
  document.getElementById("root")?.remove();
  vi.unstubAllGlobals();
});

describe("SettingsSheet", () => {
  it("opens on the root view, as a modal dialog, with its four groups in order", () => {
    render(<App />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));

    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(title()).toBe("Réglages");
    const groups = within(dialog()).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["Appareil", "Carte", "Prévisions"]);
    // The rest of the app cannot be reached while the settings are open.
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(true);
  });

  it("goes into a view and back, the header naming the view under it", () => {
    render(<App />);
    act(() => openSettings());
    fireEvent.click(within(dialog()).getByRole("button", { name: /Langue/ }));

    expect(title()).toBe("Langue");
    const back = within(dialog()).getByRole("button", { name: "Réglages" });
    const radios = within(dialog()).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Français", "English", "Deutsch", "Italiano", "Español"]);
    expect(radios.map((r) => r.getAttribute("lang"))).toEqual(["fr", "en", "de", "it", "es"]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");

    fireEvent.click(back);
    expect(title()).toBe("Réglages");
  });

  it("closes on OK and on Escape, giving the focus back to the control that opened it", () => {
    render(<App />);
    const opener = screen.getByRole("button", { name: "Ouvrir" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(within(dialog()).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(false);

    fireEvent.click(opener);
    fireEvent.keyDown(dialog(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("always reopens on the root view", () => {
    render(<App />);
    act(() => openSettings());
    fireEvent.click(within(dialog()).getByRole("button", { name: /Langue/ }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "OK" }));
    act(() => openSettings());
    expect(title()).toBe("Réglages");
  });

  it("takes one history entry, and the back button goes up one view, then closes", async () => {
    render(<App />);
    act(() => openSettings());
    expect(isLayerEntry(window.history.state)).toBe(true);
    const entry = JSON.stringify(window.history.state);
    fireEvent.click(within(dialog()).getByRole("button", { name: /Langue/ }));
    await settle();
    // Going into a view spends no entry of its own.
    expect(JSON.stringify(window.history.state)).toBe(entry);

    await pressBack();
    expect(title()).toBe("Réglages");
    // The press consumed the entry: the settings took a fresh one, so the
    // next press closes them rather than leaving the page.
    expect(isLayerEntry(window.history.state)).toBe(true);

    await pressBack();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.pathname).toBe("/");
  });

  it("leaves the screen setting out on a computer, where the pointer is a mouse", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: fine)",
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<App />);
    act(() => openSettings());

    expect(within(dialog()).queryByRole("switch", { name: "Garder l'écran allumé" })).toBeNull();
    // The rest of the group is there.
    expect(within(dialog()).getByRole("radiogroup", { name: "Thème" })).toBeTruthy();
    stubMatchMedia();
  });

  it("stores each choice at once: switch, theme and sea marks", () => {
    render(<App />);
    act(() => openSettings());

    const awake = within(dialog()).getByRole("switch", { name: "Garder l'écran allumé" });
    expect(awake.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(awake);
    expect(awake.getAttribute("aria-checked")).toBe("false");
    expect(loadKeepAwakeEnabled()).toBe(false);

    const theme = within(dialog()).getByRole("radiogroup", { name: "Thème" });
    expect(within(theme).getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(theme).getByRole("radio", { name: "Sombre" }));
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.theme)).toBe("dark");
    // Arrow keys move the choice within the group.
    fireEvent.keyDown(within(theme).getByRole("radio", { name: "Sombre" }), { key: "ArrowLeft" });
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.theme)).toBe("light");

    const marks = within(dialog()).getByRole("radiogroup", { name: "Balises et amers" });
    expect(within(marks).getByRole("radio", { name: "Toujours" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(marks).getByRole("radio", { name: "Jamais" }));
    expect(loadSeamarksEnabled()).toBe(false);
  });

  it("sums up the models and the boat from what is stored", () => {
    render(<App />);
    act(() => openSettings());
    expect(within(dialog()).getByText("Tableau : AROME HD, ICON-EU, ECMWF, GFS")).toBeTruthy();
    const boat = within(dialog()).getByRole("button", { name: /^Bateau/ });
    expect(boat.textContent).toBe("BateauCroiseur 30 pieds · 75\u00a0%");
  });

  it("opens over a layer closing in the same gesture, and keeps its entry", async () => {
    // The navigation drawer: a layer on the back button, whose « Réglages »
    // entry closes it and opens the settings in one handler. The drawer's
    // entry is popped by a `history.back()` that lands later; it must not
    // take the settings' entry, nor close them.
    function Drawer() {
      const [open, setOpen] = useState(true);
      useBackDismiss(open, () => setOpen(false));
      return open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            openSettings();
          }}
        >
          Réglages du tiroir
        </button>
      ) : null;
    }
    render(
      <App>
        <Drawer />
      </App>,
    );
    expect(isLayerEntry(window.history.state)).toBe(true);
    const length = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: "Réglages du tiroir" }));
    // The drawer's pop lands after the click; the settings' entry waited
    // for it and took its place.
    await settle();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(isLayerEntry(window.history.state)).toBe(true);
    expect(window.history.length).toBe(length);

    // And the next back press closes the settings, not the page.
    await pressBack();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.pathname).toBe("/");
  });

  it("closes when the page changes, without undoing the navigation", async () => {
    render(<App />);
    act(() => openSettings());
    act(() => goTo("/plan"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await settle();
    // The router took the settings' entry for the new page: nothing popped
    // it from under the reader.
    expect(window.location.pathname).toBe("/plan");
    expect(isLayerEntry(window.history.state)).toBe(false);
  });
});
