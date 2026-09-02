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

  it("rewinds the mobile pick-a-mode step under two waypoints, and does not restore it on its own", () => {
    let s = run(start(), { type: "WAYPOINT_DELETED", index: 1 });
    expect(s.actionTaken).toBe(false);
    s = planReducer(s, { type: "WAYPOINT_APPENDED", lat: 42.9, lon: 6.4 });
    expect(s.actionTaken).toBe(false);
    s = planReducer(s, { type: "MODE_CHANGED", mode: "single" });
    expect(s.actionTaken).toBe(true);
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

describe("mode and sweep", () => {
  it("keeps the opposite mode's results in memory", () => {
    const withResults = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      succeedSingle(1),
      { type: "MODE_CHANGED", mode: "compare" },
    );
    expect(withResults.mode).toBe("compare");
    expect(withResults.passage).not.toBeNull();
  });

  it("clears the error when the user switches mode", () => {
    const s = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      { type: "FETCH_FAILED", requestId: 1, error: "boom" },
      { type: "MODE_CHANGED", mode: "compare" },
    );
    expect(s.apiError).toBeNull();
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

  it("keeps a reply whose plan only saw a mode switch or a sweep tweak", () => {
    const s = run(
      start(),
      { type: "FETCH_STARTED", requestId: 1, kind: "single" },
      { type: "MODE_CHANGED", mode: "compare" },
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
      { type: "MODE_CHANGED", mode: "compare" },
    );
    expect(s.persist).toBeNull();
  });
});
