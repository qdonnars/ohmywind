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
 *   label above the table. Which column that is comes from the header cells'
 *   real positions, measured once per timeline (and again on resize), not
 *   from a nominal width: the cells are content-sized, 32 px on a phone and
 *   56 px on a desktop, and a constant of 36 drifted the label by an hour a
 *   day until the badge still said the 17th on the 18th's morning (#413).
 *   `cellWidthPx` is the fallback before the table is laid out.
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

/** Left edge, in the scroller's content, of every hour column. */
type ColumnLefts = readonly number[];

/**
 * The column read as leftmost when the visible strip starts at `x`: the
 * first one at least half in view. A column showing only its last few
 * pixels under the edge does not name the day: that was the other half of
 * #413, a strip full of the 18th labelled after the 17th's 23:00 sliver.
 */
function leftmostColumn(lefts: ColumnLefts, x: number): number {
  let lo = 0;
  let hi = lefts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lefts[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  if (lo + 1 < lefts.length && (lefts[lo] + lefts[lo + 1]) / 2 < x) return lo + 1;
  return lo;
}

/**
 * The hour columns' left edges, read from the header cells. `null` when the
 * table is not laid out (hidden, or under jsdom), in which case the callers
 * fall back to the nominal width.
 */
function measureColumns(el: HTMLElement, count: number): ColumnLefts | null {
  const cells = el.querySelectorAll<HTMLElement>('th[scope="col"]');
  if (count === 0 || cells.length !== count) return null;
  const origin = el.getBoundingClientRect().left - el.scrollLeft;
  const lefts = Array.from(cells, (cell) => cell.getBoundingClientRect().left - origin);
  return lefts[lefts.length - 1] > 0 ? lefts : null;
}

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
  // Measured on every timeline change and on resize; null until laid out.
  const columnLeftsRef = useRef<ColumnLefts | null>(null);

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
    const lefts = columnLeftsRef.current;
    // The sticky first column hides the start of the strip: the first hour
    // column begins where it ends, so that is where "visible" starts.
    const leftmostIdx = lefts
      ? leftmostColumn(lefts, el.scrollLeft + lefts[0])
      : Math.max(0, Math.floor(el.scrollLeft / cellWidthPx));
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
    const el = scrollRef.current;
    if (!el || masterTimeline.length === 0) return;
    const lefts = measureColumns(el, masterTimeline.length);
    columnLeftsRef.current = lefts;
    const hasAnchor = leftmostHourRef.current != null;
    const anchor = leftmostHourRef.current ?? nowHour;
    const idx = masterTimeline.findIndex((t) => t.startsWith(anchor.slice(0, 13)));
    const nearestIdx =
      idx >= 0 ? idx : masterTimeline.findIndex((t) => t > anchor.slice(0, 13));
    if (nearestIdx > 0) {
      const offset = hasAnchor ? 0 : 60;
      // Measured: the column's own edge, brought out from under the sticky
      // first column so it is the leftmost one actually in view.
      const left = lefts ? lefts[nearestIdx] - lefts[0] : nearestIdx * cellWidthPx;
      el.scrollLeft = Math.max(0, left - offset);
    }
    checkScrollEnd();
  }, [masterTimeline, nowHour, checkScrollEnd, cellWidthPx]);

  // The columns move when the table does: a phone turned sideways crosses
  // the breakpoint that doubles them, and the webfont landing after the
  // first paint reflows every cell. Re-measure, and re-read the day.
  useEffect(() => {
    const el = scrollRef.current;
    const table = el?.firstElementChild;
    if (!el || !table || masterTimeline.length === 0) return;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      columnLeftsRef.current = measureColumns(el, masterTimeline.length);
      updateVisibleDay();
    });
    ro.observe(table);
    return () => ro.disconnect();
  }, [masterTimeline, updateVisibleDay]);

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
