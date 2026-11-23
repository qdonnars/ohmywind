// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { systemBarsStyleFor } from "./systemBars";

describe("systemBarsStyleFor", () => {
  it("asks for light icons over the dark theme", () => {
    expect(systemBarsStyleFor("dark")).toBe("DARK");
  });

  it("asks for dark icons over the light theme", () => {
    expect(systemBarsStyleFor("light")).toBe("LIGHT");
  });

  it("leaves the choice to the system when the theme is unknown", () => {
    expect(systemBarsStyleFor(null)).toBe("DEFAULT");
    expect(systemBarsStyleFor("sepia")).toBe("DEFAULT");
  });
});
