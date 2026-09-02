// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The five views of the panel, mounted for real.
 *
 * The point is the branch, not the pixels: each view is reached by one shape
 * of the session, and reaching it must not need a prop bag. These tests are
 * also what makes the split safe to keep going: a sub-component that reaches
 * for something the context does not carry fails here rather than at runtime.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSidebar } from "./PlanSidebar";
import { PlanProvider } from "./session/PlanProvider";
import type { PlanContextValue } from "./session/planContext";
import { createInitialState, type PlanState } from "./session/reducer";
import type { InitialSession } from "./session/initial";
import type { PlanActions } from "./session/usePlanSession";
import type { PassageReport, ComplexityScore, PassageWindow, Archetype } from "./types";
import { resetPolarConfigSnapshot } from "../config/usePolarConfig";

const MARSEILLE: [number, number] = [43.29, 5.37];
const PORQUEROLLES: [number, number] = [43.0, 6.2];

const passage = (): PassageReport => ({
  archetype: "cruiser_30ft",
  departure_time: "2026-09-10T08:00:00+02:00",
  arrival_time: "2026-09-10T18:00:00+02:00",
  duration_h: 10,
  distance_nm: 55,
  efficiency: 0.75,
  model: "meteofrance_arome_france_hd",
  segments: [
    {
      start: { lat: 43.29, lon: 5.37 },
      end: { lat: 43.0, lon: 6.2 },
      distance_nm: 55,
      bearing_deg: 128,
      start_time: "2026-09-10T08:00:00+02:00",
      end_time: "2026-09-10T18:00:00+02:00",
      tws_kn: 12,
      twd_deg: 300,
      twa_deg: 170,
      polar_speed_kn: 5.5,
      boat_speed_kn: 5.5,
      duration_h: 10,
      hs_m: 0.6,
      wave_derate_factor: 1,
    },
  ],
  warnings: ["vent faible : passage très lent"],
});

const complexity = (): ComplexityScore => ({
  level: 2,
  label: "Modéré",
  wind_level: 2,
  wind_label: "Modéré",
  sea_level: 1,
  sea_label: "Calme",
  tws_max_kn: 14,
  hs_max_m: 0.8,
  rationale: "",
});

const aWindow = (): PassageWindow => ({
  departure: "2026-09-11T06:00:00+02:00",
  arrival: "2026-09-11T16:00:00+02:00",
  duration_h: 10,
  distance_nm: 55,
  complexity: { level: 2, label: "Modéré", tws_max_kn: 14, rationale: "" },
  conditions_summary: {
    tws_min_kn: 8,
    tws_max_kn: 14,
    predominant_sail_angle: "largue",
    hs_min_m: 0.3,
    hs_max_m: 0.8,
  },
  warnings: [],
});

const ARCHETYPES: Archetype[] = [
  {
    slug: "cruiser_30ft",
    name: "Croiseur 30 pieds",
    length_ft: 30,
    type: "monocoque",
    category: "croisière",
    examples: ["Sun Odyssey 32"],
    performance_class: "standard",
  },
];

const baseSession: InitialSession = {
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

function stubActions(): PlanActions {
  return {
    appendWaypoint: vi.fn(),
    moveWaypoint: vi.fn(),
    insertWaypoint: vi.fn(),
    deleteWaypoint: vi.fn(),
    setArchetype: vi.fn(),
    selectPerso: vi.fn(),
    setDeparture: vi.fn(),
    setTimeAnchor: vi.fn(),
    setMode: vi.fn(),
    setSweepEarliest: vi.fn(),
    setSweepLatest: vi.fn(),
    setSweepInterval: vi.fn(),
    selectLeg: vi.fn(),
    compute: vi.fn(),
    computeWindows: vi.fn(),
    selectWindow: vi.fn(),
    reset: vi.fn(),
  };
}

function mount(
  state: Partial<PlanState> = {},
  extra: Partial<PlanContextValue> = {},
): PlanContextValue {
  const value: PlanContextValue = {
    state: { ...createInitialState(baseSession), ...state },
    actions: stubActions(),
    archetypes: ARCHETYPES,
    isLoading: false,
    compute: vi.fn(),
    computeWindows: vi.fn(),
    ...extra,
  };
  render(
    <PlanProvider value={value}>
      <PlanSidebar />
    </PlanProvider>,
  );
  return value;
}

beforeEach(() => {
  localStorage.clear();
  resetPolarConfigSnapshot();
});

describe("PlanSidebar views", () => {
  it("shows a skeleton while computing, and no result", () => {
    mount({ passage: passage(), complexity: complexity() }, { isLoading: true });
    expect(screen.queryByText(/Recalculer/)).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("shows the error, with the mode pills still reachable", () => {
    mount({ apiError: "Trop de calculs lancés coup sur coup." });
    expect(screen.getByText("Trop de calculs lancés coup sur coup.")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("shows the empty state and locks the pills under two waypoints", () => {
    mount({ waypoints: [MARSEILLE] });
    for (const tab of screen.getAllByRole("tab")) {
      expect((tab as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("shows the pick-a-mode step before the user confirms", () => {
    mount({ actionTaken: false });
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.getAttribute("aria-selected")).toBe("false");
    }
    expect(screen.queryByRole("button", { name: /Calculer le passage/ })).toBeNull();
  });

  it("shows the single form and computes on demand", async () => {
    const value = mount();
    const button = screen.getByRole("button", { name: /Calculer le passage/ });
    await userEvent.click(button);
    expect(value.compute).toHaveBeenCalledTimes(1);
  });

  it("refuses to compute a sweep whose range is invalid", () => {
    mount({ mode: "compare", sweepEarliest: "2026-09-12T08:00", sweepLatest: "2026-09-10T08:00" });
    const button = screen.getByRole("button", { name: /Comparer les créneaux|waypoints/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the passage, its warnings and its legs once computed", () => {
    mount({ passage: passage(), complexity: complexity(), forecastUpdatedAt: "2026-09-09T06:00:00Z" });
    expect(screen.getByText("vent faible : passage très lent")).toBeTruthy();
    expect(screen.getByText(/Croiseur 30 pieds/)).toBeTruthy();
    // One row per leg, opening the build-up on click.
    expect(screen.getByRole("button", { name: /1→2/ })).toBeTruthy();
    expect(screen.getByText(/Données fraîches au/)).toBeTruthy();
  });

  it("hides the legs behind a recompute prompt once the route moved", () => {
    mount({ passage: passage(), complexity: complexity(), isStale: true });
    expect(screen.getByText(/Itinéraire modifié/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /1→2/ })).toBeNull();
  });

  it("opens a leg through the session, not through local state", async () => {
    const value = mount({ passage: passage(), complexity: complexity() });
    await userEvent.click(screen.getByRole("button", { name: /1→2/ }));
    expect(value.actions.selectLeg).toHaveBeenCalledWith(0);
  });

  it("shows the compare table and drills into a window", async () => {
    const value = mount({ mode: "compare", windows: [aWindow()] });
    expect(screen.getByText(/1 fenêtre comparée/)).toBeTruthy();
    // The window rows are buttons in a CSS grid, not a <table>.
    const row = screen.getByText("0.3–0.8 m").closest("button");
    await userEvent.click(row!);
    expect(value.actions.selectWindow).toHaveBeenCalled();
  });

  it("hides the compare table once the route moved", () => {
    mount({ mode: "compare", windows: [aWindow()], isStale: true });
    expect(screen.getByText(/comparer les créneaux du nouveau trajet/)).toBeTruthy();
    expect(screen.queryByText(/1 fenêtre comparée/)).toBeNull();
  });

  it("offers the reset only once there is something to clear", () => {
    const withRoute = mount();
    expect(screen.getByRole("button", { name: "Nouveau plan" })).toBeTruthy();
    expect(withRoute.actions.reset).not.toHaveBeenCalled();
  });
});
