// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Smoke test for the jsdom project: proves that rendering a real component,
 * querying it by its accessible role and driving it with a user event all work
 * end to end. `TimeAnchorToggle` is the smallest component of `/plan` that
 * carries actual behaviour (two states, one callback).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeAnchorToggle } from "./ModeToggle";

describe("TimeAnchorToggle", () => {
  it("marks the active anchor as the selected tab", () => {
    render(<TimeAnchorToggle value="arrival" onChange={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  });

  it("switches between departure and arrival", async () => {
    const onChange = vi.fn();
    render(<TimeAnchorToggle value="departure" onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: /Définir l'arrivée/ }));
    expect(onChange).toHaveBeenCalledWith("arrival");
  });
});
