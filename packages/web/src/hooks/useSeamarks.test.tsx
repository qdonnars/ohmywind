// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSeamarks } from "./useSeamarks";

/** Stands for a map or the settings control. */
function Reader({ name }: { name: string }) {
  const { enabled, setEnabled } = useSeamarks();
  return (
    <div>
      <output data-testid={name}>{enabled ? "on" : "off"}</output>
      <button onClick={() => setEnabled(false)}>{`never ${name}`}</button>
      <button onClick={() => setEnabled(true)}>{`always ${name}`}</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("useSeamarks", () => {
  it("keeps every reader in step: a choice made in one reaches them all and is stored once", () => {
    render(
      <>
        <Reader name="explore" />
        <Reader name="plan" />
      </>,
    );
    expect(screen.getByTestId("explore").textContent).toBe("on");
    expect(screen.getByTestId("plan").textContent).toBe("on");

    act(() => screen.getByText("never explore").click());
    expect(screen.getByTestId("explore").textContent).toBe("off");
    expect(screen.getByTestId("plan").textContent).toBe("off");
    expect(localStorage.getItem("ow_seamarks_v2")).toBe("0");

    act(() => screen.getByText("always plan").click());
    expect(screen.getByTestId("explore").textContent).toBe("on");
    expect(screen.getByTestId("plan").textContent).toBe("on");
    expect(localStorage.getItem("ow_seamarks_v2")).toBe("1");
  });
});
