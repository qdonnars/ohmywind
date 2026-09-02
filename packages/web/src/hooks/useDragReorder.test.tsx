// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { DRAG_HANDLE_CLASS, useDragReorder } from "./useDragReorder";

// jsdom ships neither PointerEvent nor pointer capture. The hook only reads
// clientX/clientY, button and pointerType, and treats capture as best-effort.
function pointerEvent(
  type: string,
  init: { clientY?: number; clientX?: number; pointerType?: string; button?: number } = {},
): Event {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
  });
  Object.defineProperty(e, "pointerType", { value: init.pointerType ?? "touch" });
  Object.defineProperty(e, "pointerId", { value: 1 });
  return e;
}

const ROW_H = 40;

function Harness({
  order,
  onCommit,
}: {
  order: string[];
  onCommit: (next: string[]) => void;
}) {
  const { listRef, previewOrder, dragging, rowProps } = useDragReorder(order, onCommit);
  return (
    <div>
      <span data-testid="preview">{previewOrder.join(",")}</span>
      <span data-testid="dragging">{dragging ?? ""}</span>
      <ol ref={listRef}>
        {previewOrder.map((item, i) => (
          <li key={item} data-testid={`row-${item}`} {...rowProps(item, i)}>
            <span className={DRAG_HANDLE_CLASS} data-testid={`handle-${item}`}>
              handle
            </span>
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Each row occupies a 40 px band, so a clientY picks a target slot. */
function layOutRows(container: HTMLElement) {
  const rows = [...container.querySelectorAll("li")];
  rows.forEach((row, i) => {
    row.getBoundingClientRect = () =>
      ({ top: i * ROW_H, height: ROW_H, bottom: (i + 1) * ROW_H, left: 0, right: 100, width: 100, x: 0, y: i * ROW_H, toJSON: () => ({}) }) as DOMRect;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDragReorder", () => {
  const ORDER = ["AROME", "ICON", "ECMWF", "GFS"];

  it("grabs a row straight away with a mouse", () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(<Harness order={ORDER} onCommit={onCommit} />);
    act(() => {
      getByTestId("row-AROME").dispatchEvent(pointerEvent("pointerdown", { pointerType: "mouse" }));
    });
    expect(getByTestId("dragging").textContent).toBe("AROME");
  });

  it("grabs straight away from the handle, even at a finger", () => {
    const { getByTestId } = render(<Harness order={ORDER} onCommit={vi.fn()} />);
    act(() => {
      getByTestId("handle-ICON").dispatchEvent(pointerEvent("pointerdown"));
    });
    expect(getByTestId("dragging").textContent).toBe("ICON");
  });

  it("waits for the hold before lifting a row under a finger", () => {
    const { getByTestId } = render(<Harness order={ORDER} onCommit={vi.fn()} />);
    act(() => {
      getByTestId("row-AROME").dispatchEvent(pointerEvent("pointerdown"));
    });
    expect(getByTestId("dragging").textContent).toBe("");
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(getByTestId("dragging").textContent).toBe("AROME");
  });

  it("cancels the hold when the finger travels: that is a scroll", () => {
    const { getByTestId } = render(<Harness order={ORDER} onCommit={vi.fn()} />);
    const row = getByTestId("row-AROME");
    act(() => {
      row.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
      row.dispatchEvent(pointerEvent("pointermove", { clientY: 40 }));
      vi.advanceTimersByTime(400);
    });
    expect(getByTestId("dragging").textContent).toBe("");
  });

  it("tolerates a few pixels of tremor during the hold", () => {
    const { getByTestId } = render(<Harness order={ORDER} onCommit={vi.fn()} />);
    const row = getByTestId("row-AROME");
    act(() => {
      row.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
      row.dispatchEvent(pointerEvent("pointermove", { clientY: 5 }));
      vi.advanceTimersByTime(400);
    });
    expect(getByTestId("dragging").textContent).toBe("AROME");
  });

  it("previews the new order live, then commits it on release", () => {
    const onCommit = vi.fn();
    const { container, getByTestId } = render(<Harness order={ORDER} onCommit={onCommit} />);
    layOutRows(container);
    const row = getByTestId("row-AROME");
    act(() => {
      row.dispatchEvent(pointerEvent("pointerdown", { pointerType: "mouse", clientY: 20 }));
    });
    act(() => {
      layOutRows(container);
      // Down to the third band: centre of row index 2 is at y = 100.
      row.dispatchEvent(pointerEvent("pointermove", { clientY: 100 }));
    });
    expect(getByTestId("preview").textContent).toBe("ICON,ECMWF,AROME,GFS");
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      row.dispatchEvent(pointerEvent("pointerup", { clientY: 100 }));
    });
    expect(onCommit).toHaveBeenCalledWith(["ICON", "ECMWF", "AROME", "GFS"]);
    expect(getByTestId("dragging").textContent).toBe("");
  });

  it("reverts to the stored order when the browser reclaims the gesture", () => {
    const onCommit = vi.fn();
    const { container, getByTestId } = render(<Harness order={ORDER} onCommit={onCommit} />);
    layOutRows(container);
    const row = getByTestId("row-AROME");
    act(() => {
      row.dispatchEvent(pointerEvent("pointerdown", { pointerType: "mouse", clientY: 20 }));
    });
    act(() => {
      layOutRows(container);
      row.dispatchEvent(pointerEvent("pointermove", { clientY: 100 }));
    });
    act(() => {
      row.dispatchEvent(pointerEvent("pointercancel"));
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(getByTestId("preview").textContent).toBe(ORDER.join(","));
  });

  it("ignores a right-button press", () => {
    const { getByTestId } = render(<Harness order={ORDER} onCommit={vi.fn()} />);
    act(() => {
      getByTestId("row-AROME").dispatchEvent(
        pointerEvent("pointerdown", { pointerType: "mouse", button: 2 }),
      );
      vi.advanceTimersByTime(400);
    });
    expect(getByTestId("dragging").textContent).toBe("");
  });

  it("commits nothing when a release follows no drag", () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(<Harness order={ORDER} onCommit={onCommit} />);
    act(() => {
      getByTestId("row-AROME").dispatchEvent(pointerEvent("pointerup"));
    });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
