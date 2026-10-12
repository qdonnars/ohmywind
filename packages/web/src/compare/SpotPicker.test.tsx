// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Spot } from "../types";
import { SpotsChip } from "./CompareControls";
import { SpotPicker } from "./SpotPicker";

const SPOTS: Spot[] = [
  { name: "Porquerolles", latitude: 43.0, longitude: 6.2 },
  { name: "Cassis", latitude: 43.21, longitude: 5.54 },
];

describe("SpotPicker, the phone's panel", () => {
  it("ends on « Ajouter un spot », after the list it grows", () => {
    const onAdd = vi.fn();
    render(
      <SpotPicker spots={SPOTS} hidden={new Set()} onToggle={vi.fn()} onAll={vi.fn()} variant="panel" onClose={vi.fn()} onAdd={onAdd} />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[buttons.length - 1].textContent).toBe("Ajouter un spot");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un spot" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("leaves the wide column without it: the page puts its own under the column", () => {
    render(<SpotPicker spots={SPOTS} hidden={new Set()} onToggle={vi.fn()} onAll={vi.fn()} variant="column" onAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Ajouter un spot" })).toBeNull();
  });
});

describe("SpotsChip", () => {
  it("is filled with the accent while its panel is open", () => {
    const { rerender } = render(<SpotsChip picked={2} total={2} open={false} onClick={vi.fn()} small />);
    const chip = screen.getByRole("button", { name: "Spots comparés" });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(chip.style.background).toBe("transparent");

    rerender(<SpotsChip picked={2} total={2} open onClick={vi.fn()} small />);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(chip.style.background).toBe("var(--ow-accent-strong)");
  });
});
