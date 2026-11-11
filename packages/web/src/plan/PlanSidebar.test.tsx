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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSidebar } from "./PlanSidebar";
import { ReturnBanner } from "./ReturnBanner";
import { DepartureSlider } from "./sidebar/DepartureSlider";
import { StatBand } from "./PlanStates";
import { PlanProvider } from "./session/PlanProvider";
import type { PlanContextValue } from "./session/planContext";
import { createInitialState, type PlanState } from "./session/reducer";
import type { InitialSession } from "./session/initial";
import type { PlanActions } from "./session/usePlanSession";
import type { PassageReport, ComplexityScore, PassageWindow, Archetype } from "./types";
import { resetPolarConfigSnapshot } from "../config/usePolarConfig";
import { capitalise, fmtClock, fmtDay, toNaiveLocal, toTzAware } from "../domain/datetime";
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
    expect(screen.getByRole("button", { name: /^1 → 2/ })).toBeTruthy();
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
    expect(screen.queryByRole("button", { name: /^1 → 2/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /alerte/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "D'autres départs" })).toBeNull();
  });

  it("opens a leg through the session, not through local state", async () => {
    const value = mount({ passage: passage(), complexity: complexity() });
    await userEvent.click(screen.getByRole("button", { name: /^1 → 2/ }));
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
    // The column header carries the words and the units, once.
    for (const head of ["Départ", "Arrivée", "Durée", "Allure", "Vent", "Mer"]) {
      expect(screen.getAllByText(head).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByText("kn")).toBeTruthy();
    expect(screen.getByText("m")).toBeTruthy();
    // The day, as the formatter writes it (the capitals are the stylesheet's).
    expect(screen.getByText(fmtDay(aWindow().departure))).toBeTruthy();
    // The line: aligned figures, no unit in the cells.
    expect(screen.getByText("10h")).toBeTruthy();
    expect(screen.getByText("Largue")).toBeTruthy();
    expect(screen.getByText("8–14")).toBeTruthy();
    expect(screen.getByText("0,3–0,8")).toBeTruthy();
    expect(screen.queryByText("vent 8–14 kn")).toBeNull();
    // No complexity index on the line.
    expect(screen.queryByText("⚡")).toBeNull();
    // The button still says every figure in words.
    const row = screen.getByRole("button", { name: /Ouvrir ce créneau dans le plan/ });
    const name = row.getAttribute("aria-label") ?? "";
    expect(name).toContain(`Départ ${fmtClock(aWindow().departure)}, arrivée ${fmtClock(aWindow().arrival)}, durée 10h`);
    expect(name).toContain("Largue, vent 8–14 kn, mer 0,3–0,8 m");
    await userEvent.click(row);
    expect(value.actions.selectWindow).toHaveBeenCalled();
  });

  it("marks the plan's own departure with the accent rule, not a label", () => {
    // The slot is an instant, the plan's departure a naive local time: built
    // from the same local value so the match holds on a UTC runner too.
    const mine = { ...aWindow(), departure: toTzAware("2026-09-11T06:00") };
    const other = { ...aWindow(), departure: toTzAware("2026-09-11T09:00") };
    mount({ mode: "compare", windows: [mine, other], departure: "2026-09-11T06:00" });
    const [first, second] = screen.getAllByRole("button", { name: /Ouvrir ce créneau dans le plan/ });
    expect(first.getAttribute("aria-current")).toBe("true");
    expect(first.style.boxShadow).toContain("var(--ow-accent)");
    expect(first.style.background).toContain("var(--ow-accent-soft)");
    expect(second.getAttribute("aria-current")).toBeNull();
    expect(second.style.boxShadow).toBe("");
    expect(screen.queryByText("sélectionné")).toBeNull();
  });

  it("counts the alerts and the engine share on the sub-line", () => {
    const motorPassage = passage();
    motorPassage.segments = [
      { ...motorPassage.segments[0], distance_nm: 46, motor_used: false },
      { ...motorPassage.segments[0], distance_nm: 4, motor_used: true },
    ];
    const w = { ...aWindow(), warnings: ["a", "b"], passage: motorPassage };
    mount({ mode: "compare", windows: [w] });
    expect(screen.getByText("2 alertes")).toBeTruthy();
    expect(screen.getByText("moteur 8 %")).toBeTruthy();
    const row = screen.getByRole("button", { name: /Ouvrir ce créneau dans le plan/ });
    expect(row.getAttribute("aria-label")).toContain("2 alertes, moteur 8 %");
  });

  it("leaves the sub-line out of a slot with no alert and no engine", () => {
    const sailing = passage();
    sailing.segments = [{ ...sailing.segments[0], motor_used: false }];
    mount({ mode: "compare", windows: [{ ...aWindow(), passage: sailing }] });
    expect(screen.queryByText(/alerte/)).toBeNull();
    expect(screen.queryByText(/moteur/)).toBeNull();
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

  it("lists the plan's route as option 1, in the plan, with its alerts said in full", async () => {
    const scored: ComplexityScore = {
      ...complexity(),
      warnings: [
        {
          kind: "sea",
          level: 3,
          message: "Mer formée : Hs 1.1-1.4 m sur 13.8 nm",
          affected_segments: [0],
          code: "complexity.sea.3",
          params: { hs_range: "1.1-1.4", nm: "13.8" },
        },
      ],
    };
    const value = mount({ mode: "compare", compareAxis: "tracks", passage: passage(), complexity: scored });
    // The header, the units once.
    for (const head of ["Option", "Arrivée", "Durée", "Dist.", "Mer max"]) {
      expect(screen.getAllByText(head).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByText("nm")).toBeTruthy();
    // The plan's own option: named, marked, with the accent rule.
    expect(screen.getByText("Option 1")).toBeTruthy();
    expect(screen.getByText("dans le plan")).toBeTruthy();
    const row = screen.getByRole("button", { name: /Choisir l'option 1 pour le plan/ });
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(row.parentElement!.style.boxShadow).toContain("var(--ow-accent)");
    const name = row.getAttribute("aria-label") ?? "";
    expect(name).toContain(`Option 1, dans le plan, arrivée ${fmtClock(passage().arrival_time)}, durée 10h, 55,0 nm, mer max 0,6 m`);
    expect(name).toContain("2 alertes");
    // Figures without units; the sea in the warning ink, the alert behind it.
    expect(screen.getByText("55,0")).toBeTruthy();
    expect(screen.getByText("0,6").style.color).toBe("var(--ow-warn-ink)");
    // What, how much, where, from the server's own figures; the engine's
    // sentence is counted on top.
    expect(screen.getByText("Mer formée : Hs 1,1–1,4 m sur 13,8 nm")).toBeTruthy();
    expect(screen.getByText("+1 alerte")).toBeTruthy();
    // No removal of the plan's own route, and no second button beside the
    // row: the row itself is what one taps.
    expect(screen.queryByRole("button", { name: /Supprimer/ })).toBeNull();
    expect(screen.queryByText("sélectionné")).toBeNull();
    expect(screen.queryByText(/Voir sur la carte/)).toBeNull();
    // The dashed door to a new option.
    await userEvent.click(screen.getByRole("button", { name: "+ Tracer une variante" }));
    expect(value.actions.startVariant).toHaveBeenCalledTimes(1);
  });

  it("chooses, removes, points at and opens a variant from its row", async () => {
    const variantWaypoints: [number, number][] = [MARSEILLE, MID, PORQUEROLLES];
    const tracks = [
      { id: "plan", waypoints: [MARSEILLE, PORQUEROLLES] as [number, number][], createdAt: "", passage: passage(), complexity: complexity(), error: null },
      { id: "v1", waypoints: variantWaypoints, createdAt: "", passage: { ...passage(), warnings: [] }, complexity: complexity(), error: null },
    ];
    const value = mount({ mode: "compare", compareAxis: "tracks", tracks, passage: passage(), complexity: complexity() });
    const row = screen.getByRole("button", { name: /Choisir l'option 2 pour le plan/ });
    expect(row.getAttribute("aria-pressed")).toBe("false");
    expect(row.parentElement!.style.boxShadow).toBe("");
    // Only the plan's option says « dans le plan ».
    expect(screen.getAllByText("dans le plan")).toHaveLength(1);
    // No alert, no engine: nothing under the figures but the actions.
    expect(screen.getAllByText(/alerte/)).toHaveLength(1);
    await userEvent.click(row);
    expect(value.actions.selectTrack).toHaveBeenCalledWith("v1");
    await userEvent.hover(row);
    expect(value.actions.highlightTrack).toHaveBeenCalledWith("v1");
    await userEvent.click(screen.getByRole("button", { name: "Supprimer l'option 2" }));
    expect(value.actions.removeTrack).toHaveBeenCalledWith("v1");
  });

  it("keeps the computing and the failed states of an option on its sub-row", () => {
    const tracks = [
      { id: "plan", waypoints: [MARSEILLE, PORQUEROLLES] as [number, number][], createdAt: "", passage: passage(), complexity: complexity(), error: null },
      { id: "v1", waypoints: [MARSEILLE, MID, PORQUEROLLES] as [number, number][], createdAt: "", passage: null, complexity: null, error: null },
      { id: "v2", waypoints: [MARSEILLE, [43.1, 5.6], PORQUEROLLES] as [number, number][], createdAt: "", passage: null, complexity: null, error: "Le serveur météo est indisponible." },
    ];
    mount({
      mode: "compare",
      compareAxis: "tracks",
      tracks,
      passage: passage(),
      complexity: complexity(),
      trackRequests: { v1: { id: 3, editSeq: 0 } },
    });
    expect(screen.getByText("calcul en cours…")).toBeTruthy();
    expect(screen.getByText("Le serveur météo est indisponible.")).toBeTruthy();
    // Nothing to choose until a passage lands; removal stays.
    expect((screen.getByRole("button", { name: /Choisir l'option 2/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Supprimer l'option 3" })).toBeTruthy();
    // Three options: the door to a fourth is closed, and says why.
    expect((screen.getByRole("button", { name: "+ Tracer une variante" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Trois options au plus.")).toBeTruthy();
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
        sea_level: 3,
      },
    ],
  };
};

describe("leg alerts", () => {
  const withSegment = (over: Partial<PassageReport["segments"][number]>): PassageReport => {
    const base = passage();
    return { ...base, segments: [{ ...base.segments[0], ...over }] };
  };

  it("says a sustained wind and a formed sea by their figures, with no chip", () => {
    mount({ passage: withSegment({ tws_kn: 18, hs_m: 1.6, wave_period_s: 9, sea_level: 3 }), complexity: complexity() });
    const wind = screen.getByText("18").closest("td") as HTMLElement;
    expect(wind.style.color).toBe("var(--ow-warn-ink)");
    expect(wind.textContent).toBe("18, Vent soutenu");
    const sea = screen.getByText("1,6").closest("td") as HTMLElement;
    expect(sea.style.color).toBe("var(--ow-warn-ink)");
    expect(sea.textContent).toBe("1,6, Mer formée");
    expect(document.querySelector(".ow-alert-chip")).toBeNull();
  });

  it("keeps a chip for a chop, which no figure says", () => {
    mount({
      passage: withSegment({ tws_kn: 9, hs_m: 0.9, wave_period_s: 4, sea_level: 2, sea_flag: "chop_following" }),
      complexity: complexity(),
    });
    expect(screen.getByText("Clapot suiveur · période 4 s")).toBeTruthy();
    // The server puts 0,9 m under the formed-sea mark: the figure stays plain.
    expect((screen.getByText("0,9").closest("td") as HTMLElement).style.color).toBe("var(--ow-fg-0)");
  });

  it("flags nothing the server did not flag", () => {
    // The same sea from a server that stamps no verdict (an older one): the
    // app does not judge a height or a period itself.
    mount({ passage: withSegment({ tws_kn: 9, hs_m: 1.6, wave_period_s: 4 }), complexity: complexity() });
    expect((screen.getByText("1,6").closest("td") as HTMLElement).style.color).toBe("var(--ow-fg-0)");
    expect(document.querySelector(".ow-alert-chip")).toBeNull();
  });
});

describe("open leg", () => {
  it("opens on the whole leg: every step in the table, the average in the card", async () => {
    const value = mount({ passage: twoStepPassage(), complexity: complexity(), selectedLegIdx: 0 });
    expect(screen.getByText(/^Tout le tronçon · /)).toBeTruthy();
    expect(screen.getByText(/moyenne de 2 pas/)).toBeTruthy();
    // The row gives the leg's sea as a range, its unit in the column header.
    expect(screen.getByText("0,6–1,5")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Mer m" })).toBeTruthy();
    // The card is compact under the table: what the table says (the wind,
    // the sea, the current of each step) it does not repeat.
    expect(screen.queryByText("6–9 (18) kn")).toBeNull();
    expect(screen.queryByText(/⚠ Mer formée/)).toBeNull();
    // The direction of the leg on the chart, said as a route, not a heading
    // to steer, with a hint that it ignores current and leeway.
    const route = screen.getByText(/^Route /);
    expect(route.getAttribute("title")).toMatch(/pas un cap à barrer/);
    // No build-up on the average.
    expect(screen.queryByText(/polaire/)).toBeNull();
    // No arrows to walk the steps: the table is how a step is picked.
    expect(screen.queryByRole("button", { name: /Pas (précédent|suivant)/ })).toBeNull();

    // The steps are there from the start, none picked, and there is no
    // choice of view to make first, nor a way back to show.
    const table = screen.getByRole("table", { name: "Pas du tronçon, heure par heure" });
    const heads = within(table).getAllByRole("button", { name: /^Pas \d sur 2/ });
    expect(heads.map((h) => h.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
    expect(screen.queryByRole("button", { name: "Tout le tronçon" })).toBeNull();
    // The whole leg is what the card reads, so the whole row is ringed.
    const wind = within(table).getByText("↑18").parentElement as HTMLElement;
    expect(wind.style.boxShadow).toContain("var(--ow-accent)");

    await userEvent.click(heads[1]);
    expect(value.actions.selectStep).toHaveBeenCalledWith(1);
  });

  it("opens the step picked in the table, and returns to the whole leg", async () => {
    const value = mount({
      passage: twoStepPassage(),
      complexity: complexity(),
      selectedLegIdx: 0,
      selectedStepIdx: 1,
    });
    const table = screen.getByRole("table", { name: "Pas du tronçon, heure par heure" });
    const heads = within(table).getAllByRole("button", { name: /^Pas \d sur 2/ });
    // The hour of each step, with its wind's direction said to a screen
    // reader (the arrow beside the hour is only drawn).
    expect(heads.map((h) => h.textContent)).toEqual([
      fmtClock("2026-09-10T08:00:00+02:00"),
      fmtClock("2026-09-10T13:00:00+02:00"),
    ]);
    expect(heads[1].getAttribute("aria-label")).toMatch(/, 330°$/);
    expect(heads.map((h) => h.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    // Each row says its unit once, and the cells carry bare figures: the
    // wind over its gust, the sea, the speed.
    expect(within(table).getByRole("rowheader", { name: "Vent kn" })).toBeTruthy();
    expect(within(table).getByRole("rowheader", { name: "Mer m" })).toBeTruthy();
    expect(within(table).getByText("↑18")).toBeTruthy();
    expect(within(table).getByText("1,5")).toBeTruthy();
    // The formed sea of step 2 is the tint of its cell: no marker, which is
    // kept for what a figure cannot say (a chop, a wind against the current).
    expect(within(table).queryByRole("img")).toBeNull();
    // No current on this passage: no current row.
    expect(within(table).queryByRole("rowheader", { name: "Courant kn" })).toBeNull();
    // The card is the picked step's: its hours, and how its speed adds up.
    // Rendered through the same formatter as the card: the runner's clock is
    // not Paris (a CI box sits on UTC), so the literal would read two hours off.
    expect(screen.getByText(`${fmtClock("2026-09-10T13:00:00+02:00")} → ${fmtClock("2026-09-10T18:00:00+02:00")}`)).toBeTruthy();
    expect(screen.getByText(/polaire/)).toBeTruthy();
    // Only its column is ringed.
    expect((within(table).getByText("↑18").parentElement as HTMLElement).style.boxShadow).toContain("var(--ow-accent)");

    await userEvent.click(heads[0]);
    expect(value.actions.selectStep).toHaveBeenCalledWith(0);

    // Back to the whole leg, from the corner of the table or by a second
    // tap on the column.
    await userEvent.click(within(table).getByRole("button", { name: "Tout le tronçon" }));
    expect(value.actions.selectStep).toHaveBeenLastCalledWith(null);
    await userEvent.click(heads[0]);
    await userEvent.click(heads[1]);
    expect(value.actions.selectStep).toHaveBeenLastCalledWith(null);
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

  it("shows a single-step leg as the step itself: no average, no table, no arrows", () => {
    mount({ passage: passage(), complexity: complexity(), selectedLegIdx: 0 });
    expect(screen.queryByText(/Moyenne/)).toBeNull();
    expect(screen.getByText(`${fmtClock("2026-09-10T08:00:00+02:00")} → ${fmtClock("2026-09-10T18:00:00+02:00")}`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tout le tronçon" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Pas du tronçon, heure par heure" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pas / })).toBeNull();
  });
});

// ── The arrival's day, in the totals ─────────────────────────────────────────
// The expected day goes through the same formatter rather than being written
// out: the instants carry their offset, the runner's timezone stays free.

describe("arrival day", () => {
  const overnight = (): PassageReport => ({
    ...passage(),
    arrival_time: "2026-09-11T08:07:00+02:00",
    duration_h: 24.1,
  });
  const nextDay = capitalise(fmtDay("2026-09-11T08:07:00+02:00"));

  it("names the day of an arrival that is not the departure's, in both totals", () => {
    mount({ passage: overnight(), complexity: complexity() });
    expect(screen.getByText(nextDay)).toBeTruthy();
    cleanup();
    render(<StatBand passage={overnight()} />);
    expect(screen.getByText(nextDay)).toBeTruthy();
    expect(screen.getByText(fmtClock("2026-09-11T08:07:00+02:00"))).toBeTruthy();
  });

  it("gives the hour alone when the passage ends on its departure day", () => {
    render(<StatBand passage={passage()} />);
    expect(screen.queryByText(capitalise(fmtDay("2026-09-10T18:00:00+02:00")))).toBeNull();
  });
});

// ── The day word beside the departure ────────────────────────────────────────
// Absolute instants, never a Paris clock time: the CI runner sits in UTC.
// toNaiveLocal writes the runner's own clock, the one the control reads back.

describe("departure day word", () => {
  afterEach(() => vi.useRealTimers());

  function mountAt(nowUtc: string, departureUtc: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(nowUtc));
    mountWith(<DepartureSlider value={toNaiveLocal(new Date(departureUtc))} onChange={vi.fn()} />);
  }

  it("calls yesterday « Hier », not « Aujourd'hui »", () => {
    mountAt("2026-10-11T10:00:00Z", "2026-10-10T10:00:00Z");
    expect(screen.getByText("Hier")).toBeTruthy();
    expect(screen.queryByText("Aujourd'hui")).toBeNull();
  });

  it("counts the days further back", () => {
    mountAt("2026-10-11T10:00:00Z", "2026-10-08T10:00:00Z");
    expect(screen.getByText("Il y a 3 jours")).toBeTruthy();
  });

  it("calls tomorrow morning « Demain », seen from the evening", () => {
    mountAt("2026-10-11T18:00:00Z", "2026-10-12T06:00:00Z");
    expect(screen.getByText("Demain")).toBeTruthy();
  });
});

// ── « Ajuster » ───────────────────────────────────────────────────────────────

describe("departure « Ajuster »", () => {
  afterEach(() => {
    delete (HTMLInputElement.prototype as { showPicker?: unknown }).showPicker;
  });

  it("opens the calendar in the same tap, not a field to tap again", () => {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, "showPicker", { value: showPicker, configurable: true });
    mountWith(<DepartureSlider value="2026-10-12T10:00" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ajuster" }));
    const field = screen.getByLabelText("Date de départ") as HTMLInputElement;
    expect(field.type).toBe("datetime-local");
    expect(document.activeElement).toBe(field);
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("leaves the field focused where the browser has no picker to open", () => {
    mountWith(<DepartureSlider value="2026-10-12T10:00" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajuster" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Date de départ"));
  });
});
