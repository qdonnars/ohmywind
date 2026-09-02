// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import {
  arrowsSvg,
  buildArrowItem,
  currentArrowItems,
  relaxLabels,
  SPOT_CX,
  SPOT_CY,
  waveArrowItems,
  windArrowItems,
  type ArrowItem,
} from "./spotArrows";
import type { MarineHourly, ModelForecast } from "../types";

const COLOR = "#ffffff";
const HOUR = "2026-09-03T12:00";

function forecast(name: string, dirDeg: number | null, speedKn: number | null): ModelForecast {
  return {
    modelName: name,
    hourly: {
      time: ["2026-09-03T11:00", HOUR],
      wind_speed_10m: [0, speedKn],
      wind_direction_10m: [0, dirDeg],
      wind_gusts_10m: [0, 0],
      weather_code: [0, 0],
    },
  };
}

function marine(over: Partial<MarineHourly> = {}): MarineHourly {
  return {
    time: ["2026-09-03T11:00", HOUR],
    wave_height_m: [0, 1.4],
    wave_period_s: [0, 7.6],
    wave_direction_deg: [0, 270],
    current_speed_kn: [0, 0.8],
    current_direction_to_deg: [0, 90],
    tide_height_m: [0, 0],
    ...over,
  };
}

describe("buildArrowItem", () => {
  it("points north for angle zero, screen y growing downwards", () => {
    const it = buildArrowItem(0, 100, "10", "AROME", COLOR);
    expect(it.tipX).toBeCloseTo(SPOT_CX);
    expect(it.tipY).toBeCloseTo(SPOT_CY - 100);
  });

  it("points east for a quarter turn", () => {
    const it = buildArrowItem(Math.PI / 2, 100, "10", "", COLOR);
    expect(it.tipX).toBeCloseTo(SPOT_CX + 100);
    expect(it.tipY).toBeCloseTo(SPOT_CY);
  });

  it("puts the label past the tip, on the same axis", () => {
    const it = buildArrowItem(Math.PI / 2, 100, "10", "", COLOR);
    expect(it.natLblX).toBeCloseTo(SPOT_CX + 126);
    expect(it.lblX).toBe(it.natLblX);
    expect(it.lblY).toBe(it.natLblY);
  });
});

describe("relaxLabels", () => {
  it("separates two labels that land on top of each other", () => {
    // Two models predicting the same wind: identical arrows, identical labels.
    const items: ArrowItem[] = [
      buildArrowItem(0, 120, "15", "AROME", COLOR),
      buildArrowItem(0, 120, "15", "ICON", COLOR),
    ];
    relaxLabels(items);
    const dx = Math.abs(items[0].lblX - items[1].lblX);
    const dy = Math.abs(items[0].lblY - items[1].lblY);
    // No AABB overlap left: apart on at least one axis.
    expect(dx >= 64 || dy >= 44).toBe(true);
  });

  it("pushes a label off the spot marker", () => {
    // A very short arrow puts its label inside the keep-out radius.
    const items = [buildArrowItem(0, 5, "2", "AROME", COLOR)];
    relaxLabels(items);
    const dist = Math.hypot(items[0].lblX - SPOT_CX, items[0].lblY - SPOT_CY);
    expect(dist).toBeGreaterThanOrEqual(59.9);
  });

  it("leaves a lone, well-placed label where it is", () => {
    const items = [buildArrowItem(Math.PI / 2, 150, "20", "AROME", COLOR)];
    const before = { x: items[0].lblX, y: items[0].lblY };
    relaxLabels(items);
    expect(items[0].lblX).toBe(before.x);
    expect(items[0].lblY).toBe(before.y);
  });
});

describe("windArrowItems", () => {
  it("draws one arrow per model, pointing downwind", () => {
    // A north wind (from 000) blows towards the south: the arrow points down
    // the screen, i.e. tipY below the centre.
    const items = windArrowItems([forecast("AROME", 0, 12)], HOUR, COLOR);
    expect(items).toHaveLength(1);
    expect(items[0].tipY).toBeGreaterThan(SPOT_CY);
    expect(items[0].displayText).toBe("12");
    expect(items[0].caption).toBe("AROME");
  });

  it("skips a model with no value at that hour", () => {
    expect(windArrowItems([forecast("AROME", null, 12)], HOUR, COLOR)).toEqual([]);
    expect(windArrowItems([forecast("AROME", 0, null)], HOUR, COLOR)).toEqual([]);
  });

  it("skips a model whose series does not cover that hour", () => {
    expect(windArrowItems([forecast("AROME", 0, 12)], "2030-01-01T00:00", COLOR)).toEqual([]);
  });

  it("caps the arrow length so a gale stays on the canvas", () => {
    const gale = windArrowItems([forecast("AROME", 90, 60)], HOUR, COLOR)[0];
    const length = Math.hypot(gale.tipX - SPOT_CX, gale.tipY - SPOT_CY);
    expect(length).toBeCloseTo(240);
  });
});

describe("waveArrowItems", () => {
  it("labels the height and captions the period", () => {
    const items = waveArrowItems(marine(), HOUR, COLOR);
    expect(items[0].displayText).toBe("1.4m");
    expect(items[0].caption).toBe("8s");
  });

  it("falls back to Hs when the period is missing", () => {
    const items = waveArrowItems(marine({ wave_period_s: [0, null] }), HOUR, COLOR);
    expect(items[0].caption).toBe("Hs");
  });

  it("points downwave: a westerly swell runs east", () => {
    // wave_direction is "from" (270 = from the west), so the arrow goes east.
    const items = waveArrowItems(marine(), HOUR, COLOR);
    expect(items[0].tipX).toBeGreaterThan(SPOT_CX);
  });

  it("draws nothing without a height or a direction", () => {
    expect(waveArrowItems(marine({ wave_height_m: [0, null] }), HOUR, COLOR)).toEqual([]);
    expect(waveArrowItems(marine({ wave_direction_deg: [0, null] }), HOUR, COLOR)).toEqual([]);
  });
});

describe("currentArrowItems", () => {
  it("points where the current sets, with no flip", () => {
    // current_direction is already a "to": 90 sets east.
    const items = currentArrowItems(marine(), HOUR, COLOR);
    expect(items[0].tipX).toBeGreaterThan(SPOT_CX);
    expect(items[0].tipY).toBeCloseTo(SPOT_CY);
  });

  it("labels one line only, in knots", () => {
    const items = currentArrowItems(marine(), HOUR, COLOR);
    expect(items[0].displayText).toBe("0.8 kn");
    expect(items[0].caption).toBe("");
  });

  it("draws nothing without a speed or a direction", () => {
    expect(currentArrowItems(marine({ current_speed_kn: [0, null] }), HOUR, COLOR)).toEqual([]);
    expect(
      currentArrowItems(marine({ current_direction_to_deg: [0, null] }), HOUR, COLOR),
    ).toEqual([]);
  });
});

describe("arrowsSvg", () => {
  it("is empty when there is nothing to draw", () => {
    expect(arrowsSvg([])).toBe("");
  });

  it("renders arrows behind, then leaders, then labels", () => {
    const items = [
      buildArrowItem(0, 120, "15", "AROME", COLOR),
      buildArrowItem(0, 120, "15", "ICON", COLOR),
    ];
    const svg = arrowsSvg(items);
    expect(svg.startsWith("<svg width=\"300\" height=\"300\"")).toBe(true);
    expect(svg.indexOf("<polygon")).toBeLessThan(svg.indexOf("<text"));
    // The two labels were pushed apart, so at least one leader is drawn.
    expect(svg).toContain("stroke-dasharray");
    expect(svg.match(/<text/g)).toHaveLength(4); // 2 values + 2 captions
  });
});
