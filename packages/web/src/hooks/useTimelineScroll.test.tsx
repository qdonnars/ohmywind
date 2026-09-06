// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useTimelineScroll } from "./useTimelineScroll";

const CELL_W = 36;

function hours(count: number, startDay = 2): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const day = String(startDay + Math.floor(i / 24)).padStart(2, "0");
    const hour = String(i % 24).padStart(2, "0");
    out.push(`2026-09-${day}T${hour}:00`);
  }
  return out;
}

function Harness({ times, nowHour }: { times: string[]; nowHour: string }) {
  const { scrollRef, scrolledEnd, visibleDay, dayStarts } = useTimelineScroll(
    times,
    CELL_W,
    nowHour,
  );
  return (
    <div>
      <div data-testid="scroller" ref={scrollRef} />
      <span data-testid="end">{String(scrolledEnd)}</span>
      <span data-testid="day">{visibleDay}</span>
      <span data-testid="starts">{[...dayStarts].join(",")}</span>
    </div>
  );
}

/** jsdom lays nothing out, so the scroll box is faked with plain properties. */
function sizeScroller(el: HTMLElement, { scrollWidth = 3600, clientWidth = 400 } = {}) {
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
}

describe("useTimelineScroll", () => {
  it("marks the first hour of each day", () => {
    const { getByTestId } = render(<Harness times={hours(48)} nowHour="2026-09-02T00" />);
    expect(getByTestId("starts").textContent).toBe("2026-09-02T00:00,2026-09-03T00:00");
  });

  it("marks nothing for an empty timeline", () => {
    const { getByTestId } = render(<Harness times={[]} nowHour="2026-09-02T00" />);
    expect(getByTestId("starts").textContent).toBe("");
  });

  it("reports the day of the leftmost visible column", () => {
    const times = hours(72);
    const { getByTestId } = render(<Harness times={times} nowHour="2026-09-02T00" />);
    const el = getByTestId("scroller");
    sizeScroller(el);
    // Scroll to the 30th column, i.e. 06:00 on the second day.
    el.scrollLeft = 30 * CELL_W;
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(getByTestId("day").textContent).toBe("2026-09-03");
  });

  it("clamps the leftmost column to the end of the timeline", () => {
    const times = hours(24);
    const { getByTestId } = render(<Harness times={times} nowHour="2026-09-02T00" />);
    const el = getByTestId("scroller");
    sizeScroller(el, { scrollWidth: 24 * CELL_W, clientWidth: 400 });
    el.scrollLeft = 999 * CELL_W;
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(getByTestId("day").textContent).toBe("2026-09-02");
  });

  it("raises scrolledEnd only once the right edge is reached", () => {
    const times = hours(72);
    const { getByTestId } = render(<Harness times={times} nowHour="2026-09-02T00" />);
    const el = getByTestId("scroller");
    sizeScroller(el, { scrollWidth: 2000, clientWidth: 400 });

    el.scrollLeft = 800;
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(getByTestId("end").textContent).toBe("false");

    el.scrollLeft = 1600;
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(getByTestId("end").textContent).toBe("true");
  });

  it("lands on the current hour with a context offset on first render", () => {
    const times = hours(72);
    const { getByTestId } = render(<Harness times={times} nowHour="2026-09-02T10" />);
    const el = getByTestId("scroller") as HTMLDivElement;
    // Column 10 is 10:00 on the first day; 60 px of the past stay visible.
    expect(el.scrollLeft).toBe(10 * CELL_W - 60);
  });

  it("restores the anchor exactly, with no offset, when the timeline changes", () => {
    const times = hours(72);
    const { getByTestId, rerender } = render(
      <Harness times={times} nowHour="2026-09-02T10" />,
    );
    const el = getByTestId("scroller") as HTMLDivElement;
    sizeScroller(el);
    el.scrollLeft = 30 * CELL_W;
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    // A different array with the same hours: the switch-spot case.
    rerender(<Harness times={hours(72)} nowHour="2026-09-02T10" />);
    // Back on the anchored column, and this time without the 60 px offset,
    // which would otherwise drift the table a little on every switch.
    expect(el.scrollLeft).toBe(30 * CELL_W);
  });

  it("pans with a mouse drag and swallows the click that ends it", () => {
    const onCell = vi.fn();
    function DragHarness() {
      const { scrollRef } = useTimelineScroll(hours(48), CELL_W, "2026-09-02T00");
      return (
        <div data-testid="scroller" ref={scrollRef}>
          <button type="button" data-testid="cell" onClick={onCell}>
            cell
          </button>
        </div>
      );
    }
    const { getByTestId } = render(<DragHarness />);
    const el = getByTestId("scroller");
    sizeScroller(el);
    el.scrollLeft = 200;
    const pointer = (type: string, x: number, pointerType = "mouse") => {
      const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10, button: 0 });
      Object.defineProperty(ev, "pointerType", { value: pointerType });
      Object.defineProperty(ev, "pointerId", { value: 1 });
      el.dispatchEvent(ev);
    };

    pointer("pointerdown", 100);
    pointer("pointermove", 102); // under the threshold: still a click
    expect(el.scrollLeft).toBe(200);
    expect(el.classList.contains("is-dragging")).toBe(false);

    pointer("pointermove", 150); // dragged 50 px to the right: content follows
    expect(el.scrollLeft).toBe(150);
    expect(el.classList.contains("is-dragging")).toBe(true);
    pointer("pointerup", 150);
    expect(el.classList.contains("is-dragging")).toBe(false);

    getByTestId("cell").click(); // the click closing the drag selects nothing
    expect(onCell).not.toHaveBeenCalled();
    getByTestId("cell").click(); // a plain click still does
    expect(onCell).toHaveBeenCalledTimes(1);

    pointer("pointerdown", 100, "touch"); // touch pans natively: not ours
    pointer("pointermove", 300, "touch");
    expect(el.scrollLeft).toBe(150);
  });
});
