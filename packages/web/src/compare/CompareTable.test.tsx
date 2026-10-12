// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Spot } from "../types";
import { CompareTable } from "./CompareTable";
import { rowKey, type CompareRow } from "./data";

const CASSIS: Spot = { name: "Cassis", latitude: 43.21, longitude: 5.54 };
const TOULON: Spot = { name: "Toulon", latitude: 43.1, longitude: 5.93 };
const ROWS: CompareRow[] = [CASSIS, TOULON].map((spot) => ({ spot, forecast: null, marine: null }));

function mount(focused: Spot | null, onFocusSpot = vi.fn()) {
  render(
    <CompareTable
      rows={ROWS}
      res={3}
      win={[6, 22]}
      wave={false}
      dense
      nameWidth={96}
      gap={3}
      focusedKey={focused ? rowKey(focused) : null}
      onFocusSpot={onFocusSpot}
    />,
  );
  return onFocusSpot;
}

describe("CompareTable, the way to Explorer", () => {
  it("says on the focused row that a second tap opens it in Explorer", () => {
    const onFocusSpot = mount(CASSIS);
    const focused = screen.getByRole("rowheader", { name: "Ouvrir Cassis dans Explorer" });
    expect(focused.textContent).toContain("Explorer ›");
    fireEvent.click(focused);
    expect(onFocusSpot).toHaveBeenCalledWith(CASSIS);
  });

  it("keeps the other rows to centring the map", () => {
    mount(CASSIS);
    const other = screen.getByRole("rowheader", { name: "Centrer la carte sur Toulon" });
    expect(other.textContent).not.toContain("Explorer ›");
  });
});
