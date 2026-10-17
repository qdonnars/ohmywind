// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("shows nothing for a wind-only spot at sea", () => {
    const { container } = render(
      <MetricPills view="wind" onSelect={() => {}} showWaves={false} showTides={false} showCurrents={false} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
