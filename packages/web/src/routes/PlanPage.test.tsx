// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResizableMobileDrawer } from "./PlanPage";

/**
 * The mobile drawer's grab handle. jsdom lays nothing out, so what is checked
 * is which of its invisible strips exist: the one reaching down is the one
 * that can sit over the content, and it may only exist over a head.
 */
describe("ResizableMobileDrawer", () => {
  const reach = (side: "above" | "below") =>
    document.querySelector(`[data-handle-reach="${side}"]`);

  it("reaches down over the head of a computed passage, which nothing taps", () => {
    render(
      <ResizableMobileDrawer defaultVh={60} head={<div>14,7 nm · 6h16 · 15:16</div>}>
        <button type="button">Recalculer</button>
      </ResizableMobileDrawer>,
    );
    expect(reach("above")).not.toBeNull();
    expect(reach("below")).not.toBeNull();
  });

  it("does not reach down when the content starts right under the handle", () => {
    // Seed: with the comparison open the drawer has no head, and the strip
    // covered « ‹ Plan » on its first line: measured on a 390 px wide
    // screen, the button spanned 419.75 to 435.75 px and the strip 414 to
    // 430 px, so a tap at its centre landed on the strip (QA, 2026-09-18).
    render(
      <ResizableMobileDrawer defaultVh={60} head={null}>
        <button type="button" aria-label="Revenir au plan">
          Plan
        </button>
      </ResizableMobileDrawer>,
    );
    expect(screen.getByRole("button", { name: "Revenir au plan" })).toBeTruthy();
    expect(reach("above")).not.toBeNull();
    expect(reach("below")).toBeNull();
  });
});
