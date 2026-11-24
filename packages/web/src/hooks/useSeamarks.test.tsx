// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSeamarks } from "./useSeamarks";

/** Stands for a map button or a settings control. */
function Reader({ name }: { name: string }) {
  const { enabled, toggle, setEnabled } = useSeamarks();
  return (
    <div>
      <output data-testid={name}>{enabled ? "on" : "off"}</output>
      <button onClick={toggle}>{`toggle ${name}`}</button>
      <button onClick={() => setEnabled(true)}>{`always ${name}`}</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("useSeamarks", () => {
  it("keeps every reader in step: flipping one flips them all and stores the choice once", () => {
    render(
      <>
        <Reader name="explore" />
        <Reader name="plan" />
      </>,
    );
    const before = screen.getByTestId("explore").textContent;
    expect(screen.getByTestId("plan").textContent).toBe(before);

    act(() => screen.getByText("toggle explore").click());
    const after = before === "on" ? "off" : "on";
    expect(screen.getByTestId("explore").textContent).toBe(after);
    expect(screen.getByTestId("plan").textContent).toBe(after);
    expect(localStorage.getItem("ow_seamarks_v2")).toBe(after === "on" ? "1" : "0");

    act(() => screen.getByText("always plan").click());
    expect(screen.getByTestId("explore").textContent).toBe("on");
    expect(screen.getByTestId("plan").textContent).toBe("on");
    expect(localStorage.getItem("ow_seamarks_v2")).toBe("1");
  });
});
