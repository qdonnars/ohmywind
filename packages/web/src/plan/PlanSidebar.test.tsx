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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSidebar } from "./PlanSidebar";
import { ReturnBanner } from "./ReturnBanner";
import { PlanProvider } from "./session/PlanProvider";
import type { PlanContextValue } from "./session/planContext";
import { createInitialState, type PlanState } from "./session/reducer";
import type { InitialSession } from "./session/initial";
import type { PlanActions } from "./session/usePlanSession";
import type { PassageReport, ComplexityScore, PassageWindow, Archetype } from "./types";
import { resetPolarConfigSnapshot } from "../config/usePolarConfig";
import { fmtClock, toNaiveLocal, toTzAware } from "../domain/datetime";
import { presetLatest } from "./compare/slots";
import type { ReactNode } from "react";

const MARSEILLE: [number, number] = [43.29, 5.37];
const PORQUEROLLES: [number, number] = [43.0, 6.2];
const MID: [number, number] = [43.15, 5.8];

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
    openForm: vi.fn(),
    openCompare: vi.fn(),
    closeCompare: vi.fn(),
    keepPlan: vi.fn(),
    applySweep: vi.fn(),
    startVariant: vi.fn(),
    addVariantPoint: vi.fn(),
    moveVariantPoint: vi.fn(),
    insertVariantPoint: vi.fn(),
    deleteVariantPoint: vi.fn(),
    cancelVariant: vi.fn(),
    finishVariant: vi.fn(),
    computeTracks: vi.fn(),
    openTrack: vi.fn(),
    selectTrack: vi.fn(),
    removeTrack: vi.fn(),
    highlightTrack: vi.fn(),
    applyTrackDeparture: vi.fn(),
    selectLeg: vi.fn(),
    selectStep: vi.fn(),
    compute: vi.fn(),
    computeWindows: vi.fn(),
    selectWindow: vi.fn(),
    reset: vi.fn(),
  };
}

function mountWith(
  children: ReactNode,
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
  render(<PlanProvider value={value}>{children}</PlanProvider>);
  return value;
}

function mount(state: Partial<PlanState> = {}, extra: Partial<PlanContextValue> = {}): PlanContextValue {
  return mountWith(<PlanSidebar />, state, extra);
}

beforeEach(() => {
  localStorage.clear();
  resetPolarConfigSnapshot();
});

describe("PlanSidebar views", () => {
  it("shows a skeleton while computing, and no result", () => {
    mount({ passage: passage(), complexity: complexity() }, { isLoading: true });
    expect(screen.queryByText(/Recalculer/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Nouveau plan" })).toBeNull();
  });

  it("shows the error, with the trash still reachable", () => {
    mount({ apiError: "Trop de calculs lancés coup sur coup." });
    expect(screen.getByText("Trop de calculs lancés coup sur coup.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nouveau plan" })).toBeTruthy();
  });

  it("shows the error under the comparison head, with the way back, when it failed there", async () => {
    const value = mount({ mode: "compare", apiError: "boom" });
    expect(screen.getByText("boom")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Revenir au plan" }));
    expect(value.actions.closeCompare).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state under two waypoints, with no mode to pick and nothing to reset", () => {
    mount({ waypoints: [MARSEILLE] });
    expect(screen.getByText("Tracez votre trajet")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nouveau plan" })).toBeNull();
  });

  it("offers to compute or to open the form before anything was asked", async () => {
    const value = mount({ actionTaken: false });
    // The compact step and the form are both in the DOM: CSS picks one per
    // layout, jsdom shows both.
    const calculate = screen.getAllByRole("button", { name: /Calculer le passage/ });
    expect(calculate.length).toBeGreaterThanOrEqual(1);
    await userEvent.click(screen.getByRole("button", { name: "Régler le départ ou le bateau" }));
    expect(value.actions.openForm).toHaveBeenCalledTimes(1);
    await userEvent.click(calculate[0]);
    expect(value.compute).toHaveBeenCalledTimes(1);
  });

  it("shows the single form and computes on demand, the trash beside the action", async () => {
    const value = mount();
    expect(screen.getByRole("button", { name: "Nouveau plan" })).toBeTruthy();
    const button = screen.getByRole("button", { name: /Calculer le passage/ });
    await userEvent.click(button);
    expect(value.compute).toHaveBeenCalledTimes(1);
  });

  it("shows the passage, its alerts folded with their kinds, its legs, and the doors last", async () => {
    const value = mount({ passage: passage(), complexity: complexity(), forecastUpdatedAt: "2026-09-09T06:00:00Z" });
    // Folded: one line saying how many and about what, unfolded on a tap.
    expect(screen.queryByText("vent faible : passage très lent")).toBeNull();
    // The name computation drops the spaces around the middle dot.
    await userEvent.click(screen.getByRole("button", { name: /1 alerte.vent/ }));
    expect(screen.getByText("vent faible : passage très lent")).toBeTruthy();
    expect(screen.getByText(/Croiseur 30 pieds/)).toBeTruthy();
    // Recalculer and the trash at the end of the one recap row.
    expect(screen.getByRole("button", { name: "Recalculer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nouveau plan" })).toBeTruthy();
    // One row per leg, opening the build-up on click.
    expect(screen.getByRole("button", { name: /^1→2/ })).toBeTruthy();
    expect(screen.getByText(/Données fraîches au/)).toBeTruthy();
    // The two doors, after everything else.
    await userEvent.click(screen.getByRole("button", { name: "D'autres départs" }));
    expect(value.actions.openCompare).toHaveBeenCalledWith("slots");
    await userEvent.click(screen.getByRole("button", { name: "Un autre itinéraire" }));
    expect(value.actions.openCompare).toHaveBeenCalledWith("tracks");
    expect(value.actions.startVariant).toHaveBeenCalledTimes(1);
  });

  it("hides the legs, the alerts and the doors behind a recompute prompt once the route moved", () => {
    mount({ passage: passage(), complexity: complexity(), isStale: true });
    expect(screen.getByText(/Itinéraire modifié/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^1→2/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /alerte/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "D'autres départs" })).toBeNull();
  });

  it("opens a leg through the session, not through local state", async () => {
    const value = mount({ passage: passage(), complexity: complexity() });
    await userEvent.click(screen.getByRole("button", { name: /^1→2/ }));
    expect(value.actions.selectLeg).toHaveBeenCalledWith(0);
  });

  it("offers the reset only once there is something to clear", () => {
    const withRoute = mount();
    expect(screen.getByRole("button", { name: "Nouveau plan" })).toBeTruthy();
    expect(withRoute.actions.reset).not.toHaveBeenCalled();
  });
});

// ── « Comparer ce trajet » ───────────────────────────────────────────────────

describe("the comparison", () => {
  it("lists the slots by day and opens one in the plan", async () => {
    const value = mount({ mode: "compare", windows: [aWindow()] });
    // The head names the axis entered from the plan; there is no switch.
    expect(screen.getByText("D'autres départs")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getAllByText("1 créneau").length).toBeGreaterThanOrEqual(1);
    // The line: hour, duration, arrival, then the conditions as a sentence.
    expect(screen.getByText("10h")).toBeTruthy();
    expect(screen.getByText("vent 8–14 kn")).toBeTruthy();
    expect(screen.getByText("mer 0,3–0,8 m")).toBeTruthy();
    // No complexity index on the line.
    expect(screen.queryByText("⚡")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Ouvrir ce créneau dans le plan/ }));
    expect(value.actions.selectWindow).toHaveBeenCalled();
  });

  it("marks the plan's own departure as chosen, and counts the alerts", () => {
    // The slot is an instant, the plan's departure a naive local time: built
    // from the same local value so the match holds on a UTC runner too.
    const w = { ...aWindow(), departure: toTzAware("2026-09-11T06:00"), warnings: ["a", "b"] };
    mount({ mode: "compare", windows: [w], departure: "2026-09-11T06:00" });
    expect(screen.getByText("sélectionné")).toBeTruthy();
    expect(screen.getByTitle("2 alertes")).toBeTruthy();
  });

  it("goes back to the plan from the head", async () => {
    const value = mount({ mode: "compare", windows: [aWindow()] });
    await userEvent.click(screen.getByRole("button", { name: "Revenir au plan" }));
    expect(value.actions.closeCompare).toHaveBeenCalledTimes(1);
  });

  it("hides the list behind a recompute prompt once the route moved", async () => {
    const value = mount({ mode: "compare", windows: [aWindow()], isStale: true });
    expect(screen.getByText(/comparer les créneaux du nouveau trajet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ouvrir ce créneau/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Recalculer" }));
    expect(value.computeWindows).toHaveBeenCalledTimes(1);
  });

  it("sets the window from the chips at the top of the list, applied at once", async () => {
    const departure = "2026-09-10T08:00";
    const value = mount({ mode: "compare", windows: [aWindow()], departure });
    // The presets, and the step already deduced from the span. No 12 days:
    // too far out to plan a departure on.
    expect(screen.getByRole("button", { name: "48 h" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "3 h" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "12 j" })).toBeNull();
    // A span, from the plan's departure, at the step it proposes.
    await userEvent.click(screen.getByRole("button", { name: "7 j" }));
    expect(value.actions.applySweep).toHaveBeenLastCalledWith({
      earliest: departure,
      latest: presetLatest(departure, 168, Date.now()),
      intervalHours: 6,
    });
    // A step alone, on the window as it stands. No 12 h: a day says it.
    expect(screen.queryByRole("button", { name: "12 h" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "6 h" }));
    expect(value.actions.applySweep).toHaveBeenLastCalledWith({
      earliest: departure,
      latest: "2026-09-12T08:00",
      intervalHours: 6,
    });
    // The exact dates, under a link, applied with a button.
    expect(screen.queryByLabelText("Du")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Ajuster les dates" }));
    const from = screen.getByLabelText("Du") as HTMLInputElement;
    expect(from.value).toBe(departure);
    expect((screen.getByRole("button", { name: "Appliquer" }) as HTMLButtonElement).disabled).toBe(true);
    const soon = new Date(Date.now() + 86_400_000);
    soon.setMinutes(0, 0, 0);
    const later = new Date(soon.getTime() + 2 * 86_400_000);
    fireEvent.change(from, { target: { value: toNaiveLocal(soon) } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: toNaiveLocal(later) } });
    await userEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    expect(value.actions.applySweep).toHaveBeenLastCalledWith({
      earliest: toNaiveLocal(soon),
      latest: toNaiveLocal(later),
      intervalHours: 3,
    });
  });

  it("keeps the head and the chips while the sweep runs, the list alone waiting", () => {
    mount({ mode: "compare", windows: [aWindow()], pending: { id: 1, kind: "sweep", editSeq: 0 } }, { isLoading: true });
    expect(screen.getByText("D'autres départs")).toBeTruthy();
    expect(screen.getByRole("button", { name: "48 h" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ouvrir ce créneau/ })).toBeNull();
  });

  it("keeps a way back over the map while a slot is open in the plan", async () => {
    const value = mountWith(<ReturnBanner />, { returnTo: "slots", windows: [aWindow()], passage: passage(), complexity: complexity() });
    await userEvent.click(screen.getByRole("button", { name: "Revenir à la comparaison" }));
    expect(value.actions.openCompare).toHaveBeenCalledWith("slots");
    await userEvent.click(screen.getByRole("button", { name: "Garder" }));
    expect(value.actions.keepPlan).toHaveBeenCalledTimes(1);
    cleanup();
    mountWith(<ReturnBanner />, { returnTo: null });
    expect(screen.queryByRole("button")).toBeNull();
  });
});

// ── The open leg: average by default, one step on demand ─────────────────────
// Two server segments between the two waypoints, so the single leg has two
// steps whose wind disagrees. The actions are stubs: each test mounts the
// session in the state the previous click would have produced.

const twoStepPassage = (): PassageReport => {
  const base = passage();
  const [only] = base.segments;
  return {
    ...base,
    segments: [
      {
        ...only,
        end: { lat: MID[0], lon: MID[1] },
        distance_nm: 27,
        end_time: "2026-09-10T13:00:00+02:00",
        duration_h: 5,
        tws_kn: 6,
        twd_deg: 290,
      },
      {
        ...only,
        start: { lat: MID[0], lon: MID[1] },
        distance_nm: 28,
        start_time: "2026-09-10T13:00:00+02:00",
        duration_h: 5,
        tws_kn: 9,
        twd_deg: 330,
        gust_kn: 18,
        hs_m: 1.5,
        wave_period_s: 8,
      },
    ],
  };
};

describe("open leg", () => {
  it("shows the average of the steps, and offers the detail", async () => {
    const value = mount({ passage: twoStepPassage(), complexity: complexity(), selectedLegIdx: 0 });
    expect(screen.getByText(/Moyenne · /)).toBeTruthy();
    expect(screen.getByText("moyenne de 2 pas")).toBeTruthy();
    // The flag of step 2 reaches the average, where the leg's own mean sea
    // (1,06 m) would not have raised it.
    expect(screen.getByText("⚠ Mer Formée")).toBeTruthy();
    // No build-up on the average.
    expect(screen.queryByText(/polaire/)).toBeNull();
    // The wind range the average hides, and no gust in it: 18 sits on step 2.
    expect(screen.getByText("6–9 (18) kn")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Pas \d sur 2/ })).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Détail" }));
    expect(value.actions.selectStep).toHaveBeenCalledWith(0);
  });

  it("walks the steps with the arrows and the strip", async () => {
    const value = mount({
      passage: twoStepPassage(),
      complexity: complexity(),
      selectedLegIdx: 0,
      selectedStepIdx: 1,
    });
    // Rendered through the same formatter as the card: the runner's clock is
    // not Paris (a CI box sits on UTC), so the literal would read two hours off.
    expect(screen.getByText(`${fmtClock("2026-09-10T13:00:00+02:00")} → ${fmtClock("2026-09-10T18:00:00+02:00")}`)).toBeTruthy();
    expect(screen.getByText(/2\/2$/)).toBeTruthy();
    expect(screen.getByText("9 (18) kn")).toBeTruthy();
    // On a step, the build-up and the step's own flag.
    expect(screen.getByText(/polaire/)).toBeTruthy();
    expect(screen.getByText(/^⚠ Mer Formée$/)).toBeTruthy();
    // Last step: no next.
    expect((screen.getByRole("button", { name: "Pas suivant" }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Pas précédent" }));
    expect(value.actions.selectStep).toHaveBeenCalledWith(0);

    // Tapping the open block returns to the average.
    await userEvent.click(screen.getByRole("button", { name: /^Pas 2 sur 2/ }));
    expect(value.actions.selectStep).toHaveBeenCalledWith(null);
  });

  it("opens a step from the bar under the totals, and closes it from there too", async () => {
    const value = mount({ passage: twoStepPassage(), complexity: complexity() });
    const cells = screen.getAllByRole("button", { name: /^Tronçon 1→2, pas \d sur 2/ });
    expect(cells).toHaveLength(2);
    await userEvent.click(cells[1]);
    expect(value.actions.selectLeg).toHaveBeenCalledWith(0);
    expect(value.actions.selectStep).toHaveBeenCalledWith(1);

    cleanup();
    const open = mount({
      passage: twoStepPassage(),
      complexity: complexity(),
      selectedLegIdx: 0,
      selectedStepIdx: 1,
    });
    const ringed = screen.getByRole("button", { name: /^Tronçon 1→2, pas 2 sur 2/ });
    expect(ringed.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(ringed);
    expect(open.actions.selectStep).toHaveBeenCalledWith(null);
    expect(open.actions.selectLeg).not.toHaveBeenCalled();
  });

  it("shows a single-step leg as the step itself: no average, no strip, no arrows", () => {
    mount({ passage: passage(), complexity: complexity(), selectedLegIdx: 0 });
    expect(screen.queryByText(/Moyenne/)).toBeNull();
    expect(screen.getByText(`${fmtClock("2026-09-10T08:00:00+02:00")} → ${fmtClock("2026-09-10T18:00:00+02:00")}`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Détail" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pas / })).toBeNull();
  });
});
