// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useSyncExternalStore } from "react";

/**
 * The part of the screen the reader can actually see, keyboard included.
 *
 * On a phone the on-screen keyboard does not shrink the page. iOS (Safari and
 * the app's WebView alike) and Chrome on Android slide it over the bottom of
 * the layout viewport, so `100dvh`, `inset: 0` and every `position: fixed`
 * box keep their full height and their bottom goes under the keys. Only the
 * visual viewport shrinks, and on iOS it may also slide down when the system
 * scrolls a field into view. The "Nouveau spot" dialog, centred on the whole
 * screen, left its name field under the keyboard's bar and its buttons under
 * the keys (#569).
 *
 * One tracker for the whole app, started from `main.tsx`, rather than one fix
 * per screen. It publishes the visible box three ways:
 *
 * - three CSS variables on `<html>`, `--ow-vv-top`, `--ow-vv-height` and
 *   `--ow-vv-below`, which `.ow-visible-viewport` in index.css uses to keep
 *   an overlay's content in exactly the visible part of the screen while its
 *   backdrop still covers the screen down to its bottom edge, behind the
 *   keyboard (see `components/ViewportOverlay.tsx`);
 * - `useVisibleViewport()`, for a box placed in pixels by script, such as the
 *   search suggestions, which must stop above the keyboard;
 * - and, for a field that sits in the flow of a page, a nudge when the
 *   keyboard opens: if the focused field, or the block around it marked with
 *   `data-ow-keyboard-reveal` (field and buttons together), is not entirely
 *   visible, its scroll containers are scrolled just enough to bring it up.
 *   The browser does most of this on its own; this covers what it leaves
 *   under the keyboard's own bar.
 *
 * A WebView that resizes itself when the keyboard opens (Android's
 * adjustResize) reports a visual viewport as tall as the layout one: the box
 * is then the whole, already shortened, screen and nothing moves.
 */

/** The visible part of the layout viewport, in CSS pixels. */
export interface VisibleBox {
  /** Distance from the top of the layout viewport (what `position: fixed`
      and `getBoundingClientRect` measure from) to the top of what is seen. */
  top: number;
  height: number;
  /** Height of the layout viewport hidden below what is seen: the keyboard
      when one is open, 0 otherwise. */
  hiddenBelow: number;
}

/** The slice of `VisualViewport` the computation reads, so tests can fake it. */
export interface ViewportLike {
  readonly height: number;
  readonly offsetTop: number;
  readonly scale: number;
}

/** Below this, a shorter visual viewport is browser chrome moving, not a
    keyboard: the reveal nudge only fires for a real keyboard. */
const KEYBOARD_MIN_PX = 100;

/** Room kept between a revealed field and the edge of what is seen. */
const REVEAL_MARGIN_PX = 12;

/**
 * Pure: the visible box from the layout viewport height and the visual
 * viewport. Zoomed in with two fingers, the visual viewport is a magnified
 * window that has nothing to do with a keyboard, and pinning an overlay to it
 * would make the overlay chase the zoom: the whole layout viewport is
 * returned instead.
 */
export function visibleBox(innerHeight: number, vv: ViewportLike | null): VisibleBox {
  if (!vv || Math.abs(vv.scale - 1) > 0.01) {
    return { top: 0, height: innerHeight, hiddenBelow: 0 };
  }
  const top = Math.min(Math.max(vv.offsetTop, 0), innerHeight);
  const height = Math.min(Math.max(vv.height, 0), innerHeight - top);
  return { top, height, hiddenBelow: Math.max(0, innerHeight - top - height) };
}

/**
 * The height of the layout viewport, the box `position: fixed` is laid out
 * in. Not `window.innerHeight` alone: with the keyboard out, WebKit on the
 * iPhone shrinks `innerHeight` to what is left visible, while the layout
 * viewport (the root's `clientHeight`) keeps the height of the screen and is
 * merely slid under the keyboard. Measured against the shrunk height, the
 * visible box lost as many pixels as the page had slid, and the sheets
 * stopped that far above the keys (#608). The larger of the two is the
 * layout viewport everywhere: they are equal on a computer and in a view the
 * keyboard resizes, and a document without layout (tests) reports 0.
 */
export function layoutHeight(innerHeight: number, clientHeight: number): number {
  return Math.max(innerHeight, clientHeight);
}

/**
 * Pure: how far the screen runs on below the visible box, in CSS pixels: the
 * keyboard, plus what iOS slid the view down by. The screen is as tall as the
 * layout viewport and starts where the visible box starts, so this is the
 * layout height less the visible one, not `hiddenBelow`, which stops at the
 * bottom of the layout viewport. An overlay carries its backdrop this far down
 * (`.ow-visible-viewport` in index.css): the iPhone's keyboard is translucent
 * and the page must not show through it, nor in a gap above it (#608).
 */
export function screenBelow(innerHeight: number, box: VisibleBox): number {
  return Math.max(0, innerHeight - box.height);
}

/**
 * Pure: how far the content holding a block must scroll (positive: up, as
 * `scrollTop` grows) for the block to be seen whole, with a margin. A block
 * taller than what is seen gets its top shown, since that is where reading
 * starts.
 */
export function revealDelta(
  rect: { top: number; bottom: number },
  box: VisibleBox,
  margin = REVEAL_MARGIN_PX,
): number {
  const seenTop = box.top + margin;
  const seenBottom = box.top + box.height - margin;
  if (rect.bottom > seenBottom) {
    return Math.min(rect.bottom - seenBottom, Math.max(0, rect.top - seenTop));
  }
  if (rect.top < seenTop) return rect.top - seenTop;
  return 0;
}

/** Fields that bring up the on-screen keyboard. */
const NO_KEYBOARD_INPUTS = new Set([
  "button", "checkbox", "color", "date", "datetime-local", "file", "hidden",
  "image", "month", "radio", "range", "reset", "submit", "time", "week",
]);

function raisesKeyboard(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.readOnly && !NO_KEYBOARD_INPUTS.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

function scrollsVertically(el: Element, style: CSSStyleDeclaration): boolean {
  const { overflowY } = style;
  return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight;
}

/**
 * Brings the focused field into the visible box, by scrolling its scroll
 * containers, innermost first, then the page. Exported for the tests; the
 * tracker calls it when the keyboard opens and when the focus moves to
 * another field while it stays open.
 */
export function revealFocusedField(doc: Document, box: VisibleBox): void {
  const field = doc.activeElement;
  if (!raisesKeyboard(field)) return;
  const block = field.closest("[data-ow-keyboard-reveal]") ?? field;
  let rect = block.getBoundingClientRect();
  // A block taller than the visible box cannot be shown whole: the field it
  // holds is what matters.
  if (block !== field && rect.height > box.height - 2 * REVEAL_MARGIN_PX) {
    rect = field.getBoundingClientRect();
  }
  // Where the visible part starts, in the coordinates the rectangles above
  // are given in. A layer sized to the visible part (`.ow-visible-viewport`)
  // has its top edge exactly there, so its own rectangle says it whatever the
  // browser measures from: the iPhone, keyboard out, has been seen reporting
  // the field as in view against `box.top` while it sat under the keys.
  const layer = block.closest(".ow-visible-viewport");
  const seen = layer ? { ...box, top: layer.getBoundingClientRect().top } : box;
  let remaining = revealDelta(rect, seen);
  for (let el = block.parentElement; el && remaining !== 0; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (scrollsVertically(el, style)) {
      const before = el.scrollTop;
      el.scrollTop = before + remaining;
      remaining -= el.scrollTop - before;
    }
    // Scrolling the page would not move a box pinned to the screen.
    if (style.position === "fixed") return;
  }
  if (remaining !== 0) doc.defaultView?.scrollBy(0, remaining);
}

// ── Store ────────────────────────────────────────────────────────────────

let current: VisibleBox =
  typeof window === "undefined"
    ? { top: 0, height: 0, hiddenBelow: 0 }
    : visibleBox(
        layoutHeight(window.innerHeight, window.document.documentElement.clientHeight),
        window.visualViewport ?? null,
      );
const listeners = new Set<() => void>();
let started = false;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): VisibleBox {
  return current;
}

/** The visible box, kept in sync with the keyboard and the browser chrome. */
export function useVisibleViewport(): VisibleBox {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Starts the tracker. Once per page, from `main.tsx`; a second call is a
 * no-op. Without `visualViewport` (old browsers) the CSS variables are never
 * written and `.ow-visible-viewport` falls back to the whole screen, which is
 * what every overlay did before.
 */
export function startVisibleViewport(win: Window = window): void {
  const vv = win.visualViewport;
  if (started || !vv) return;
  started = true;
  const root = win.document.documentElement;
  let frame = 0;
  let keyboardOpen = false;

  const apply = () => {
    frame = 0;
    const full = layoutHeight(win.innerHeight, root.clientHeight);
    const next = visibleBox(full, vv);
    const moved =
      next.top !== current.top ||
      next.height !== current.height ||
      next.hiddenBelow !== current.hiddenBelow;
    if (moved) {
      current = next;
      for (const listener of listeners) listener();
    }
    root.style.setProperty("--ow-vv-top", `${next.top}px`);
    root.style.setProperty("--ow-vv-height", `${next.height}px`);
    const below = screenBelow(full, next);
    root.style.setProperty("--ow-vv-below", `${below}px`);
    // What the keyboard takes off the screen, not what is left under the
    // visible box in the layout viewport: once the page has slid under the
    // keyboard the latter is smaller by that slide.
    const open = below >= KEYBOARD_MIN_PX;
    // On the opening only: once it is open, the reader scrolls as they like.
    // Again each time the visible part moves while the keyboard is out: the
    // iPhone slides the page in several steps as the keyboard comes up, and
    // a field brought into view at the first may be back under it at the last.
    if (open && (!keyboardOpen || moved)) revealFocusedField(win.document, next);
    keyboardOpen = open;
  };
  // One update per frame: iOS fires a burst of events while the keyboard
  // slides in.
  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(apply);
  };

  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  win.addEventListener("resize", schedule);
  // From one field to the next with the keyboard up (the arrows of the iOS
  // bar, or a tap): no resize happens, the new field still has to be seen.
  win.document.addEventListener("focusin", () => {
    if (keyboardOpen) win.requestAnimationFrame(() => revealFocusedField(win.document, current));
  });
  apply();
}
