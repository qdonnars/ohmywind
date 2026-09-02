// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { useLongPress, type LongPressDetail } from "./useLongPress";

// jsdom ships no PointerEvent, and Testing Library's fireEvent would not carry
// `pointerType` or `button` anyway. A minimal stand-in built on MouseEvent is
// enough: the hook only reads clientX/clientY, target, pointerType and button.
function pointerEvent(
  type: string,
  init: { clientX?: number; clientY?: number; pointerType?: string; button?: number } = {},
): Event {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
  });
  Object.defineProperty(e, "pointerType", { value: init.pointerType ?? "touch" });
  return e;
}

function Harness({
  onPress,
  shouldPress,
}: {
  onPress: (d: LongPressDetail) => void;
  shouldPress?: (t: Element) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const clickSuppressedRef = useLongPress(ref, { onPress, shouldPress });
  return (
    <div
      ref={ref}
      data-testid="surface"
      onClick={() => {
        if (clickSuppressedRef.current) {
          clickSuppressedRef.current = false;
          return;
        }
        onPress({ clientX: -1, clientY: -1, target: document.body });
      }}
    >
      <span data-testid="child">enfant</span>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function press(el: Element, at = { clientX: 10, clientY: 20 }) {
  act(() => {
    el.dispatchEvent(pointerEvent("pointerdown", at));
  });
}

function hold(ms = 400) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function release() {
  act(() => {
    window.dispatchEvent(pointerEvent("pointerup"));
  });
}

describe("useLongPress", () => {
  it("fires after the hold, with the coordinates of the press", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(<Harness onPress={onPress} />);
    press(getByTestId("child"), { clientX: 120, clientY: 240 });
    expect(onPress).not.toHaveBeenCalled();
    hold();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress.mock.calls[0][0]).toMatchObject({ clientX: 120, clientY: 240 });
    expect((onPress.mock.calls[0][0] as LongPressDetail).target).toBe(getByTestId("child"));
  });

  it("does not fire when the press is released early", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(<Harness onPress={onPress} />);
    press(getByTestId("surface"));
    hold(200);
    release();
    hold(400);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not fire when the pointer travels: that is a drag", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(<Harness onPress={onPress} />);
    press(getByTestId("surface"), { clientX: 100, clientY: 100 });
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 140, clientY: 100 }));
    });
    hold();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("tolerates a few pixels of tremor", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(<Harness onPress={onPress} />);
    press(getByTestId("surface"), { clientX: 100, clientY: 100 });
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 105, clientY: 103 }));
    });
    hold();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire on a second finger: a pinch is not a hold", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(<Harness onPress={onPress} />);
    const el = getByTestId("surface");
    press(el);
    press(el, { clientX: 200, clientY: 200 });
    hold();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("ignores a right button press", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(<Harness onPress={onPress} />);
    press(getByTestId("surface"), { clientX: 10, clientY: 10 });
    act(() => {
      getByTestId("surface").dispatchEvent(
        pointerEvent("pointerdown", { pointerType: "mouse", button: 2 }),
      );
    });
    hold();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("honours shouldPress, so a press on an excluded target arms nothing", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(
      <Harness onPress={onPress} shouldPress={(t) => t.tagName.toLowerCase() !== "span"} />,
    );
    press(getByTestId("child"));
    hold();
    expect(onPress).not.toHaveBeenCalled();
    release();
    press(getByTestId("surface"));
    hold();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("swallows the click the press produces, and only that one", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(<Harness onPress={onPress} />);
    const el = getByTestId("surface");
    press(el);
    hold();
    expect(onPress).toHaveBeenCalledTimes(1);
    // The browser fires the click right after pointerup; the harness's click
    // handler would call onPress again if the flag were not raised.
    release();
    act(() => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    // A later, ordinary tap goes through.
    act(() => {
      vi.advanceTimersByTime(1);
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("fires straight away on a right click, and suppresses the native menu", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(<Harness onPress={onPress} />);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 55, clientY: 66 });
    act(() => {
      getByTestId("surface").dispatchEvent(event);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress.mock.calls[0][0]).toMatchObject({ clientX: 55, clientY: 66 });
    expect(event.defaultPrevented).toBe(true);
  });

  it("honours shouldPress on a right click too", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(
      <Harness onPress={onPress} shouldPress={() => false} />,
    );
    act(() => {
      getByTestId("surface").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it("drops its listeners on unmount", () => {
    const onPress = vi.fn();
    const { getByTestId, unmount } = render(<Harness onPress={onPress} />);
    const el = getByTestId("surface");
    press(el);
    unmount();
    hold();
    expect(onPress).not.toHaveBeenCalled();
  });
});
