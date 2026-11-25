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
const SETTINGS_CSS = readFileSync(fileURLToPath(new URL("../src/settings/settings.css", import.meta.url)), "utf8");

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
    expect(declarations).toMatch(/height:\s*calc\(var\(--ow-vv-height, 100dvh\) \+ var\(--ow-vv-below, 0px\)\)/);
    // The sides and the position come from utilities; a `bottom` here would
    // fight the height.
    expect(declarations).not.toMatch(/(?<![\w-])(bottom|inset|position):/);
  });

  it("runs an overlay's backdrop on behind the keyboard, its content kept above it (#608)", () => {
    const declarations = rule(".ow-visible-viewport");
    // The part of the screen under what is seen is a bottom border: painted
    // with the layer's background, outside the box its content lives in.
    expect(declarations).toMatch(/box-sizing:\s*border-box/);
    expect(declarations).toMatch(/border-bottom-style:\s*solid/);
    expect(declarations).toMatch(/border-bottom-width:\s*var\(--ow-vv-below, 0px\)/);
    expect(declarations).toMatch(/border-bottom-color:\s*var\(--ow-vv-below-fill, transparent\)/);
  });

  // In settings.css: the settings' overlay has no background of its own.
  it("colours the settings' part under the keyboard (#608)", () => {
    // The sheet's surface on a phone, the scrim around the window from lg up.
    expect(SETTINGS_CSS).toMatch(/\.ow-settings-overlay \{[^}]*--ow-vv-below-fill:\s*var\(--ow-bg-1\)/);
    expect(SETTINGS_CSS).toMatch(
      /@media \(min-width: 64rem\) \{\s*\.ow-settings-overlay \{\s*--ow-vv-below-fill:\s*var\(--ow-scrim\)/,
    );
    // No shadow drawn under the sheet, where its surface runs on.
    expect(SETTINGS_CSS).toMatch(/\.ow-settings-panel \{[^}]*clip-path:\s*inset\(-48px -48px 0 -48px\)/);
  });

  it("runs the navigation drawer under the status bar and the notch without hiding its content", () => {
    const declarations = rule(".ow-nav-drawer");
    expect(declarations).toMatch(/width:\s*min\(calc\(304px \+ env\(safe-area-inset-left/);
    expect(declarations).toMatch(/env\(safe-area-inset-top/);
    expect(declarations).toMatch(/env\(safe-area-inset-bottom/);
  });

  it("stands the map's controls, its hints and its search beside the planner's floating panel", () => {
    // The page publishes what the panel covers; unset elsewhere, it counts
    // for nothing, so the explorer and the phone keep their places.
    expect(rule(".ow-chrome-right")).toMatch(/var\(--ow-map-cover-right, 0px\)/);
    expect(rule(".ow-chrome-end")).toMatch(/var\(--ow-map-cover-right, 0px\)/);
    expect(rule(".ow-chrome-search")).toMatch(/left:\s*calc\(\(100% - var\(--ow-map-cover-right, 0px\)\) \/ 2\)/);
    expect(rule(".ow-map-hint")).toMatch(/var\(--ow-map-cover-right, 0px\)/);
    // The card: rounded, lifted off the chart in either theme.
    const card = rule(".ow-plan-panel-card");
    expect(card).toMatch(/border-radius:\s*16px/);
    expect(card).toMatch(/box-shadow:\s*var\(--ow-shadow-pop\)/);
    expect(card).toMatch(/border:\s*1px solid var\(--ow-line-2\)/);
  });
});
