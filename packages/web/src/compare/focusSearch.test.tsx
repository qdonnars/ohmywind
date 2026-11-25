// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SEARCH_INPUT_ID, SEARCH_TRIGGER_ID } from "../components/SpotSearch";
import { AddSpotButton } from "./SpotPicker";
import { focusSearch, SEARCH_SPOTLIGHT_CLASS } from "./focusSearch";

describe("focusSearch", () => {
  it("focuses the field over the map and lights it up, so the press shows (#395)", () => {
    // The field as SpotSearch draws it from lg up, and the button of the list.
    render(
      <>
        <input id={SEARCH_INPUT_ID} role="combobox" aria-label="Rechercher un lieu" defaultValue="Porquerolles" />
        <AddSpotButton onClick={focusSearch} />
      </>,
    );
    const input = screen.getByRole<HTMLInputElement>("combobox");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un spot" }));

    expect(document.activeElement).toBe(input);
    // Selected, so typing replaces the last place picked.
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("Porquerolles".length);
    expect(input.classList.contains(SEARCH_SPOTLIGHT_CLASS)).toBe(true);

    fireEvent.animationEnd(input);
    expect(input.classList.contains(SEARCH_SPOTLIGHT_CLASS)).toBe(false);
  });

  it("opens the full-screen search where the field over the map is only its way in", () => {
    const open = vi.fn();
    render(
      <>
        <button id={SEARCH_TRIGGER_ID} type="button" onClick={open}>
          Rechercher un lieu
        </button>
        <AddSpotButton onClick={focusSearch} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un spot" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a page without the search", () => {
    render(<AddSpotButton onClick={focusSearch} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Ajouter un spot" }))).not.toThrow();
  });
});
