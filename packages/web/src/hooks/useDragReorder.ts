// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Reordering a list by dragging a row, on a touchscreen as on a desktop.
 *
 * Written on Pointer Events, not on the HTML5 drag-and-drop API: Firefox
 * Android never fires `dragstart` from a finger, so long-pressing a row did
 * nothing there while Chrome, which does synthesise touch drags, worked (bug
 * reported 2026-08-02, parcours J10 of `docs/qa/user-journeys.md`). Pointer
 * events behave identically everywhere.
 *
 * Two ways in, because a finger and a mouse do not compete for the same thing:
 *
 * - **A mouse, or the dedicated handle**, grabs immediately. Neither competes
 *   with page scrolling; the handle opts out through `touch-action: none`.
 * - **A finger on the row body** arms a hold. A still finger for `HOLD_MS`
 *   lifts the row, which is the pattern native lists use; real movement before
 *   that cancels the hold and lets the page scroll, so a quick swipe over the
 *   list stays a swipe.
 *
 * Once a row is lifted, native scrolling must stop competing for the touch.
 * `touch-action` cannot change mid-gesture and React registers `touchmove` as
 * passive, so the `preventDefault` goes through a manual non-passive listener
 * on the list.
 *
 * The caller stays the owner of the order: this hook reports the order being
 * previewed and calls `onCommit` on drop, but never stores the list itself.
 */

/** A still finger for this long lifts the row. */
const HOLD_MS = 350;
/** Movement beyond this before the hold fires means the user meant to scroll. */
const HOLD_SLOP_PX = 10;
/** Class the dedicated grab handle carries; a press on it skips the hold. */
export const DRAG_HANDLE_CLASS = "config-handle";

export interface DragReorder<T> {
  /** Attach to the list element (`<ol>`, `<ul>`, ...). */
  listRef: React.RefObject<HTMLOListElement | null>;
  /** The order to render: `order`, with the dragged item spliced to the slot
      under the pointer, so the list visibly shifts in real time. */
  previewOrder: T[];
  /** The item being dragged, for the lifted-row styling. Null at rest. */
  dragging: T | null;
  /** Pointer handlers to spread on each row. */
  rowProps: (item: T, index: number) => {
    onPointerDown: (e: React.PointerEvent<HTMLLIElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLLIElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLLIElement>) => void;
    onPointerCancel: () => void;
  };
}

export function useDragReorder<T>(
  order: T[],
  onCommit: (next: T[]) => void,
): DragReorder<T> {
  // Tracked by item identity, not by index: the visual index of the dragged
  // row shifts as the preview reorders, and we must not lose track of it.
  const [dragItem, setDragItem] = useState<T | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const previewOrder = useMemo<T[]>(() => {
    if (dragItem == null || overIdx == null) return order;
    const from = order.indexOf(dragItem);
    if (from < 0 || from === overIdx) return order;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(overIdx, 0, item);
    return next;
  }, [order, dragItem, overIdx]);

  // Row whose vertical centre is closest to the pointer. Pointer capture means
  // move events keep firing on the row where the drag started, so the target
  // slot has to come from geometry rather than from event targets.
  const targetIndexFromY = useCallback((clientY: number): number | null => {
    const list = listRef.current;
    if (!list) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    [...list.children].forEach((row, i) => {
      const r = (row as HTMLElement).getBoundingClientRect();
      const d = Math.abs(clientY - (r.top + r.height / 2));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }, []);

  const holdRef = useRef<{
    timer: number;
    x: number;
    y: number;
    pointerId: number;
    row: HTMLLIElement;
  } | null>(null);

  const dragActiveRef = useRef(false);
  useEffect(() => {
    dragActiveRef.current = dragItem != null;
  }, [dragItem]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const block = (e: TouchEvent) => {
      if (dragActiveRef.current) e.preventDefault();
    };
    list.addEventListener("touchmove", block, { passive: false });
    return () => list.removeEventListener("touchmove", block);
  }, []);

  const clearHold = useCallback(() => {
    if (holdRef.current) {
      window.clearTimeout(holdRef.current.timer);
      holdRef.current = null;
    }
  }, []);

  const activateDrag = useCallback(
    (row: HTMLLIElement, pointerId: number, item: T, idx: number) => {
      // Capture can be refused (pointer already lifted, synthetic events in
      // tests); the drag still works without it since the target slot is
      // computed from geometry, capture just avoids losing fast pointers.
      try {
        row.setPointerCapture(pointerId);
      } catch {
        /* best-effort */
      }
      setDragItem(item);
      setOverIdx(idx);
    },
    [],
  );

  const rowProps = useCallback(
    (item: T, index: number) => ({
      onPointerDown: (e: React.PointerEvent<HTMLLIElement>) => {
        if (e.button !== 0) return;
        const onHandle = !!(e.target as HTMLElement).closest(`.${DRAG_HANDLE_CLASS}`);
        if (e.pointerType === "mouse" || onHandle) {
          e.preventDefault();
          activateDrag(e.currentTarget, e.pointerId, item, index);
          return;
        }
        // Touch on the row body: no preventDefault, a quick swipe must stay a
        // scroll. Arm the hold instead.
        const row = e.currentTarget;
        clearHold();
        holdRef.current = {
          x: e.clientX,
          y: e.clientY,
          pointerId: e.pointerId,
          row,
          timer: window.setTimeout(() => {
            if (holdRef.current?.row === row) {
              const { pointerId } = holdRef.current;
              holdRef.current = null;
              activateDrag(row, pointerId, item, index);
            }
          }, HOLD_MS),
        };
      },
      onPointerMove: (e: React.PointerEvent<HTMLLIElement>) => {
        if (dragItem != null) {
          const idx = targetIndexFromY(e.clientY);
          if (idx != null && idx !== overIdx) setOverIdx(idx);
          return;
        }
        const hold = holdRef.current;
        if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > HOLD_SLOP_PX) {
          clearHold();
        }
      },
      onPointerUp: (e: React.PointerEvent<HTMLLIElement>) => {
        clearHold();
        if (dragItem == null) return;
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        onCommit(previewOrder);
        setDragItem(null);
        setOverIdx(null);
      },
      onPointerCancel: () => {
        // Browser reclaimed the gesture (a system interruption, say): revert.
        // The preview falls back to `order` once dragItem is null.
        clearHold();
        setDragItem(null);
        setOverIdx(null);
      },
    }),
    [activateDrag, clearHold, dragItem, onCommit, overIdx, previewOrder, targetIndexFromY],
  );

  return { listRef, previewOrder, dragging: dragItem, rowProps };
}
