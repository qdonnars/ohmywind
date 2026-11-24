// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { revealFocusedField, startVisibleViewport, useVisibleViewport } from "./visibleViewport";

// jsdom lays nothing out: every box is placed by hand.
function placeAt(el: Element, top: number, height: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 300,
    width: 300,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
}

/** A scroll container `room` px taller than its box. */
function scroller(room: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.overflowY = "auto";
  Object.defineProperty(el, "clientHeight", { value: 600, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: 600 + room, configurable: true });
  // jsdom keeps scrollTop at whatever it is given: clamp it like a browser.
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = Math.min(Math.max(v, 0), room);
    },
  });
  return el;
}

const KEYBOARD_UP = { top: 0, height: 464, hiddenBelow: 380 };

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("revealFocusedField", () => {
  it("scrolls the field and its buttons above the keyboard (#569)", () => {
    const list = scroller(1000);
    const block = document.createElement("div");
    block.setAttribute("data-ow-keyboard-reveal", "");
    const input = document.createElement("input");
    block.append(input);
    list.append(block);
    document.body.append(list);
    input.focus();
    // Field at 520, buttons down to 640: the keyboard starts at 464.
    placeAt(block, 500, 140);
    placeAt(input, 520, 40);
    revealFocusedField(document, KEYBOARD_UP);
    // The whole block, not only the field: 640 - (464 - 12).
    expect(list.scrollTop).toBe(188);
  });

  it("hands the rest to the page when the container runs out of room", () => {
    const list = scroller(50);
    const input = document.createElement("input");
    list.append(input);
    document.body.append(list);
    input.focus();
    placeAt(input, 600, 40);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    revealFocusedField(document, KEYBOARD_UP);
    expect(list.scrollTop).toBe(50);
    expect(scrollBy).toHaveBeenCalledWith(0, 188 - 50);
  });

  it("does not scroll the page under a box pinned to the screen", () => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    const input = document.createElement("input");
    overlay.append(input);
    document.body.append(overlay);
    input.focus();
    placeAt(input, 600, 40);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    revealFocusedField(document, KEYBOARD_UP);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("leaves alone a control that brings up no keyboard", () => {
    const list = scroller(1000);
    const slider = document.createElement("input");
    slider.type = "range";
    list.append(slider);
    document.body.append(list);
    slider.focus();
    placeAt(slider, 600, 40);
    revealFocusedField(document, KEYBOARD_UP);
    expect(list.scrollTop).toBe(0);
  });
});

describe("startVisibleViewport", () => {
  it("publishes the visible box to CSS and to React as the keyboard comes and goes", () => {
    // A phone's visual viewport, driven by hand.
    const vv = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    const frames: FrameRequestCallback[] = [];
    const win = Object.assign(new EventTarget(), {
      innerHeight: 844,
      visualViewport: vv,
      document,
      requestAnimationFrame: (cb: FrameRequestCallback) => frames.push(cb),
      scrollBy: () => {},
    }) as unknown as Window;
    const flush = () => act(() => frames.splice(0).forEach((cb) => cb(0)));

    function Probe() {
      const box = useVisibleViewport();
      return <p>{`${box.top}/${box.height}/${box.hiddenBelow}`}</p>;
    }
    render(<Probe />);
    act(() => startVisibleViewport(win));
    const css = document.documentElement.style;
    expect(css.getPropertyValue("--ow-vv-top")).toBe("0px");
    expect(css.getPropertyValue("--ow-vv-height")).toBe("844px");
    expect(screen.getByText("0/844/0")).toBeDefined();

    // A field low on the page takes the focus, the keyboard slides in.
    const list = scroller(1000);
    const input = document.createElement("input");
    list.append(input);
    document.body.append(list);
    input.focus();
    placeAt(input, 600, 40);
    vv.height = 464;
    vv.dispatchEvent(new Event("resize"));
    flush();
    expect(css.getPropertyValue("--ow-vv-height")).toBe("464px");
    expect(screen.getByText("0/464/380")).toBeDefined();
    expect(list.scrollTop).toBe(188);

    // iOS slides the view down: what is seen starts lower.
    vv.offsetTop = 100;
    vv.dispatchEvent(new Event("scroll"));
    flush();
    expect(css.getPropertyValue("--ow-vv-top")).toBe("100px");
    expect(screen.getByText("100/464/280")).toBeDefined();

    // Keyboard down: the whole screen again.
    vv.offsetTop = 0;
    vv.height = 844;
    vv.dispatchEvent(new Event("resize"));
    flush();
    expect(css.getPropertyValue("--ow-vv-height")).toBe("844px");
    expect(screen.getByText("0/844/0")).toBeDefined();
  });
});
