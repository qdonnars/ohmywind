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

describe("CompareTable, a favourite on land (#480)", () => {
  const LEON: Spot = { name: "Léon", latitude: 48.565, longitude: -4.4 };
  const forecast = { model: "meteofrance_arome_france", hourly: { time: [] } } as unknown as CompareRow["forecast"];
  const rows: CompareRow[] = [
    { spot: LEON, forecast, marine: null, onLand: true },
    { spot: CASSIS, forecast, marine: null },
  ];
  function mountLand(wave: boolean) {
    render(
      <CompareTable
        rows={rows}
        res={3}
        win={[6, 22]}
        wave={wave}
        dense
        nameWidth={96}
        gap={3}
        focusedKey={null}
        onFocusSpot={vi.fn()}
      />,
    );
  }
  const header = (name: string) => screen.getByRole("rowheader", { name: `Centrer la carte sur ${name}` });

  it("says why the sea band of a spot on land is empty", () => {
    mountLand(true);
    expect(header("Léon").textContent).toContain("À terre");
    expect(header("Cassis").textContent).not.toContain("À terre");
  });

  it("says nothing of land while the sea band is off", () => {
    mountLand(false);
    expect(header("Léon").textContent).not.toContain("À terre");
  });
});
