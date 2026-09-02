// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Smoke test for the jsdom project: proves that rendering a real component,
 * querying it by its accessible role and driving it with a user event all work
 * end to end. `ModeToggle` is the smallest component of `/plan` that carries
 * actual behaviour (three visual states, one callback), so it exercises the
 * infrastructure without standing in for the coverage the reducer tests owe.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeToggle, TimeAnchorToggle } from "./ModeToggle";

describe("ModeToggle", () => {
  it("marks the active mode as the selected tab", () => {
    render(<ModeToggle value="compare" onChange={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  });

  it("reports the clicked mode", async () => {
    const onChange = vi.fn();
    render(<ModeToggle value="single" onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: /Comparer les fenêtres/ }));
    expect(onChange).toHaveBeenCalledWith("compare");
  });

  it("stays silent while locked", async () => {
    const onChange = vi.fn();
    render(<ModeToggle value="single" onChange={onChange} locked />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.every((t) => (t as HTMLButtonElement).disabled)).toBe(true);
    await userEvent.click(tabs[1]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows no tab as selected while pristine, so the user has to pick one", () => {
    render(<ModeToggle value="single" onChange={() => {}} pristine />);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.getAttribute("aria-selected")).toBe("false");
    }
  });
});

describe("TimeAnchorToggle", () => {
  it("switches between departure and arrival", async () => {
    const onChange = vi.fn();
    render(<TimeAnchorToggle value="departure" onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: /Définir l'arrivée/ }));
    expect(onChange).toHaveBeenCalledWith("arrival");
  });
});
