// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it } from "vitest";
import { mapControlsGutterPx } from "./mapControlsLayout";

afterEach(() => {
  document.documentElement.style.removeProperty("--ow-chrome-side");
  document.documentElement.style.removeProperty("--ow-chrome-size");
});

describe("mapControlsGutterPx", () => {
  it("keeps the phone's 68 px where no stylesheet places the column", () => {
    expect(mapControlsGutterPx()).toBe(68);
  });

  it("reads the column's place from the chrome variables, 74 px from lg up", () => {
    document.documentElement.style.setProperty("--ow-chrome-side", "16px");
    document.documentElement.style.setProperty("--ow-chrome-size", "52px");
    expect(mapControlsGutterPx()).toBe(74);
  });
});
