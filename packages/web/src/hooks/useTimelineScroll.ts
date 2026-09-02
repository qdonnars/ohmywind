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

  return { scrollRef, scrolledEnd, visibleDay, dayStarts };
}
