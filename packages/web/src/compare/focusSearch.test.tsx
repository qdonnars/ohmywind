// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AddSpotButton } from "./SpotPicker";
import { focusSearch, SEARCH_SPOTLIGHT_CLASS } from "./focusSearch";

/** The header's field as SpotSearch draws it, and the button of the sheet. */
function Page() {
  return (
    <>
      <header>
        <input role="combobox" aria-label="Rechercher un lieu" defaultValue="Porquerolles" />
      </header>
      <AddSpotButton onClick={focusSearch} />
    </>
  );
}

describe("focusSearch", () => {
  it("focuses the search field and lights it up, so the press shows (#395)", () => {
    render(<Page />);
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

  it("does nothing on a page without the header field", () => {
    render(<AddSpotButton onClick={focusSearch} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Ajouter un spot" }))).not.toThrow();
  });
});
