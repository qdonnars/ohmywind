// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The horizontal-scroll behaviour the three forecast timelines share.
 *
 * `WindTable`, `MarineTable` and `TideChart` are three readings of the same
 * hourly axis, side by side under the same header. They carried three copies
 * of this logic, comment for comment, and a fix in one silently left the other
 * two behind.
 *
 * Four things happen here:
 *
 * - **Day boundaries.** The first timestamp of each day, so a cell can draw
 *   the separator that makes the table scannable.
 * - **The day being read.** The leftmost visible column drives the sticky day
 *   label above the table.
 * - **End of scroll.** Whether the fade-out on the right edge should show.
 * - **Mouse drag.** A press-and-drag with a mouse pans the table, as a thumb
 *   does on a phone; on a desktop the only other way across the week was the
 *   scrollbar under the last row.
 * - **Anchor restoration.** The leftmost hour is remembered across timeline
 *   changes, so switching spots comes back to the same "+3 days" window rather
 *   than jumping to now. On the very first render of a session there is no
 *   anchor, and the table lands on the current hour with a 60 px offset so one
 *   cell of the past stays visible. That offset is *not* applied when
 *   restoring: the anchor hour already is the leftmost cell wanted, and
 *   subtracting 60 again would drift the table a few pixels every switch.
 */

export interface TimelineScroll {
  /** Attach to the scrolling container. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** True once the container is scrolled to its right end. */
  scrolledEnd: boolean;
  /** "YYYY-MM-DD" of the leftmost visible column. */
  visibleDay: string;
  /** Timestamps that start a new day, for the column separators. */
  dayStarts: Set<string>;
}

export function useTimelineScroll(
  masterTimeline: string[],
  cellWidthPx: number,
  nowHour: string,
): TimelineScroll {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [visibleDay, setVisibleDay] = useState("");

  const dayStarts = useMemo(() => {
    const set = new Set<string>();
    let prev = "";
    for (const t of masterTimeline) {
      const day = t.slice(0, 10);
      if (day !== prev) {
        set.add(t);
        prev = day;
      }
    }
    return set;
  }, [masterTimeline]);

  // Independent from `selectedHour`, which only drives the arrow on the map
  // and the highlighted cell: dragging the slider scrolls the table without
  // selecting an hour, and the same window is expected back on the next spot.
  const leftmostHourRef = useRef<string | null>(null);

  const updateVisibleDay = useCallback(() => {
    const el = scrollRef.current;
    if (!el || masterTimeline.length === 0) return;
    const leftmostIdx = Math.max(0, Math.floor(el.scrollLeft / cellWidthPx));
    const t = masterTimeline[Math.min(leftmostIdx, masterTimeline.length - 1)];
    if (t) {
      setVisibleDay(t.slice(0, 10));
      leftmostHourRef.current = t;
    }
  }, [masterTimeline, cellWidthPx]);

  const checkScrollEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
    setScrolledEnd(atEnd);
    updateVisibleDay();
  }, [updateVisibleDay]);

  useEffect(() => {
    if (!scrollRef.current || masterTimeline.length === 0) return;
    const hasAnchor = leftmostHourRef.current != null;
    const anchor = leftmostHourRef.current ?? nowHour;
    const idx = masterTimeline.findIndex((t) => t.startsWith(anchor.slice(0, 13)));
    const nearestIdx =
      idx >= 0 ? idx : masterTimeline.findIndex((t) => t > anchor.slice(0, 13));
    if (nearestIdx > 0) {
      const offset = hasAnchor ? 0 : 60;
      scrollRef.current.scrollLeft = Math.max(0, nearestIdx * cellWidthPx - offset);
    }
    checkScrollEnd();
  }, [masterTimeline, nowHour, checkScrollEnd, cellWidthPx]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScrollEnd, { passive: true });
    return () => el.removeEventListener("scroll", checkScrollEnd);
  }, [checkScrollEnd]);

  // Drag-to-scroll, mouse only: touch already pans natively. A press that
  // travels less than the threshold is still a click on a cell; past it the
  // click that closes the gesture is swallowed, so a drag never also selects
  // an hour. While dragging, `is-dragging` turns the smooth scrolling and the
  // snapping off (index.css): both fight a hand moving the scroll position
  // sixty times a second.
  useEffect(() => {
    const el = scrollRef.current;
    // No timeline, no table: the ref points at nothing worth listening to.
    if (!el || masterTimeline.length === 0) return;
    const DRAG_PX = 4;
    let pressed = false;
    let dragged = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      pressed = true;
      dragged = false;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = el.scrollLeft;
      startTop = el.scrollTop;
    };
    const onMove = (e: PointerEvent) => {
      if (!pressed) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragged && Math.abs(dx) < DRAG_PX && Math.abs(dy) < DRAG_PX) return;
      if (!dragged) {
        dragged = true;
        el.classList.add("is-dragging");
        el.setPointerCapture?.(e.pointerId);
      }
      el.scrollLeft = startLeft - dx;
      el.scrollTop = startTop - dy;
      e.preventDefault();
    };
    const onUp = () => {
      pressed = false;
      el.classList.remove("is-dragging");
    };
    const onClick = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
    // Re-attached when the timeline changes, like the scroll listener above:
    // while a spot loads the table is a skeleton and the ref points nowhere,
    // so an effect run once at mount would never meet the real scroller.
  }, [masterTimeline]);

  return { scrollRef, scrolledEnd, visibleDay, dayStarts };
}
