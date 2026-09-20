// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanelNote } from "./PanelNote";

afterEach(cleanup);

describe("PanelNote", () => {
  it("centres the small print with room at the sides for rounded screen corners", () => {
    const { container } = render(<PanelNote>zéro hydrographique</PanelNote>);
    const p = container.querySelector("p")!;
    expect(p.className).toContain("text-center");
    expect(p.className).toContain("px-5");
    expect(p.className).toContain("text-[9px]");
    expect(p.style.color).toBe("var(--ow-fg-2)");
  });

  it("paints the warning variant larger and in the warning colour", () => {
    const { container } = render(<PanelNote variant="warning">attention</PanelNote>);
    const p = container.querySelector("p")!;
    expect(p.className).toContain("text-[11px]");
    expect(p.className).toContain("text-center");
    expect(p.style.color).toBe("var(--ow-warn)");
    expect(p.style.background).toBe("var(--ow-warn-soft)");
  });
});
