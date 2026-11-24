// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const searchPlaces = vi.fn();
vi.mock("../api/geocoding", () => ({
  searchPlaces: (...args: unknown[]) => searchPlaces(...args),
}));

import { SpotSearch } from "./SpotSearch";

beforeEach(() => {
  vi.useFakeTimers();
  searchPlaces.mockReset();
  searchPlaces.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Past the debounce, with the pending promise settled. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe("SpotSearch", () => {
  it("does not search again when only the map moves under a text left in the field (#579)", async () => {
    const onSelect = vi.fn();
    // A query no other test of this file types: the results are cached by
    // the module across renders.
    const { rerender } = render(<SpotSearch onSelect={onSelect} nearLat={47.64} nearLon={-3.45} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Port-Tudy" } });
    await settle();
    expect(searchPlaces).toHaveBeenCalledTimes(1);
    expect(searchPlaces.mock.calls[0][1].near).toEqual({ lat: 47.64, lon: -3.45 });

    // The page hands the centre of the map: three pans, three new points.
    for (const [lat, lon] of [[47.7, -3.3], [48.1, -4.2], [43.2, 5.3]]) {
      rerender(<SpotSearch onSelect={onSelect} nearLat={lat} nearLon={lon} />);
      await settle();
    }
    expect(searchPlaces).toHaveBeenCalledTimes(1);

    // A change of the text searches again, from where the map now is.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Port-Tudy G" } });
    await settle();
    expect(searchPlaces).toHaveBeenCalledTimes(2);
    expect(searchPlaces.mock.calls[1][1].near).toEqual({ lat: 43.2, lon: 5.3 });
  });
});

describe("SpotSearch, full screen", () => {
  const saved = [
    { name: "Carro", latitude: 43.33, longitude: 5.04 },
    { name: "Cassis", latitude: 43.21, longitude: 5.54 },
  ];

  function mount(onSelect = vi.fn()) {
    render(
      <>
        <div id="root" />
        <SpotSearch onSelect={onSelect} nearLat={43.3} nearLon={5.35} savedSpots={saved} fullscreen />
      </>,
    );
    return onSelect;
  }

  const trigger = () => screen.getByRole("button", { name: /Rechercher un lieu/ });

  it("opens over the whole screen on the saved spots, field focused, page behind inert", () => {
    mount();
    // At rest, a field-shaped button: no text field, no list.
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(trigger());

    const sheet = screen.getByRole("dialog", { name: "Rechercher un lieu" });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(true);
    const list = screen.getByRole("listbox", { name: "Mes spots" });
    expect(Array.from(list.querySelectorAll('[role="option"]')).map((o) => o.textContent)).toEqual([
      expect.stringContaining("Carro"),
      expect.stringContaining("Cassis"),
    ]);
  });

  it("picks a saved spot, closes, and shows its name in the field", () => {
    const onSelect = mount();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: /Cassis/ }));
    expect(onSelect).toHaveBeenCalledWith({ name: "Cassis", latitude: 43.21, longitude: 5.54 });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger().textContent).toContain("Cassis");
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(false);
  });

  it("lists the results under the field once something is typed, and « Annuler » closes", async () => {
    searchPlaces.mockResolvedValue([
      { id: "p1", name: "Port-Miou", latitude: 43.2, longitude: 5.51, context: "Cassis", source: "photon" },
    ]);
    mount();
    fireEvent.click(trigger());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Port-Miou" } });
    await settle();
    expect(screen.getByRole("listbox", { name: "Résultats de recherche" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Port-Miou/ })).toBeTruthy();
    // The clear button empties the field and brings the saved spots back.
    fireEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    expect(screen.getByRole("listbox", { name: "Mes spots" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on Escape", () => {
    mount();
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
