// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { layoutHeight, revealDelta, screenBelow, visibleBox } from "./visibleViewport";

// An iPhone 14 in portrait: 844 px of layout viewport, and the keyboard with
// its bar covering the bottom 380.
const PHONE = 844;
const KEYBOARD = 380;

describe("visibleBox", () => {
  it("is the whole screen when nothing covers it", () => {
    expect(visibleBox(PHONE, { height: PHONE, offsetTop: 0, scale: 1 })).toEqual({
      top: 0,
      height: PHONE,
      hiddenBelow: 0,
    });
  });

  it("stops above a keyboard that slides over the page (#569)", () => {
    expect(visibleBox(PHONE, { height: PHONE - KEYBOARD, offsetTop: 0, scale: 1 })).toEqual({
      top: 0,
      height: PHONE - KEYBOARD,
      hiddenBelow: KEYBOARD,
    });
  });

  it("follows iOS when it slides the view down to reach a low field", () => {
    // The visual viewport moved 120 px down the layout viewport: what is seen
    // starts there, and what is hidden below is the keyboard minus that.
    expect(visibleBox(PHONE, { height: PHONE - KEYBOARD, offsetTop: 120, scale: 1 })).toEqual({
      top: 120,
      height: PHONE - KEYBOARD,
      hiddenBelow: KEYBOARD - 120,
    });
  });

  it("is the whole screen in a WebView that shrinks itself for the keyboard", () => {
    // adjustResize: the layout viewport is already the short one.
    expect(visibleBox(PHONE - KEYBOARD, { height: PHONE - KEYBOARD, offsetTop: 0, scale: 1 })).toEqual({
      top: 0,
      height: PHONE - KEYBOARD,
      hiddenBelow: 0,
    });
  });

  it("ignores a two-finger zoom, which is not a keyboard", () => {
    expect(visibleBox(PHONE, { height: PHONE / 2, offsetTop: 200, scale: 2 })).toEqual({
      top: 0,
      height: PHONE,
      hiddenBelow: 0,
    });
  });

  it("is the whole screen without a visual viewport", () => {
    expect(visibleBox(PHONE, null)).toEqual({ top: 0, height: PHONE, hiddenBelow: 0 });
  });

  it("never reaches past the layout viewport", () => {
    // iOS overshoots for a frame while the keyboard slides.
    const box = visibleBox(PHONE, { height: PHONE, offsetTop: 40, scale: 1 });
    expect(box.top + box.height).toBe(PHONE);
    expect(box.hiddenBelow).toBe(0);
  });
});

describe("screenBelow", () => {
  it("is nothing with the keyboard closed", () => {
    expect(screenBelow(PHONE, visibleBox(PHONE, { height: PHONE, offsetTop: 0, scale: 1 }))).toBe(0);
  });

  it("reaches the bottom of the screen under the keyboard (#608)", () => {
    const box = visibleBox(PHONE, { height: PHONE - KEYBOARD, offsetTop: 0, scale: 1 });
    expect(screenBelow(PHONE, box)).toBe(KEYBOARD);
  });

  it("still reaches it when iOS slid the view down", () => {
    // What is seen starts 120 px down: the screen ends 120 px past the layout
    // viewport, the keyboard's whole height under what is seen.
    const box = visibleBox(PHONE, { height: PHONE - KEYBOARD, offsetTop: 120, scale: 1 });
    expect(box.top + box.height + screenBelow(PHONE, box)).toBe(PHONE + 120);
  });

  it("is nothing in a WebView that shrinks itself for the keyboard", () => {
    const short = PHONE - KEYBOARD;
    expect(screenBelow(short, visibleBox(short, { height: short, offsetTop: 0, scale: 1 }))).toBe(0);
  });
});

describe("revealDelta", () => {
  const box = visibleBox(PHONE, { height: PHONE - KEYBOARD, offsetTop: 0, scale: 1 });

  it("leaves alone a block already in sight", () => {
    expect(revealDelta({ top: 100, bottom: 300 }, box, 12)).toBe(0);
  });

  it("scrolls up just enough to clear the keyboard", () => {
    // Bottom at 600, seen down to 464 - 12 = 452.
    expect(revealDelta({ top: 400, bottom: 600 }, box, 12)).toBe(148);
  });

  it("never pushes the top of the block out of sight", () => {
    // 700 px tall: only its top can be shown, at the margin.
    expect(revealDelta({ top: 300, bottom: 1000 }, box, 12)).toBe(288);
  });

  it("scrolls down to a block above what is seen", () => {
    const panned = visibleBox(PHONE, { height: PHONE - KEYBOARD, offsetTop: 120, scale: 1 });
    expect(revealDelta({ top: 50, bottom: 100 }, panned, 12)).toBe(-82);
  });
});


describe("layoutHeight", () => {
  it("is the screen when the keyboard has shrunk innerHeight (iPhone)", () => {
    // 956 px of screen, 392 of keyboard: innerHeight follows the visible part.
    expect(layoutHeight(564, 956)).toBe(956);
  });

  it("is innerHeight where the two agree or the document has no layout", () => {
    expect(layoutHeight(900, 900)).toBe(900);
    expect(layoutHeight(844, 0)).toBe(844);
  });

  it("gives the sheet the whole visible part once the page has slid under the keyboard", () => {
    const full = layoutHeight(564, 956);
    const box = visibleBox(full, { height: 564, offsetTop: 256, scale: 1 });
    expect(box).toEqual({ top: 256, height: 564, hiddenBelow: 136 });
    expect(screenBelow(full, box)).toBe(392);
  });
});
