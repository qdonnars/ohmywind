// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CompareHint } from "./CompareHint";
import { PlanProvider } from "./session/PlanProvider";
import type { PlanContextValue } from "./session/planContext";
import { createInitialState, type PlanState } from "./session/reducer";
import type { InitialSession } from "./session/initial";
import type { PlanActions } from "./session/usePlanSession";
import type { PassageReport, ComplexityScore } from "./types";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";

const MARSEILLE: [number, number] = [43.29, 5.37];
const PORQUEROLLES: [number, number] = [43.0, 6.2];

const passage = (): PassageReport => ({
  archetype: "cruiser_30ft",
  departure_time: "2026-09-10T08:00:00+02:00",
  arrival_time: "2026-09-10T18:00:00+02:00",
  duration_h: 10,
  distance_nm: 55,
  efficiency: 0.75,
  model: "arome",
  segments: [],
  warnings: [],
});
const complexity = (): ComplexityScore => ({
  level: 2, label: "Modéré", wind_level: 2, wind_label: "Modéré", sea_level: 1, sea_label: "Calme",
  tws_max_kn: 14, hs_max_m: 0.8, rationale: "",
});

const session: InitialSession = {
  waypoints: [MARSEILLE, PORQUEROLLES],
  originWaypoints: [MARSEILLE, PORQUEROLLES],
  archetype: "cruiser_30ft",
  departure: "2026-09-10T08:00",
  timeAnchor: "departure",
  mode: "single",
  sweepEarliest: "2026-09-10T08:00",
  sweepLatest: "2026-09-12T08:00",
  sweepIntervalHours: 3,
  passage: null,
  complexity: null,
  windows: null,
  metaWarnings: [],
  forecastUpdatedAt: null,
  isStale: false,
  actionTaken: true,
  center: null,
  urlError: null,
  mount: { rewriteUrl: false, fetch: false },
  sources: { route: "url", boat: "url", departure: "url" },
};

function mount(state: Partial<PlanState> = {}) {
  const value: PlanContextValue = {
    state: { ...createInitialState(session), ...state },
    actions: {} as PlanActions,
    archetypes: [],
    isLoading: false,
    compute: vi.fn(),
    computeWindows: vi.fn(),
  };
  return render(
    <PlanProvider value={value}>
      <CompareHint />
    </PlanProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CompareHint", () => {
  it("shows once, a moment after the first plan, and stays gone once dismissed", () => {
    mount({ passage: passage(), complexity: complexity() });
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByRole("dialog")).toBeTruthy();
    // fireEvent rather than userEvent: the latter waits on timers this test
    // has faked.
    fireEvent.click(screen.getByRole("button", { name: "Compris" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.compareHint)).toBe("done");
  });

  it("does not show without a fresh plan, nor once the comparison was opened", () => {
    mount({ passage: passage(), complexity: complexity(), isStale: true });
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.queryByRole("dialog")).toBeNull();
    // The comparison open is the lesson learnt: the flag is set for good.
    mount({ mode: "compare", passage: passage(), complexity: complexity() });
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.compareHint)).toBe("done");
  });
});
