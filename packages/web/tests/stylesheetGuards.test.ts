// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Rules of index.css that a component relies on by class name.
 *
 * jsdom applies no stylesheet and Vitest hands `?raw` CSS back empty, so a
 * component test can check that the class is set, not that the rule behind
 * it still exists. The rule is checked here, in the source. What it looks
 * like is checked in a browser, on the production build.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// SPOT_MARKER_CLASS in src/utils/spotMarkerLayer.ts, spelled out: importing
// it would pull Leaflet and the DOM into this Node project.
const SPOT_MARKER_CLASS = "ow-spot-marker";

const CSS = readFileSync(fileURLToPath(new URL("../src/index.css", import.meta.url)), "utf8");

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

describe("index.css", () => {
  it("draws no square around a focused spot dot, and a round ring for the keyboard (#545)", () => {
    expect(rule(`path.${SPOT_MARKER_CLASS}:focus`)).toMatch(/outline:\s*none/);
    expect(rule(`path.${SPOT_MARKER_CLASS}:focus-visible`)).toMatch(/stroke:\s*var\(--ow-fg-0\)/);
  });

  it("pins a viewport overlay to the visible box, with only its top and height (#569)", () => {
    const declarations = rule(".ow-visible-viewport");
    expect(declarations).toMatch(/top:\s*var\(--ow-vv-top,/);
    expect(declarations).toMatch(/height:\s*var\(--ow-vv-height,/);
    // The sides and the position come from utilities; a `bottom` here would
    // fight the height.
    expect(declarations).not.toMatch(/\b(bottom|inset|position):/);
  });

  it("runs the navigation drawer under the status bar and the notch without hiding its content", () => {
    const declarations = rule(".ow-nav-drawer");
    expect(declarations).toMatch(/width:\s*min\(calc\(304px \+ env\(safe-area-inset-left/);
    expect(declarations).toMatch(/env\(safe-area-inset-top/);
    expect(declarations).toMatch(/env\(safe-area-inset-bottom/);
  });
});
