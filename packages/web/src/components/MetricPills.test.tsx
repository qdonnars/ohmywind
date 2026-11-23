// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MetricPills } from "./MetricPills";

describe("MetricPills", () => {
  it("says the spot is on land instead of showing an empty card (#480)", () => {
    render(
      <MetricPills
        view="wind"
        onSelect={() => {}}
        showWaves={false}
        showTides={false}
        showCurrents={false}
        onLand
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/terre|land/i);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  // jsdom does no layout (and reads #000 back as rgb): the row and pill
  // geometry is stubbed (90 px pills, 8 px apart, 12 px padding), then a
  // scroll event makes the row re-read it.
  function layOut(row: HTMLElement, rowWidth: number, scrollLeft: number) {
    Object.defineProperty(row, "clientWidth", { configurable: true, value: rowWidth });
    Object.defineProperty(row, "scrollWidth", { configurable: true, value: 404 });
    Object.defineProperty(row, "scrollLeft", { configurable: true, value: scrollLeft });
    row.getBoundingClientRect = () => new DOMRect(0, 0, rowWidth, 50);
    let x = 12 - scrollLeft;
    for (const pill of row.children) {
      const left = x;
      (pill as HTMLElement).getBoundingClientRect = () => new DOMRect(left, 0, 90, 30);
      x += 98;
    }
    fireEvent.scroll(row);
  }
  const masks = () => screen.getAllByRole("tab").map((p) => p.style.getPropertyValue("mask-image"));

  it("fades the pills out at the row's end only while something is left to scroll", () => {
    render(<MetricPills view="wind" onSelect={() => {}} showWaves showTides showCurrents />);
    const row = screen.getByRole("tablist");

    // 311 px row: the fade covers its last 32 px, i.e. the end of the third
    // pill and what shows of the fourth.
    layOut(row, 311, 0);
    expect(masks()).toEqual([
      "",
      "",
      "linear-gradient(to right, rgb(0, 0, 0) 71px, transparent 103px)",
      "linear-gradient(to right, rgb(0, 0, 0) -27px, transparent 5px)",
    ]);

    // 10 px left to scroll: the fade narrows to 10 px.
    layOut(row, 311, 83);
    expect(masks()).toEqual([
      "",
      "",
      "",
      "linear-gradient(to right, rgb(0, 0, 0) 78px, transparent 88px)",
    ]);

    // Scrolled to the end: the last pill is whole and unfaded.
    layOut(row, 311, 93);
    expect(masks()).toEqual(["", "", "", ""]);

    // A row that fits (tablet, desktop) is never faded.
    layOut(row, 756, 0);
    expect(masks()).toEqual(["", "", "", ""]);
  });

  it("shows nothing for a wind-only spot at sea", () => {
    const { container } = render(
      <MetricPills view="wind" onSelect={() => {}} showWaves={false} showTides={false} showCurrents={false} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
