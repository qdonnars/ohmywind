// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WindTable } from "./WindTable";
import type { ModelForecast } from "../types";

// Four hours of Thursday 3 September 2026, Paris time, as the API keys them.
const TIMES = ["2026-09-03T10:00", "2026-09-03T11:00", "2026-09-03T12:00", "2026-09-03T13:00"];

function model(modelName: string, dirs: number[], speeds = [8, 12, 16, 20]): ModelForecast {
  return {
    modelName,
    hourly: {
      time: TIMES,
      wind_speed_10m: speeds,
      wind_direction_10m: dirs,
      wind_gusts_10m: speeds.map((s) => s + 5),
      weather_code: TIMES.map(() => null),
    },
  };
}

// 10:00 the models agree; 11:00 they straddle north (350° and 10°, 20° apart,
// not 340°); 12:00 they are 100° apart; 13:00 exactly at the threshold.
const AROME = model("AROME", [270, 350, 300, 200]);
const ICON = model("ICON", [280, 10, 40, 245]);

function renderTable(onSelectHour = vi.fn(), selectedHour: string | null = null) {
  const utils = render(
    <WindTable
      forecasts={[AROME, ICON]}
      isLoading={false}
      selectedHour={selectedHour}
      onSelectHour={onSelectHour}
    />,
  );
  const directionRow = screen.getByText("Direction").closest("tr")!;
  const directionCells = Array.from(directionRow.querySelectorAll("td[role='cell']"));
  return { ...utils, directionCells, onSelectHour };
}

describe("WindTable", () => {
  beforeEach(() => {
    // 11:30 in Paris: the 11:00 column is "now".
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-03T09:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says the unit once, in the corner, and never in a cell", () => {
    const { container } = renderTable();
    expect(screen.getByText("nœuds")).toBeTruthy();
    const cells = Array.from(container.querySelectorAll("tbody td[role='cell']"));
    expect(cells.some((c) => /kn/.test(c.textContent ?? ""))).toBe(false);
  });

  it("prints one mean arrow per hour while the models agree, across north too", () => {
    const { directionCells } = renderTable();
    expect(directionCells).toHaveLength(TIMES.length);
    expect(directionCells[0].getAttribute("aria-label")).toBe(
      "Direction moyenne des modèles, venant de 275°",
    );
    // 350° and 10° average to north, and are 20° apart: one arrow, no Δ.
    expect(directionCells[1].getAttribute("aria-label")).toBe(
      "Direction moyenne des modèles, venant de 0°",
    );
    expect(directionCells[1].textContent).toBe("");
    expect(directionCells[1].querySelector("svg")).not.toBeNull();
    // 45° is the threshold itself, not past it.
    expect(directionCells[3].textContent).toBe("");
  });

  it("prints the spread in place of the arrow when the models disagree", () => {
    const { directionCells } = renderTable();
    const cell = directionCells[2];
    expect(cell.textContent).toBe("Δ100°");
    expect(cell.getAttribute("aria-label")).toBe("Modèles en désaccord : écart 100°");
    expect(cell.querySelector("[title]")?.getAttribute("title")).toBe(
      "Modèles en désaccord : écart 100°",
    );
    expect(cell.querySelector("svg")).toBeNull();
  });

  it("gives each model its own arrow at a disagreeing hour, and only there", () => {
    const { container } = renderTable();
    const rows = Array.from(container.querySelectorAll("tbody tr")).slice(1);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const cells = row.querySelectorAll("td[role='cell']");
      const withArrow = Array.from(cells).map((c) => c.querySelector("svg") != null);
      expect(withArrow).toEqual([false, false, true, false]);
      // The model's own direction is still read aloud on every cell.
      expect(cells[0].getAttribute("aria-label")).toMatch(/direction \d+°/);
    }
  });

  it("names the current hour and outlines the picked one", () => {
    renderTable(vi.fn(), TIMES[2]);
    const headers = screen.getAllByRole("columnheader");
    const now = headers.find((h) => h.getAttribute("aria-current") === "time")!;
    expect(now.textContent).toMatch(/^Maint\./);
    expect(headers[2].style.color).toBe("var(--ow-fg-0)");
    expect(headers[2].style.fontWeight).toBe("700");
  });

  it("draws the picked hour as one outline around the whole column", () => {
    const { container } = renderTable(vi.fn(), TIMES[2]);
    const [first, last] = Array.from(container.querySelectorAll("tbody tr"))
      .slice(1)
      .map((row) => (row.querySelectorAll("td[role='cell']")[2].firstElementChild as HTMLElement).style.boxShadow);
    // Both sides on every model, the top on the first, the bottom on the last.
    expect(first).toContain("inset 2px 0 0");
    expect(first).toContain("inset 0 2px 0");
    expect(first).not.toContain("inset 0 -2px 0");
    expect(last).toContain("inset -2px 0 0");
    expect(last).toContain("inset 0 -2px 0");
    expect(last).not.toContain("inset 0 2px 0");
  });

  it("selects an hour from its header and from any of its cells", () => {
    const onSelectHour = vi.fn();
    const { directionCells } = renderTable(onSelectHour);
    fireEvent.click(screen.getAllByRole("columnheader")[3]);
    expect(onSelectHour).toHaveBeenLastCalledWith(TIMES[3]);
    fireEvent.click(directionCells[0]);
    expect(onSelectHour).toHaveBeenLastCalledWith(TIMES[0]);
  });
});
