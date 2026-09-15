// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import {
  planReducer,
  createInitialState,
  isFetching,
  isLoadingForMode,
  type PlanAction,
  type PlanState,
} from "./reducer";
import type { InitialSession } from "./initial";
import { toTzAware } from "../../domain/datetime";
import type { PassageReport, ComplexityScore, PassageWindow } from "../types";

/**
 * The departure the server resolves, as the slider and the URL spell it.
 *
 * The reducer turns `passage.departure_time` (an instant, with an offset) back
 * into this naive local form, so the fixtures below build the wire value from
 * the naive one rather than hard-coding a Paris offset. A CI runner on UTC
 * would otherwise read two hours off, and pinning `TZ` in the vitest config
 * would hide exactly the class of bug #310 just fixed.
 */
const RESOLVED_DEPARTURE = "2026-09-10T08:00";

const MARSEILLE: [number, number] = [43.29, 5.37];
const PORQUEROLLES: [number, number] = [43.0, 6.2];

const passage = (over: Partial<PassageReport> = {}): PassageReport => ({
  archetype: "cruiser_30ft",
  departure_time: toTzAware(RESOLVED_DEPARTURE),
  arrival_time: toTzAware("2026-09-10T18:00"),
  duration_h: 10,
  distance_nm: 55,
  efficiency: 0.75,
  model: "meteofrance_arome_france_hd",
  segments: [],
  warnings: [],
  ...over,
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

const aWindow = (over: Partial<PassageWindow> = {}): PassageWindow => ({
  departure: toTzAware("2026-09-11T06:00"),
  arrival: toTzAware("2026-09-11T16:00"),
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
  ...over,
});

const session = (over: Partial<InitialSession> = {}): InitialSession => ({
  waypoints: [MARSEILLE, PORQUEROLLES],
  originWaypoints: over.waypoints ?? [MARSEILLE, PORQUEROLLES],
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
  ...over,
});

const start = (over: Partial<InitialSession> = {}) => createInitialState(session(over));

/** Fold a list of actions, the way React would. */
function run(state: PlanState, ...actions: PlanAction[]): PlanState {
  return actions.reduce(planReducer, state);
}

const succeedSweep = (requestId: number): PlanAction => ({
  type: "FETCH_SUCCEEDED",
  requestId,
  kind: "sweep",
  configFingerprint: "arome|cruiser_30ft",
  windows: [aWindow()],
  metaWarnings: [],
  forecastUpdatedAt: "2026-09-09T06:00:00Z",
});

const succeedSingle = (requestId: number, over: Partial<PassageReport> = {}): PlanAction => ({
  type: "FETCH_SUCCEEDED",
  requestId,
  kind: "single",
  configFingerprint: "arome|cruiser_30ft",
  passage: passage(over),
  complexity: complexity(),
  forecastUpdatedAt: "2026-09-09T06:00:00Z",
});

describe("route edits", () => {
  it("appends, moves, inserts and deletes on its own state", () => {
    let s = createInitialState(session({ waypoints: [] }));
    s = run(
      s,
      { type: "WAYPOINT_APPENDED", lat: 43.29, lon: 5.37 },
      { type: "WAYPOINT_APPENDED", lat: 43.0, lon: 6.2 },
    );
    expect(s.waypoints).toEqual([MARSEILLE, PORQUEROLLES]);

    s = planReducer(s, { type: "WAYPOINT_INSERTED", afterIndex: 0, lat: 43.1, lon: 5.9 });
    expect(s.waypoints).toEqual([MARSEILLE, [43.1, 5.9], PORQUEROLLES]);

    s = planReducer(s, { type: "WAYPOINT_MOVED", index: 1, lat: 43.2, lon: 5.8 });
    expect(s.waypoints[1]).toEqual([43.2, 5.8]);

    s = planReducer(s, { type: "WAYPOINT_DELETED", index: 1 });
    expect(s.waypoints).toEqual([MARSEILLE, PORQUEROLLES]);
  });

  it("marks the plan stale and collapses the open leg", () => {
    const s = run(
      start(),
      { type: "LEG_SELECTED", index: 0 },
      { type: "WAYPOINT_APPENDED", lat: 42.9, lon: 6.4 },
    );
    expect(s.isStale).toBe(true);
    expect(s.selectedLegIdx).toBeNull();
  });

  it("rewinds the mobile compact step under two waypoints, and does not restore it on its own", () => {
    let s = run(start(), { type: "WAYPOINT_DELETED", index: 1 });
    expect(s.actionTaken).toBe(false);
    s = planReducer(s, { type: "WAYPOINT_APPENDED", lat: 42.9, lon: 6.4 });
    expect(s.actionTaken).toBe(false);
    // Opening the form, asking for a computation or opening the comparison
    // all leave the compact step.
    expect(planReducer(s, { type: "FORM_OPENED" }).actionTaken).toBe(true);
    expect(planReducer(s, { type: "FETCH_STARTED", requestId: 1, kind: "single" }).actionTaken).toBe(true);
    expect(planReducer(s, { type: "COMPARE_OPENED", axis: "slots" }).actionTaken).toBe(true);
  });

  it("keeps the open leg through a departure change", () => {
    const s = run(
      start(),
      { type: "LEG_SELECTED", index: 1 },
      { type: "DEPARTURE_CHANGED", departure: "2026-09-11T08:00" },
    );
    expect(s.selectedLegIdx).toBe(1);
    expect(s.isStale).toBe(true);
  });
});

describe("step of the open leg", () => {
  it("opens a step under the open leg, and the average again on null", () => {
    let s = run(start(), { type: "LEG_SELECTED", index: 0 }, { type: "STEP_SELECTED", index: 2 });
    expect(s.selectedStepIdx).toBe(2);
    s = planReducer(s, { type: "STEP_SELECTED", index: null });
    expect(s.selectedStepIdx).toBeNull();
    expect(s.selectedLegIdx).toBe(0);
  });

  it("ignores a step when no leg is open", () => {
    const s = run(start(), { type: "STEP_SELECTED", index: 1 });
    expect(s.selectedStepIdx).toBeNull();
  });

  it("follows the leg: a change of leg, of route or of result drops it", () => {
    const open = run(start(), { type: "LEG_SELECTED", index: 0 }, { type: "STEP_SELECTED", index: 1 });

    expect(planReducer(open, { type: "LEG_SELECTED", index: 1 }).selectedStepIdx).toBeNull();
    expect(planReducer(open, { type: "LEG_SELECTED", index: null }).selectedStepIdx).toBeNull();
    expect(planReducer(open, { type: "WAYPOINT_APPENDED", lat: 42.9, lon: 6.4 }).selectedStepIdx).toBeNull();

    const recomputed = run(
      open,
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      {
        type: "FETCH_SUCCEEDED",
        requestId: 1,
        kind: "single",
        configFingerprint: "fp",
        passage: passage(),
        complexity: complexity(),
        forecastUpdatedAt: "2026-09-10T06:00:00Z",
      },
    );
    expect(recomputed.selectedStepIdx).toBeNull();
  });

  it("survives an edit that keeps the leg open", () => {
    const s = run(
      start(),
      { type: "LEG_SELECTED", index: 0 },
      { type: "STEP_SELECTED", index: 1 },
      { type: "DEPARTURE_CHANGED", departure: "2026-09-11T08:00" },
    );
    expect(s.selectedLegIdx).toBe(0);
    expect(s.selectedStepIdx).toBe(1);
  });
});

describe("the comparison over the plan", () => {
  it("keeps the plan's results in memory while the comparison is open", () => {
    const withResults = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      succeedSingle(1),
      { type: "COMPARE_OPENED", axis: "slots" },
    );
    expect(withResults.mode).toBe("compare");
    expect(withResults.compareAxis).toBe("slots");
    expect(withResults.passage).not.toBeNull();
    // And the windows under the plan once it closes.
    const closed = run(
      withResults,
      { type: "FETCH_STARTED", requestId: 2, kind: "sweep" },
      succeedSweep(2),
      { type: "COMPARE_CLOSED" },
    );
    expect(closed.mode).toBe("single");
    expect(closed.windows).toHaveLength(1);
  });

  it("seeds the window the shell hands it, and only then", () => {
    const seeded = planReducer(start(), {
      type: "COMPARE_OPENED",
      axis: "slots",
      sweep: { earliest: "2026-09-10T08:00", latest: "2026-09-12T08:00", intervalHours: 3 },
    });
    expect(seeded.sweepLatest).toBe("2026-09-12T08:00");
    const kept = planReducer(
      { ...seeded, sweepLatest: "2026-09-13T08:00" },
      { type: "COMPARE_OPENED", axis: "tracks" },
    );
    expect(kept.sweepLatest).toBe("2026-09-13T08:00");
    expect(kept.compareAxis).toBe("tracks");
  });

  it("clears the error when the comparison opens or closes, and takes the axis of the door", () => {
    const failed = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      { type: "FETCH_FAILED", requestId: 1, error: "boom" },
    );
    expect(run(failed, { type: "COMPARE_OPENED", axis: "slots" }).apiError).toBeNull();
    expect(run(failed, { type: "COMPARE_OPENED", axis: "tracks" }).compareAxis).toBe("tracks");
    expect(run(failed, { type: "COMPARE_OPENED", axis: "tracks" }, { type: "COMPARE_CLOSED" }).mode).toBe("single");
  });

  it("keeps a way back to the comparison a slot was opened from, until the plan is kept or the route edited", () => {
    const opened = run(
      start({ mode: "compare" }),
      { type: "WINDOW_SELECTED", window: aWindow({ passage: passage(), complexity_full: complexity() }), departure: "2026-09-11T06:00", configFingerprint: "x" },
    );
    expect(opened.mode).toBe("single");
    expect(opened.returnTo).toBe("slots");
    expect(run(opened, { type: "PLAN_KEPT" }).returnTo).toBeNull();
    expect(run(opened, { type: "WAYPOINT_APPENDED", lat: 42.9, lon: 6.4 }).returnTo).toBeNull();
    expect(run(opened, { type: "COMPARE_OPENED", axis: "slots" }).returnTo).toBeNull();
    // A departure change is not a route change: the windows still apply.
    expect(run(opened, { type: "DEPARTURE_CHANGED", departure: "2026-09-11T09:00" }).returnTo).toBe("slots");
  });

  it("does not invalidate anything when the sweep range moves", () => {
    const computed = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      succeedSingle(1),
    );
    const s = planReducer(computed, { type: "SWEEP_CHANGED", intervalHours: 6 });
    expect(s.sweepIntervalHours).toBe(6);
    expect(s.isStale).toBe(false);
    expect(s.editSeq).toBe(computed.editSeq);
  });
});

describe("the track axis", () => {
  const MID: [number, number] = [43.15, 5.8];
  const drawn = (over: Partial<PlanState> = {}) =>
    run(
      { ...start(), ...over },
      { type: "VARIANT_STARTED" },
      { type: "VARIANT_POINT_ADDED", lat: MID[0], lon: MID[1] },
    );

  it("draws a variant between the plan's ends, and keeps those ends", () => {
    const s = drawn();
    expect(s.variant).toEqual([MARSEILLE, MID, PORQUEROLLES]);
    // The ends cannot go; a point between them can.
    expect(run(s, { type: "VARIANT_POINT_DELETED", index: 0 }).variant).toHaveLength(3);
    expect(run(s, { type: "VARIANT_POINT_DELETED", index: 2 }).variant).toHaveLength(3);
    expect(run(s, { type: "VARIANT_POINT_DELETED", index: 1 }).variant).toEqual([MARSEILLE, PORQUEROLLES]);
    expect(run(s, { type: "VARIANT_CANCELLED" }).variant).toBeNull();
    // A straight line is not a variant.
    expect(run(start(), { type: "VARIANT_STARTED" }, { type: "VARIANT_FINISHED", id: "v1", createdAt: "x" }).tracks).toHaveLength(0);
  });

  it("makes the plan option 1 with its fresh passage when the first variant lands", () => {
    const computed = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      succeedSingle(1),
    );
    const s = run(
      computed,
      { type: "VARIANT_STARTED" },
      { type: "VARIANT_POINT_ADDED", lat: MID[0], lon: MID[1] },
      { type: "VARIANT_FINISHED", id: "v1", createdAt: "2026-09-10T07:00" },
    );
    expect(s.variant).toBeNull();
    expect(s.tracks.map((t) => t.id)).toEqual(["plan", "v1"]);
    expect(s.tracks[0].passage).not.toBeNull();
    expect(s.tracks[1].passage).toBeNull();
    expect(s.highlightedTrackId).toBe("v1");
    // A stale plan lends nothing: the shell computes option 1 too.
    const stale = run(drawn({ passage: passage(), complexity: complexity(), isStale: true }), { type: "VARIANT_FINISHED", id: "v1", createdAt: "x" });
    expect(stale.tracks[0].passage).toBeNull();
  });

  it("computes each option on its own request, and drops a reply the departure outran", () => {
    const s = run(drawn(), { type: "VARIANT_FINISHED", id: "v1", createdAt: "x" }, { type: "TRACK_STARTED", trackId: "v1", requestId: 7 });
    expect(s.trackRequests.v1).toEqual({ id: 7, editSeq: s.editSeq });
    const done = run(s, { type: "TRACK_COMPUTED", trackId: "v1", requestId: 7, passage: passage(), complexity: complexity() });
    expect(done.tracks[1].passage).not.toBeNull();
    expect(done.trackRequests.v1).toBeUndefined();
    // Superseded id: ignored. Edited meanwhile: dropped, and the axis says stale.
    expect(run(s, { type: "TRACK_COMPUTED", trackId: "v1", requestId: 6, passage: passage(), complexity: complexity() })).toBe(s);
    const edited = run(s, { type: "DEPARTURE_CHANGED", departure: "2026-09-11T08:00" });
    expect(edited.tracksStale).toBe(true);
    const late = run(edited, { type: "TRACK_COMPUTED", trackId: "v1", requestId: 7, passage: passage(), complexity: complexity() });
    expect(late.tracks[1].passage).toBeNull();
    expect(late.trackRequests.v1).toBeUndefined();
    // A failure is kept on the row.
    expect(run(s, { type: "TRACK_FAILED", trackId: "v1", requestId: 7, error: "boom" }).tracks[1].error).toBe("boom");
  });

  it("opens an option in the plan, with the way back, and keeps or drops the options", () => {
    const s = run(
      drawn(),
      { type: "VARIANT_FINISHED", id: "v1", createdAt: "x" },
      { type: "TRACK_STARTED", trackId: "v1", requestId: 7 },
      { type: "TRACK_COMPUTED", trackId: "v1", requestId: 7, passage: passage(), complexity: complexity() },
    );
    const opened = run(s, { type: "TRACK_OPENED", id: "v1", configFingerprint: "x" });
    expect(opened.mode).toBe("single");
    expect(opened.waypoints).toEqual([MARSEILLE, MID, PORQUEROLLES]);
    expect(opened.returnTo).toBe("tracks");
    expect(opened.openedTrackId).toBe("v1");
    expect(opened.persist?.url).toContain("wpts=");
    // Not computed yet: nothing to open.
    expect(run(s, { type: "TRACK_OPENED", id: "plan", configFingerprint: "x" })).toBe(s);
    // Back to the comparison keeps the options; keeping the plan drops them.
    expect(run(opened, { type: "COMPARE_OPENED", axis: "tracks" }).tracks).toHaveLength(2);
    const kept = run(opened, { type: "PLAN_KEPT" });
    expect(kept.tracks).toHaveLength(0);
    expect(kept.returnTo).toBeNull();
    // Editing the route drops them too: the ends they shared are gone.
    expect(run(opened, { type: "WAYPOINT_MOVED", index: 1, lat: 43.2, lon: 5.9 }).tracks).toHaveLength(0);
  });

  it("chooses an option as the plan's route without leaving the comparison, and forgets the sweep", () => {
    const s = run(
      drawn(),
      { type: "FETCH_STARTED", requestId: 1, kind: "sweep" },
      succeedSweep(1),
      { type: "VARIANT_FINISHED", id: "v1", createdAt: "x" },
      { type: "TRACK_STARTED", trackId: "v1", requestId: 7 },
      { type: "TRACK_COMPUTED", trackId: "v1", requestId: 7, passage: passage(), complexity: complexity() },
    );
    expect(s.windows).toHaveLength(1);
    const chosen = run(s, { type: "TRACK_SELECTED", id: "v1", configFingerprint: "x" });
    expect(chosen.mode).toBe(s.mode);
    expect(chosen.waypoints).toEqual([MARSEILLE, MID, PORQUEROLLES]);
    expect(chosen.windows).toBeNull();
    expect(chosen.returnTo).toBeNull();
    expect(chosen.persist?.url).toContain("wpts=");
    // Choosing the option already on screen changes nothing.
    expect(run(chosen, { type: "TRACK_SELECTED", id: "v1", configFingerprint: "x" })).toBe(chosen);
  });

  it("removes any option but the one the plan is on, the plan's own track included", () => {
    const s = run(
      drawn({ passage: passage(), complexity: complexity() }),
      { type: "VARIANT_FINISHED", id: "v1", createdAt: "x" },
      { type: "TRACK_STARTED", trackId: "v1", requestId: 7 },
      { type: "TRACK_COMPUTED", trackId: "v1", requestId: 7, passage: passage(), complexity: complexity() },
    );
    // The plan is on its own track: that one stays, the variant can go.
    expect(run(s, { type: "TRACK_REMOVED", id: "plan" })).toBe(s);
    // Only the plan left: the axis is the plan alone again.
    expect(run(s, { type: "TRACK_REMOVED", id: "v1" }).tracks).toHaveLength(0);
    // The plan moved to the variant: now the plan's own track can go.
    const chosen = run(s, { type: "TRACK_SELECTED", id: "v1", configFingerprint: "x" });
    expect(run(chosen, { type: "TRACK_REMOVED", id: "v1" })).toBe(chosen);
    const gone = run(chosen, { type: "TRACK_REMOVED", id: "plan" });
    expect(gone.tracks).toHaveLength(0);
    expect(gone.waypoints).toEqual([MARSEILLE, MID, PORQUEROLLES]);
  });

  it("marks the options to recompute when a slot is picked on the other axis", () => {
    const s = run(drawn(), { type: "VARIANT_FINISHED", id: "v1", createdAt: "x" });
    const picked = run(
      { ...s, mode: "compare" },
      { type: "WINDOW_SELECTED", window: aWindow({ passage: passage(), complexity_full: complexity() }), departure: "2026-09-11T06:00", configFingerprint: "x" },
    );
    expect(picked.tracksStale).toBe(true);
  });

  it("does not blank the track axis while a sweep runs", () => {
    const s = run(start(), { type: "COMPARE_OPENED", axis: "tracks" }, { type: "FETCH_STARTED", requestId: 1, kind: "sweep" });
    expect(isLoadingForMode(s)).toBe(false);
    expect(isLoadingForMode({ ...s, compareAxis: "slots" })).toBe(true);
  });
});

describe("computing", () => {
  it("commits the result, clears staleness and emits the two writes", () => {
    const s = run(
      start({ isStale: true }),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      succeedSingle(1),
    );
    expect(s.isStale).toBe(false);
    expect(s.passage?.distance_nm).toBe(55);
    expect(s.pending).toBeNull();
    expect(s.persist?.url).toContain("/plan?wpts=43.29000,5.37000;43.00000,6.20000");
    // The URL and the cache carry the departure the server resolved, not what
    // the user typed: in arrival mode they are not the same thing.
    expect(s.persist?.url).toContain(`departure=${encodeURIComponent(RESOLVED_DEPARTURE)}`);
    expect(s.persist?.cache).toMatchObject({ kind: "single", departure: RESOLVED_DEPARTURE });
  });

  it("persists the resolved departure in arrival mode, not the target ETA", () => {
    const s = run(
      start({ timeAnchor: "arrival", departure: "2026-09-10T18:00" }),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      succeedSingle(1, { departure_time: toTzAware("2026-09-10T07:30") }),
    );
    // The slider keeps the target arrival the user typed.
    expect(s.departure).toBe("2026-09-10T18:00");
    expect(s.persist?.cache).toMatchObject({ departure: "2026-09-10T07:30" });
  });

  it("does not rewrite the address bar for a sweep, whose range the URL cannot carry", () => {
    const s = run(
      start({ mode: "compare" }),
      { type: "FETCH_STARTED", requestId: 1, kind: "sweep" },
      {
        type: "FETCH_SUCCEEDED",
        requestId: 1,
        kind: "sweep",
        configFingerprint: "arome|cruiser_30ft",
        windows: [aWindow()],
        metaWarnings: ["modèle dégradé"],
        forecastUpdatedAt: "2026-09-09T06:00:00Z",
      },
    );
    expect(s.windows).toHaveLength(1);
    expect(s.metaWarnings).toEqual(["modèle dégradé"]);
    expect(s.persist?.url).toBeUndefined();
    expect(s.persist?.cache).toMatchObject({ kind: "compare", sweepIntervalHours: 3 });
  });

  it("reports a failure and stops the spinner", () => {
    const s = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      { type: "FETCH_FAILED", requestId: 1, error: "Le service météo a mis trop de temps" },
    );
    expect(s.apiError).toBe("Le service météo a mis trop de temps");
    expect(s.pending).toBeNull();
  });

  it("gives each mode its own spinner", () => {
    const s = planReducer(start(), { type: "FETCH_STARTED", requestId: 1, kind: "sweep" });
    expect(isFetching(s, "sweep")).toBe(true);
    expect(isFetching(s, "single")).toBe(false);
    // The panel is on the single view, so it does not blank for a sweep.
    expect(isLoadingForMode(s)).toBe(false);
    expect(isLoadingForMode({ ...s, mode: "compare" })).toBe(true);
  });
});

describe("l'origine du brouillon", () => {
  // originWaypoints dit de quelle route les edits en cours sont des edits.
  // C'est ce que le brouillon compare a l'URL au montage (plan/draft.ts).
  it("suit la route calculee, pas la route en cours d'edition", () => {
    let s = start({ waypoints: [MARSEILLE, PORQUEROLLES] });
    expect(s.originWaypoints).toEqual([MARSEILLE, PORQUEROLLES]);

    s = run(s, { type: "WAYPOINT_APPENDED", lat: 43.1, lon: 5.93 });
    // Un point de plus ne deplace pas l'origine : c'est encore un edit de la
    // route d'avant.
    expect(s.waypoints).toHaveLength(3);
    expect(s.originWaypoints).toEqual([MARSEILLE, PORQUEROLLES]);

    s = run(s, { type: "FETCH_STARTED", requestId: 1, kind: "single" }, succeedSingle(1));
    // Le calcul valide la route : elle devient l'origine des edits suivants.
    expect(s.originWaypoints).toEqual(s.waypoints);
  });

  it("suit aussi un balayage et le choix d'une fenetre", () => {
    let s = start({ waypoints: [MARSEILLE, PORQUEROLLES], mode: "compare" });
    s = run(s, { type: "WAYPOINT_APPENDED", lat: 43.1, lon: 5.93 });
    const edited = s.waypoints;
    s = run(
      s,
      { type: "FETCH_STARTED", requestId: 1, kind: "sweep" },
      {
        type: "FETCH_SUCCEEDED",
        requestId: 1,
        kind: "sweep",
        configFingerprint: "arome|cruiser_30ft",
        windows: [aWindow()],
        metaWarnings: [],
        forecastUpdatedAt: "2026-09-09T06:00:00Z",
      },
    );
    expect(s.originWaypoints).toEqual(edited);
  });

  it("repart de rien apres un nouveau plan", () => {
    let s = start({ waypoints: [MARSEILLE, PORQUEROLLES] });
    s = run(s, {
      type: "RESET",
      archetype: "cruiser_30ft",
      departure: "2026-09-11T08:00",
      sweepLatest: "2026-09-13T08:00",
    });
    expect(s.waypoints).toEqual([]);
    expect(s.originWaypoints).toEqual([]);
  });
});

describe("the race (annexe B, C1)", () => {
  it("drops the reply of a computation a newer one has replaced", () => {
    const s = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      { type: "FETCH_STARTED", requestId: 2, kind: "single" },
      // The first request answers last, as a slow network will do.
      succeedSingle(1, { distance_nm: 999 }),
    );
    expect(s.passage).toBeNull();
    expect(s.persist).toBeNull();
    // The newer request is still in flight and its spinner still runs.
    expect(s.pending).toMatchObject({ id: 2 });

    const settled = planReducer(s, succeedSingle(2, { distance_nm: 55 }));
    expect(settled.passage?.distance_nm).toBe(55);
  });

  it("drops the reply of a plan the user has edited meanwhile, and keeps it stale", () => {
    const s = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      // Drag of a waypoint while the computation is in flight.
      { type: "WAYPOINT_MOVED", index: 1, lat: 42.9, lon: 6.4 },
      succeedSingle(1, { distance_nm: 999 }),
    );
    expect(s.passage).toBeNull();
    // The crux: nothing is persisted next to the new waypoints, and the panel
    // keeps offering « Recalculer ».
    expect(s.persist).toBeNull();
    expect(s.isStale).toBe(true);
    expect(s.pending).toBeNull();
  });

  it("drops the error of a plan the user has edited meanwhile", () => {
    const s = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      { type: "ARCHETYPE_CHANGED", archetype: "cata_38ft" },
      { type: "FETCH_FAILED", requestId: 1, error: "boom" },
    );
    expect(s.apiError).toBeNull();
    expect(s.pending).toBeNull();
  });

  it("keeps a reply whose plan only saw the comparison open or a sweep tweak", () => {
    const s = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      { type: "COMPARE_OPENED", axis: "slots" },
      { type: "SWEEP_CHANGED", latest: "2026-09-14T08:00" },
      succeedSingle(1),
    );
    expect(s.passage?.distance_nm).toBe(55);
  });

  it("ignores a reply that arrives when nothing is pending at all", () => {
    const s = planReducer(start(), succeedSingle(7));
    expect(s.passage).toBeNull();
  });
});

describe("window drill-down", () => {
  it("hydrates from the picked window without computing", () => {
    const computed = run(
      start({ mode: "compare" }),
      { type: "FETCH_STARTED", requestId: 1, kind: "sweep" },
      {
        type: "FETCH_SUCCEEDED",
        requestId: 1,
        kind: "sweep",
        configFingerprint: "arome|cruiser_30ft",
        windows: [aWindow({ passage: passage(), complexity_full: complexity() })],
        metaWarnings: ["modèle dégradé"],
        forecastUpdatedAt: "2026-09-09T06:00:00Z",
      },
    );
    const s = planReducer(computed, {
      type: "WINDOW_SELECTED",
      window: computed.windows![0],
      departure: "2026-09-11T06:00",
      configFingerprint: "arome|cruiser_30ft",
    });
    expect(s.mode).toBe("single");
    expect(s.departure).toBe("2026-09-11T06:00");
    expect(s.passage).not.toBeNull();
    expect(s.isStale).toBe(false);
    expect(s.metaWarnings).toEqual([]);
    // The table stays in memory so toggling back needs no refetch.
    expect(s.windows).toHaveLength(1);
    // Drill-down inherits the sweep's fingerprint: it is not a new run.
    expect(s.persist?.cache).toMatchObject({ kind: "single", inheritFingerprint: true });
  });

  it("drops the table and leaves the computing to the shell when the window has no detail", () => {
    const s = planReducer(start({ mode: "compare", windows: [aWindow()] }), {
      type: "WINDOW_SELECTED",
      window: aWindow(),
      departure: "2026-09-11T06:00",
      configFingerprint: "arome|cruiser_30ft",
    });
    expect(s.windows).toBeNull();
    expect(s.passage).toBeNull();
    expect(s.persist).toBeNull();
  });
});

describe("reset", () => {
  it("empties the plan, clears the cache and rewinds the address bar", () => {
    const computed = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      succeedSingle(1),
    );
    const s = planReducer(computed, {
      type: "RESET",
      archetype: "cruiser_30ft",
      departure: "2026-09-11T10:00",
      sweepLatest: "2026-09-13T10:00",
    });
    expect(s.waypoints).toEqual([]);
    expect(s.passage).toBeNull();
    expect(s.isStale).toBe(false);
    expect(s.actionTaken).toBe(false);
    expect(s.persist).toMatchObject({ url: "/plan", cache: { kind: "clear" } });
  });

  it("makes any computation still in flight land on nothing", () => {
    const s = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      {
        type: "RESET",
        archetype: "cruiser_30ft",
        departure: "2026-09-11T10:00",
        sweepLatest: "2026-09-13T10:00",
      },
      succeedSingle(1),
    );
    expect(s.passage).toBeNull();
    expect(s.waypoints).toEqual([]);
  });
});

describe("persist commands", () => {
  it("gives every command a strictly increasing sequence number", () => {
    const first = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      succeedSingle(1),
    );
    const second = run(
      first,
      { type: "FETCH_STARTED", requestId: 2, kind: "single" },
      succeedSingle(2),
    );
    expect(second.persist!.seq).toBeGreaterThan(first.persist!.seq);
  });

  it("emits none while the user is only editing", () => {
    const s = run(
      start(),
      { type: "WAYPOINT_APPENDED", lat: 42.9, lon: 6.4 },
      { type: "DEPARTURE_CHANGED", departure: "2026-09-11T08:00" },
      { type: "COMPARE_OPENED", axis: "slots" },
    );
    expect(s.persist).toBeNull();
  });
});

describe("cold-start retry", () => {
  const scheduled = { type: "FETCH_RETRY_SCHEDULED", requestId: 1, at: 1000, attempt: 1, max: 4 } as const;

  it("records the wait and drops the pending request", () => {
    const s = run(start(), { type: "FETCH_STARTED", requestId: 1, kind: "single" }, scheduled);
    expect(s.pending).toBeNull();
    expect(s.apiError).toBeNull();
    expect(s.retry).toEqual({ at: 1000, attempt: 1, max: 4 });
  });

  it("ignores a wait for a superseded request", () => {
    const s = run(start(), { type: "FETCH_STARTED", requestId: 2, kind: "single" }, scheduled);
    expect(s.retry).toBeNull();
    expect(s.pending?.id).toBe(2);
  });

  it("clears the wait when a request starts, fails or the comparison opens", () => {
    const waiting = run(start(), { type: "FETCH_STARTED", requestId: 1, kind: "single" }, scheduled);
    expect(run(waiting, { type: "FETCH_STARTED", requestId: 2, kind: "single" }).retry).toBeNull();
    expect(run(waiting, { type: "COMPARE_OPENED", axis: "slots" }).retry).toBeNull();
    const failed = run(
      waiting,
      { type: "FETCH_STARTED", requestId: 2, kind: "single" },
      { type: "FETCH_FAILED", requestId: 2, error: "boom" },
    );
    expect(failed.retry).toBeNull();
    expect(failed.apiError).toBe("boom");
  });
});
