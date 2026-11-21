// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RepairReport } from "../repair/client";

let report: RepairReport | null = null;
vi.mock("../repair/client", () => ({
  repairReport: () => report,
  subscribeRepairReport: () => () => {},
}));

import { RepairStats } from "./RepairStats";

const REPORT: RepairReport = {
  last: { kind: "repaired", ms: 212.4, requests: 5, bytes: 21_340 },
  session: { routes: 2, requests: 9, bytes: 38_100 },
};

beforeEach(() => {
  report = REPORT;
  localStorage.clear();
  window.history.replaceState(null, "", "/plan");
});

afterEach(() => {
  window.history.replaceState(null, "", "/plan");
});

describe("RepairStats", () => {
  it("shows nothing to a reader who did not ask for it", () => {
    const { container } = render(<RepairStats />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the cost of the last repair and of the session once asked for", () => {
    window.history.replaceState(null, "", "/plan?repair-stats=1");
    render(<RepairStats />);
    const line = screen.getByTestId("repair-stats").textContent ?? "";
    expect(line).toContain("Route retracée sur cet appareil en 212 ms");
    expect(line).toContain("Tuiles : 5 requêtes, 21.3 ko");
    expect(line).toContain("session : 2 routes, 9 requêtes, 38.1 ko");
  });

  it("remembers the request when the plan rewrites its URL, until told otherwise", () => {
    window.history.replaceState(null, "", "/plan?repair-stats=1");
    render(<RepairStats />).unmount();
    window.history.replaceState(null, "", "/plan?wpts=1,2;3,4");
    render(<RepairStats />).unmount();
    expect(localStorage.getItem("ohmywind.repairStats")).toBe("1");
    window.history.replaceState(null, "", "/plan?repair-stats=0");
    const { container } = render(<RepairStats />);
    expect(container.innerHTML).toBe("");
  });

  it("says why when the browser could not repair", () => {
    window.history.replaceState(null, "", "/plan?repair-stats=1");
    report = { ...REPORT, last: { kind: "failed", error: "land tiles 404", ms: 30, requests: 0, bytes: 0 } };
    render(<RepairStats />);
    expect(screen.getByTestId("repair-stats").textContent).toContain("Route échec sur cet appareil en 30 ms (land tiles 404)");
  });
});
