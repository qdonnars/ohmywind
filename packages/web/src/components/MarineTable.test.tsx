// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarineTable } from "./MarineTable";
import type { MarineHourly } from "../types";

const TIMES = ["2026-09-03T10:00", "2026-09-03T11:00", "2026-09-03T12:00", "2026-09-03T13:00", "2026-09-03T14:00"];

const MARINE: MarineHourly = {
  time: TIMES,
  wave_height_m: [0.4, 0.8, 1.2, 2.0, null],
  // 7.2 s prints as 7, the same as the hour before; 9 is a change; after a
  // gap the value is said again.
  wave_period_s: [7, 7.2, 9, 9, null],
  wave_direction_deg: [240, 245, 250, 255, null],
  current_speed_kn: [0.4, 1.2, 2.5, 0.1, null],
  current_direction_to_deg: [90, 95, 100, 270, null],
  tide_height_m: TIMES.map(() => null),
};

function rowOf(label: string): HTMLElement[] {
  const tr = screen.getByText(label).closest("tr")!;
  return Array.from(tr.querySelectorAll<HTMLElement>("td[role='cell']"));
}

function renderTable(metric: "waves" | "currents", selectedHour: string | null = null, onSelectHour = vi.fn()) {
  render(
    <MarineTable
      metric={metric}
      marine={MARINE}
      forecasts={[]}
      selectedHour={selectedHour}
      onSelectHour={onSelectHour}
    />,
  );
}

describe("MarineTable, waves", () => {
  it("reads where the sea comes from, then its height, then its period", () => {
    renderTable("waves");
    const labels = screen.getAllByRole("rowheader").map((h) => h.textContent);
    expect(labels).toEqual(["Venant de", "Hauteurm", "Périodes"]);
  });

  it("draws the direction as arrows only, the bearing in the label", () => {
    renderTable("waves");
    const cells = rowOf("Venant de");
    expect(cells[0].textContent).toBe("");
    expect(cells[0].querySelector("svg")).not.toBeNull();
    expect(cells[0].getAttribute("aria-label")).toBe("Direction des vagues, venant de 240°");
  });

  it("paints the height on the sea's own ramp, with no unit in the cell", () => {
    renderTable("waves");
    const fills = rowOf("Hauteur").map((c) => c.firstElementChild as HTMLElement);
    expect(fills.slice(0, 4).map((f) => f.textContent)).toEqual(["0,4", "0,8", "1,2", "2,0"]);
    expect(fills.slice(0, 4).map((f) => f.style.background)).toEqual([
      "var(--ow-wave-1)",
      "var(--ow-wave-2)",
      "var(--ow-wave-3)",
      "var(--ow-wave-4)",
    ]);
    // Light ink on the dark blues under a metre, dark ink from there.
    expect(fills[1].style.color).toBe("var(--ow-fg-0)");
    expect(fills[2].style.color).toBe("var(--ow-cell-ink)");
  });

  it("says the period where it changes, and draws a line over the hours it holds", () => {
    renderTable("waves");
    const cells = rowOf("Période");
    expect(cells.map((c) => c.textContent)).toEqual(["7", "", "9", "", "—"]);
    const lines = (cell: HTMLElement) =>
      [...cell.querySelectorAll<HTMLElement>("span.h-px")].map((l) => l.style.background);
    // The 7 runs into the next hour, which is all line; the 9 starts fresh.
    expect(lines(cells[0])).toEqual(["transparent", "var(--ow-fg-3)"]);
    expect(lines(cells[1])).toEqual(["var(--ow-fg-3)"]);
    expect(lines(cells[2])).toEqual(["transparent", "var(--ow-fg-3)"]);
    // The line is for the eye; the value is still read aloud.
    expect(cells[1].getAttribute("aria-label")).toBe("Période des vagues 7 s");
  });

  it("always says the period of the picked hour, on its line", () => {
    renderTable("waves", TIMES[1]);
    const cells = rowOf("Période");
    expect(cells.map((c) => c.textContent)).toEqual(["7", "7", "9", "", "—"]);
  });

  it("outlines the picked hour on the height and selects from any cell", () => {
    const onSelectHour = vi.fn();
    renderTable("waves", TIMES[2], onSelectHour);
    const fills = rowOf("Hauteur").map((c) => c.firstElementChild as HTMLElement);
    expect(fills[2].style.boxShadow).toBe("inset 0 0 0 2px var(--ow-fg-0)");
    expect(fills[1].style.boxShadow).toBe("");
    fireEvent.click(rowOf("Période")[3]);
    expect(onSelectHour).toHaveBeenLastCalledWith(TIMES[3]);
  });
});

describe("MarineTable, currents", () => {
  it("reads like the sea: where the current goes, then its speed", () => {
    renderTable("currents");
    const labels = screen.getAllByRole("rowheader").map((h) => h.textContent);
    expect(labels).toEqual(["Portant vers", "Vitessekn"]);
  });

  it("says the unit in the row name, not in the cells", () => {
    renderTable("currents");
    const cells = rowOf("Vitesse");
    expect(cells.map((c) => c.textContent)).toEqual(["0,4", "1,2", "2,5", "0,1", "—"]);
  });

  it("draws the direction as arrows only, the bearing in the label", () => {
    renderTable("currents");
    const cells = rowOf("Portant vers");
    expect(cells[0].textContent).toBe("");
    expect(cells[0].querySelector("svg")).not.toBeNull();
    expect(cells[0].getAttribute("aria-label")).toBe("Courant portant vers 90°");
  });

  it("paints the speed in the softened tints of the wind table", () => {
    renderTable("currents");
    const fill = rowOf("Vitesse")[2].firstElementChild as HTMLElement;
    expect(fill.style.background).toContain("color-mix(in oklch, var(--ow-w-3) 78%");
  });
});

describe("MarineTable, currents warning", () => {
  const withGap: MarineHourly = { ...MARINE, tidal_gap: { zone: "Raz de Sein", kind: "pass", max_spring_kt: 6 } };

  function renderCurrents(marine: MarineHourly) {
    render(<MarineTable metric="currents" marine={marine} forecasts={[]} selectedHour={null} onSelectHour={vi.fn()} />);
  }

  it("says the warning on one line, and the full sentence only once unfolded", () => {
    renderCurrents(withGap);
    const line = screen.getByRole("button", { name: /^Courants probablement faux ici · Raz de Sein · maille de / });
    expect(line.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/zone de fort courant de marée/)).toBeNull();

    fireEvent.click(line);
    expect(line.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Raz de Sein est une zone de fort courant de marée/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Comment les courants sont calculés" });
    expect(link.getAttribute("href")).toBe("/methodologie/courants");
  });

  it("names the place of an unknown current, and no place at the edge of the model", () => {
    renderCurrents({ ...MARINE, current_unknown: { reason: "unresolved", zone: "Saltstraumen", fields: ["current"] } });
    expect(screen.getByRole("button", { name: "Courant inconnu ici · Saltstraumen" })).toBeTruthy();
    cleanup();
    renderCurrents({ ...MARINE, current_unknown: { reason: "model_edge", zone: "", fields: ["current"] } });
    expect(screen.getByRole("button", { name: "Courant inconnu ici" })).toBeTruthy();
  });

  it("keeps the small print of the source when there is nothing to warn about", () => {
    renderCurrents(MARINE);
    expect(screen.queryByRole("button", { name: /probablement faux|inconnu/ })).toBeNull();
  });
});
