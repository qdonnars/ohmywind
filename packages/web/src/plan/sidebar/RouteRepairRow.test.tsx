// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RouteRepairRow } from "./RouteRepairRow";

const revertRouteRepair = vi.fn();
let routeRepair: unknown = null;

vi.mock("../session/planContext", () => ({
  usePlan: () => ({ state: { routeRepair }, actions: { revertRouteRepair } }),
}));

beforeEach(() => {
  revertRouteRepair.mockClear();
  routeRepair = {
    original: [],
    changes: [{ code: "route.leg_retraced", params: {}, message: "Le tronçon 1 a été retracé en mer." }],
  };
});

describe("RouteRepairRow", () => {
  it("shows nothing for a route computed as drawn", () => {
    routeRepair = null;
    const { container } = render(<RouteRepairRow />);
    expect(container.firstChild).toBeNull();
  });

  it("is one folded line; a tap unfolds the changes, the reminder and the way back", () => {
    render(<RouteRepairRow />);
    const line = screen.getByRole("button", { name: "Route ajustée pour rester en mer" });
    expect(line.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Revenir à mon tracé")).toBeNull();
    expect(document.body.textContent).not.toContain("hauts-fonds");

    fireEvent.click(line);
    expect(line.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain("hauts-fonds");
    fireEvent.click(screen.getByRole("button", { name: "Revenir à mon tracé" }));
    expect(revertRouteRepair).toHaveBeenCalledOnce();

    fireEvent.click(line);
    expect(screen.queryByText("Revenir à mon tracé")).toBeNull();
  });
});
