// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Archetype } from "../types";
import { ArchetypeSelector } from "./ArchetypeSelector";

// The server names a boat by its slug and its hull in English.
const ARCHETYPES: Archetype[] = [
  { slug: "cruiser_30ft", name: "cruiser_30ft", length_ft: 30, type: "monohull", category: "cruiser", examples: ["Sun Odyssey 30"], performance_class: "cruiser" },
  { slug: "catamaran_40ft", name: "catamaran_40ft", length_ft: 40, type: "catamaran", category: "cruiser", examples: ["Lagoon 400"], performance_class: "cruiser" },
];

vi.mock("../session/planContext", () => ({
  usePlan: () => ({
    state: { archetype: "cruiser_30ft" },
    actions: { setArchetype: vi.fn(), selectPerso: vi.fn() },
    archetypes: ARCHETYPES,
    compute: vi.fn(),
  }),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/plan");
  localStorage.clear();
});

describe("ArchetypeSelector", () => {
  it("names the chosen boat and the list in the reader's language, never by slug", () => {
    render(<ArchetypeSelector />);
    const trigger = screen.getByRole("button", { name: "Croiseur 30 pieds" });
    expect(document.body.textContent).not.toContain("cruiser_30ft");

    fireEvent.click(trigger);
    expect(screen.getByText("30 ft · monocoque · Sun Odyssey 30")).toBeTruthy();
    expect(screen.getByText("40 ft · catamaran · Lagoon 400")).toBeTruthy();
    expect(document.body.textContent).not.toContain("monohull");
  });
});
