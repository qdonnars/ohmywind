// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpotEditDialog, SpotNameDialog } from "./SpotDialogs";
import type { Spot } from "../types";

const SPOT: Spot = { name: "Porquerolles", latitude: 43.0034, longitude: 6.2015 };

describe("SpotEditDialog", () => {
  it("names the spot and shows its position to four decimals", () => {
    render(
      <SpotEditDialog spot={SPOT} onRename={vi.fn()} onDelete={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("Porquerolles")).toBeDefined();
    expect(screen.getByText("43.0034, 6.2015")).toBeDefined();
  });

  it("offers its three choices in French", () => {
    render(
      <SpotEditDialog spot={SPOT} onRename={vi.fn()} onDelete={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("dialog", { name: "Options du spot" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Renommer" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDefined();
  });

  it("routes each button to its own callback", async () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    render(
      <SpotEditDialog spot={SPOT} onRename={onRename} onDelete={onDelete} onCancel={onCancel} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Renommer" }));
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("SpotNameDialog", () => {
  const pending = { lat: 43.0034, lng: 6.2015, name: "Porquerolles" };

  it("creates when no spot is being edited", () => {
    render(
      <SpotNameDialog
        pending={pending}
        onNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Nouveau spot" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Créer" })).toBeDefined();
  });

  it("renames when one is", () => {
    render(
      <SpotNameDialog
        pending={{ ...pending, editingSpot: SPOT }}
        onNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Renommer le spot" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Renommer" })).toBeDefined();
  });

  it("reports every keystroke to the caller, which owns the value", async () => {
    const onNameChange = vi.fn();
    render(
      <SpotNameDialog
        pending={pending}
        onNameChange={onNameChange}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const field = screen.getByRole("textbox", { name: "Nom du spot" });
    expect((field as HTMLInputElement).value).toBe("Porquerolles");
    await userEvent.setup().type(field, "!");
    expect(onNameChange).toHaveBeenCalledWith("Porquerolles!");
  });

  it("routes confirm and cancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <SpotNameDialog
        pending={pending}
        onNameChange={vi.fn()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Créer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
