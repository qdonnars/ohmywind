// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef, type RefObject } from "react";

/**
 * "Press and hold here", over an element that also handles clicks and drags.
 *
 * The gesture the spot map is built around: hold a finger on the water for a
 * moment and a spot dialog opens there. Written on Pointer Events, one stream
 * for mouse and touch alike, because the touch-only APIs and the HTML5 drag
 * API each miss half the devices (see the Firefox Android drag regression in
 * `docs/qa/user-journeys.md`, J10).
 *
 * Three details carry the behaviour, and all three came from bugs:
 *
 * - **A second finger cancels.** A pinch-zoom starts as a press; without the
 *   pointer count, zooming into a bay dropped a dialog on it.
 * - **Movement cancels.** Panning the map is a press that travels; past a few
 *   pixels of travel it is a drag, not a hold.
 * - **The press swallows the click that follows it.** A pointerup is followed
 *   by a click, so the hold that opened the dialog would immediately fire the
 *   element's own click handler underneath it. The returned ref is raised the
 *   moment the press fires and lowered on the tick after pointerup, which is
 *   exactly one click later.
 *
 * A right click takes the same exit, immediately, and the browser context menu
 * is suppressed so the dialog is the only surface offered.
 */

export interface LongPressDetail {
  /** Viewport coordinates of the press, i.e. of the initial pointerdown. */
  clientX: number;
  clientY: number;
  /** What was under the pointer. Callers map it back to their own model. */
  target: Element;
}

interface UseLongPressOptions {
  /** Fires after `delayMs` of a still press, or straight away on right click. */
  onPress: (detail: LongPressDetail) => void;
  /**
   * Consulted at pointerdown, and again on right click, before anything is
   * armed. Return false to let this press through untouched: the spot map uses
   * it to leave taps on markers it does not own alone.
   */
  shouldPress?: (target: Element) => boolean;
  /** How long the press has to be held. 400 ms reads as deliberate without
      feeling slow, and sits under the ~500 ms of the native context menu. */
  delayMs?: number;
  /** Past this much travel, the gesture is a drag. */
  moveTolerancePx?: number;
}

/**
 * Returns the click-suppression flag: true between the press firing and the
 * click it produces. A click handler on the same element reads it, ignores
 * that one click, and lowers it. The ref keeps its identity for the life of
 * the component, so a handler wired once can hold on to it.
 */
export function useLongPress(
  targetRef: RefObject<HTMLElement | null>,
  options: UseLongPressOptions,
): RefObject<boolean> {
  const { delayMs = 400, moveTolerancePx = 10 } = options;

  // The callbacks are read at event time, never at effect time: re-arming the
  // listeners on every render of the parent would drop a press in flight.
  const onPressRef = useRef(options.onPress);
  const shouldPressRef = useRef(options.shouldPress);
  useEffect(() => {
    onPressRef.current = options.onPress;
    shouldPressRef.current = options.shouldPress;
  }, [options.onPress, options.shouldPress]);

  const clickSuppressedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let activePointers = 0;

    const cancel = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      activePointers++;
      if (activePointers > 1) {
        cancel();
        return;
      }

      startX = e.clientX;
      startY = e.clientY;
      const target = e.target as Element;
      if (shouldPressRef.current && !shouldPressRef.current(target)) return;

      // Captured, not read from the closure at fire time: the press that
      // fires is the one whose coordinates the caller is owed.
      const pressX = startX;
      const pressY = startY;
      timerRef.current = setTimeout(() => {
        clickSuppressedRef.current = true;
        onPressRef.current({ clientX: pressX, clientY: pressY, target });
      }, delayMs);
    };

    const handlePointerUp = () => {
      activePointers = Math.max(0, activePointers - 1);
      cancel();
      // The click that follows this pointerup runs first; clearing on the
      // next tick means one press swallows exactly one click, and a later
      // tap is honoured normally.
      setTimeout(() => {
        clickSuppressedRef.current = false;
      }, 0);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (
        Math.abs(e.clientX - startX) > moveTolerancePx ||
        Math.abs(e.clientY - startY) > moveTolerancePx
      ) {
        cancel();
      }
    };

    // Right click, desktop: same outcome as a hold, without the wait.
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      cancel();
      const target = e.target as Element;
      if (shouldPressRef.current && !shouldPressRef.current(target)) return;
      onPressRef.current({ clientX: e.clientX, clientY: e.clientY, target });
    };

    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      cancel();
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [targetRef, delayMs, moveTolerancePx]);

  return clickSuppressedRef;
}
