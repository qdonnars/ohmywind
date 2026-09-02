// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The state machine behind `/plan`.
 *
 * `PlanPage` used to hold twenty `useState` and drive them from a dozen
 * handlers and four effects. Three consequences, all of them user-visible:
 *
 * - **A race.** `doFetch` had no cancellation and no request id. Dragging a
 *   waypoint while a computation was in flight set `isStale`, then the reply
 *   landed, cleared it, and the old passage was displayed as fresh *and*
 *   persisted next to the new waypoints (annexe B, C1).
 * - **A shared spinner.** One `isLoading` for both the single computation and
 *   the sweep, so either one blanked the whole panel.
 * - **Scattered persistence.** URL rewrites, cache writes and draft writes
 *   happened from five different call sites, each with its own idea of when.
 *
 * Everything below is pure and tested without a DOM. The impure half (fetches,
 * abort controllers, localStorage, the address bar) lives in
 * `usePlanSession.ts` and only ever talks to this module through actions and
 * through the `persist` command the reducer emits.
 *
 * ## Ignoring a result that no longer applies
 *
 * Two independent guards, both needed:
 *
 * - `pending.id` vs the action's `requestId` drops the reply of a computation
 *   that a newer one has already replaced.
 * - `pending.editSeq` vs `editSeq` drops the reply of a computation whose
 *   inputs the user has edited since. `editSeq` is bumped by exactly the
 *   actions that mark the plan stale, so a change that does not invalidate a
 *   result (picking a mode, moving the sweep range) does not throw it away.
 *
 * A dropped reply clears the spinner and changes nothing else: `isStale` is
 * already true, so the panel is already offering « Recalculer ».
 */

import type { PassageReport, ComplexityScore, PassageWindow } from "../types";
import type { PlanMode, TimeAnchor } from "../ModeToggle";
import { buildPlanUrl } from "../parseUrl";
import type { InitialSession } from "./initial";
import { toNaiveLocal } from "../../domain/datetime";

export type FetchKind = "single" | "sweep";

/** A write the imperative shell owes the outside world. Emitted by the
    reducer, applied once by the persistence effect. `seq` makes each command
    identifiable so a re-render can never replay one. */
export interface PersistCommand {
  seq: number;
  /** Address bar, when the committed plan moved. */
  url?: string;
  /** `ow_last_simulation_v1`, when a result was committed or discarded. */
  cache?: CacheWrite;
}

export type CacheWrite =
  | { kind: "clear" }
  | {
      kind: "single";
      waypoints: [number, number][];
      archetype: string;
      configFingerprint: string;
      departure: string;
      passage: PassageReport;
      complexity: ComplexityScore;
      forecastUpdatedAt: string;
      /** Drill-down from a window inherits the fingerprint of the sweep that
          produced it: it is metadata reshuffling, not a new run. */
      inheritFingerprint?: boolean;
    }
  | {
      kind: "compare";
      waypoints: [number, number][];
      archetype: string;
      configFingerprint: string;
      sweepEarliest: string;
      sweepLatest: string;
      sweepIntervalHours: number;
      windows: PassageWindow[];
      metaWarnings: string[];
      forecastUpdatedAt: string;
    };

export interface PlanState {
  // ── inputs ────────────────────────────────────────────────────────────────
  waypoints: [number, number][];
  /** The route the current edits are edits *of*: the seed at mount, then the
      route of every computation that lands. Only the draft reads it, to say
      which URL it may outrank (`plan/draft.ts`). */
  originWaypoints: [number, number][];
  archetype: string;
  /** Naive local "YYYY-MM-DDTHH:MM". A target arrival in `arrival` anchor. */
  departure: string;
  timeAnchor: TimeAnchor;
  mode: PlanMode;
  sweepEarliest: string;
  sweepLatest: string;
  sweepIntervalHours: number;

  // ── results ───────────────────────────────────────────────────────────────
  passage: PassageReport | null;
  complexity: ComplexityScore | null;
  windows: PassageWindow[] | null;
  metaWarnings: string[];
  forecastUpdatedAt: string | null;

  // ── ui ────────────────────────────────────────────────────────────────────
  /** Expanded leg in the filled view; also drives the map highlight. */
  selectedLegIdx: number | null;
  /** Step of the expanded leg shown in detail, null for the leg average. Also
      drives the focus dot on the map. Follows the leg: any change of leg, of
      route or of result drops it. */
  selectedStepIdx: number | null;
  /** Mobile: the user confirmed a mode, so the panel can open full height. */
  actionTaken: boolean;
  /** Edits not yet computed. */
  isStale: boolean;
  apiError: string | null;

  // ── in flight ─────────────────────────────────────────────────────────────
  pending: { id: number; kind: FetchKind; editSeq: number } | null;
  /** Bumped by every action that marks the plan stale. See the module doc. */
  editSeq: number;

  // ── commands for the shell ────────────────────────────────────────────────
  persist: PersistCommand | null;
  persistSeq: number;
}

export type PlanAction =
  // The four route edits are named rather than carrying a ready-made array:
  // the reducer applies them to its own state, so two clicks landing in the
  // same frame can never make the second overwrite the first.
  | { type: "WAYPOINT_APPENDED"; lat: number; lon: number }
  | { type: "WAYPOINT_MOVED"; index: number; lat: number; lon: number }
  | { type: "WAYPOINT_INSERTED"; afterIndex: number; lat: number; lon: number }
  | { type: "WAYPOINT_DELETED"; index: number }
  | { type: "ARCHETYPE_CHANGED"; archetype: string }
  | { type: "DEPARTURE_CHANGED"; departure: string }
  | { type: "TIME_ANCHOR_CHANGED"; timeAnchor: TimeAnchor }
  | { type: "MODE_CHANGED"; mode: PlanMode }
  | { type: "SWEEP_CHANGED"; earliest?: string; latest?: string; intervalHours?: number }
  | { type: "LEG_SELECTED"; index: number | null }
  | { type: "STEP_SELECTED"; index: number | null }
  | { type: "FETCH_STARTED"; requestId: number; kind: FetchKind }
  | {
      type: "FETCH_SUCCEEDED";
      requestId: number;
      kind: "single";
      configFingerprint: string;
      passage: PassageReport;
      complexity: ComplexityScore;
      forecastUpdatedAt: string;
    }
  | {
      type: "FETCH_SUCCEEDED";
      requestId: number;
      kind: "sweep";
      configFingerprint: string;
      windows: PassageWindow[];
      metaWarnings: string[];
      forecastUpdatedAt: string;
    }
  | { type: "FETCH_FAILED"; requestId: number; error: string }
  | {
      type: "WINDOW_SELECTED";
      window: PassageWindow;
      /** Naive local departure of the picked window. */
      departure: string;
      configFingerprint: string;
    }
  | {
      type: "RESET";
      /** Impure defaults, resolved by the shell: /config boat and the clock. */
      archetype: string;
      departure: string;
      sweepLatest: string;
    };

/** Seed the machine from the resolved initial session (`initial.ts`). */
export function createInitialState(initial: InitialSession): PlanState {
  return {
    waypoints: initial.waypoints,
    originWaypoints: initial.originWaypoints,
    archetype: initial.archetype,
    departure: initial.departure,
    timeAnchor: initial.timeAnchor,
    mode: initial.mode,
    sweepEarliest: initial.sweepEarliest,
    sweepLatest: initial.sweepLatest,
    sweepIntervalHours: initial.sweepIntervalHours,
    passage: initial.passage,
    complexity: initial.complexity,
    windows: initial.windows,
    metaWarnings: initial.metaWarnings,
    forecastUpdatedAt: initial.forecastUpdatedAt,
    selectedLegIdx: null,
    selectedStepIdx: null,
    actionTaken: initial.actionTaken,
    isStale: initial.isStale,
    apiError: null,
    pending: null,
    editSeq: 0,
    persist: null,
    persistSeq: 0,
  };
}

/** An edit that invalidates any result: bumps `editSeq` and marks the plan
    stale. The expanded leg survives: only a route change makes its segment
    indices meaningless, and collapsing the card on every slider tick would be
    a nuisance. */
function edited(state: PlanState, patch: Partial<PlanState>): PlanState {
  return { ...state, ...patch, isStale: true, editSeq: state.editSeq + 1 };
}

/** Any change to the route. Beyond the usual invalidation it drops the
    expanded leg, whose segment indices are about to stop meaning anything. */
function routeEdited(state: PlanState, waypoints: [number, number][]): PlanState {
  return edited(state, {
    waypoints,
    selectedLegIdx: null,
    selectedStepIdx: null,
    // Dropping back under two waypoints rewinds the mobile panel to its
    // compact "pick a mode" step, so reaching two again offers the choice
    // again. Going back up does not restore it on its own: only a pill click
    // does.
    actionTaken: waypoints.length < 2 ? false : state.actionTaken,
  });
}

function withPersist(state: PlanState, cmd: Omit<PersistCommand, "seq">): PlanState {
  const seq = state.persistSeq + 1;
  return { ...state, persistSeq: seq, persist: { seq, ...cmd } };
}

/** Whether a reply belongs to the computation currently in flight, and
    whether the plan it describes is still the one on screen. */
function verdict(
  state: PlanState,
  requestId: number,
): "superseded" | "outdated" | "applies" {
  const pending = state.pending;
  if (pending === null || pending.id !== requestId) return "superseded";
  return pending.editSeq === state.editSeq ? "applies" : "outdated";
}

export function planReducer(state: PlanState, action: PlanAction): PlanState {
  switch (action.type) {
    case "WAYPOINT_APPENDED":
      return routeEdited(state, [...state.waypoints, [action.lat, action.lon]]);

    case "WAYPOINT_MOVED":
      return routeEdited(
        state,
        state.waypoints.map((wp, i): [number, number] =>
          i === action.index ? [action.lat, action.lon] : wp,
        ),
      );

    case "WAYPOINT_INSERTED": {
      const next = [...state.waypoints];
      next.splice(action.afterIndex + 1, 0, [action.lat, action.lon]);
      return routeEdited(state, next);
    }

    case "WAYPOINT_DELETED":
      return routeEdited(
        state,
        state.waypoints.filter((_, i) => i !== action.index),
      );

    case "ARCHETYPE_CHANGED":
      return edited(state, { archetype: action.archetype });

    case "DEPARTURE_CHANGED":
      return edited(state, { departure: action.departure });

    case "TIME_ANCHOR_CHANGED":
      if (action.timeAnchor === state.timeAnchor) return state;
      return edited(state, { timeAnchor: action.timeAnchor });

    case "MODE_CHANGED": {
      // Any pill click confirms the user's intent, even a click on the mode
      // already active: that is what unlocks the compact view on mobile.
      if (action.mode === state.mode) {
        return state.actionTaken ? state : { ...state, actionTaken: true };
      }
      const confirmed = { ...state, actionTaken: true };
      // Opposite-mode results are deliberately kept in memory so the user can
      // toggle back and forth without recomputing. The render branches gate on
      // `mode`, so nothing stale leaks visually.
      return { ...confirmed, mode: action.mode, apiError: null };
    }

    case "SWEEP_CHANGED":
      // Moving the sweep range does not invalidate anything: no `editSeq`
      // bump, no staleness. The user is filling in a form, not editing a
      // computed plan.
      return {
        ...state,
        sweepEarliest: action.earliest ?? state.sweepEarliest,
        sweepLatest: action.latest ?? state.sweepLatest,
        sweepIntervalHours: action.intervalHours ?? state.sweepIntervalHours,
      };

    case "LEG_SELECTED":
      return { ...state, selectedLegIdx: action.index, selectedStepIdx: null };

    case "STEP_SELECTED":
      // A step without an open leg is meaningless: nothing to attach it to.
      if (state.selectedLegIdx === null) return state;
      return { ...state, selectedStepIdx: action.index };

    case "FETCH_STARTED":
      return {
        ...state,
        apiError: null,
        pending: { id: action.requestId, kind: action.kind, editSeq: state.editSeq },
      };

    case "FETCH_SUCCEEDED": {
      const applies = verdict(state, action.requestId);
      if (applies === "superseded") return state;
      if (applies === "outdated") {
        // Edited mid-flight: the answer describes a plan the user has left
        // behind. Drop it whole rather than showing it as fresh or persisting
        // it next to the new waypoints. `isStale` is already true.
        return { ...state, pending: null };
      }
      if (action.kind === "single") {
        // The URL and the cache always carry the *resolved* departure: in
        // arrival mode what the user typed is a target ETA, and persisting it
        // would break reload. The slider keeps showing what they typed.
        const resolved = toNaiveLocal(new Date(action.passage.departure_time));
        return withPersist(
          {
            ...state,
            pending: null,
            isStale: false,
            selectedLegIdx: null,
            selectedStepIdx: null,
            // A computed route is the one the next edits will be edits of.
            originWaypoints: state.waypoints,
            passage: action.passage,
            complexity: action.complexity,
            forecastUpdatedAt: action.forecastUpdatedAt,
          },
          {
            url: buildPlanUrl(state.waypoints, resolved, state.archetype),
            cache: {
              kind: "single",
              waypoints: state.waypoints,
              archetype: state.archetype,
              configFingerprint: action.configFingerprint,
              departure: resolved,
              passage: action.passage,
              complexity: action.complexity,
              forecastUpdatedAt: action.forecastUpdatedAt,
            },
          },
        );
      }
      // Sweep. Single-mode results are deliberately left alone: the render
      // branches gate on `mode`.
      return withPersist(
        {
          ...state,
          pending: null,
          isStale: false,
          originWaypoints: state.waypoints,
          windows: action.windows,
          metaWarnings: action.metaWarnings,
          forecastUpdatedAt: action.forecastUpdatedAt,
        },
        {
          cache: {
            kind: "compare",
            waypoints: state.waypoints,
            archetype: state.archetype,
            configFingerprint: action.configFingerprint,
            sweepEarliest: state.sweepEarliest,
            sweepLatest: state.sweepLatest,
            sweepIntervalHours: state.sweepIntervalHours,
            windows: action.windows,
            metaWarnings: action.metaWarnings,
            forecastUpdatedAt: action.forecastUpdatedAt,
          },
        },
      );
    }

    case "FETCH_FAILED": {
      const applies = verdict(state, action.requestId);
      if (applies === "superseded") return state;
      // Same rule as a success: an error about a plan the user has already
      // moved on from is noise, not information.
      if (applies === "outdated") return { ...state, pending: null };
      return { ...state, pending: null, apiError: action.error };
    }

    case "WINDOW_SELECTED": {
      const base: PlanState = {
        ...state,
        mode: "single",
        departure: action.departure,
        metaWarnings: [],
        apiError: null,
      };
      if (!action.window.passage || !action.window.complexity_full) {
        // Older deployments answer the sweep without the per-window detail.
        // The shell computes instead; the table goes away so the two views
        // cannot disagree while it does.
        return { ...base, windows: null };
      }
      // Windows are kept so toggling back to compare shows the table again
      // with no refetch.
      return withPersist(
        {
          ...base,
          pending: null,
          isStale: false,
          selectedLegIdx: null,
          selectedStepIdx: null,
          originWaypoints: state.waypoints,
          passage: action.window.passage,
          complexity: action.window.complexity_full,
        },
        {
          url: buildPlanUrl(state.waypoints, action.departure, state.archetype),
          cache: {
            kind: "single",
            waypoints: state.waypoints,
            archetype: state.archetype,
            configFingerprint: action.configFingerprint,
            departure: action.departure,
            passage: action.window.passage,
            complexity: action.window.complexity_full,
            forecastUpdatedAt: state.forecastUpdatedAt ?? "",
            inheritFingerprint: true,
          },
        },
      );
    }

    case "RESET":
      return withPersist(
        {
          ...state,
          waypoints: [],
          originWaypoints: [],
          archetype: action.archetype,
          departure: action.departure,
          timeAnchor: "departure",
          mode: "single",
          sweepEarliest: action.departure,
          sweepLatest: action.sweepLatest,
          sweepIntervalHours: 3,
          passage: null,
          complexity: null,
          windows: null,
          metaWarnings: [],
          forecastUpdatedAt: null,
          selectedLegIdx: null,
          selectedStepIdx: null,
          actionTaken: false,
          isStale: false,
          apiError: null,
          // Anything in flight stops counting: its reply will be dropped by
          // `isCurrent`, and the shell aborts it anyway.
          pending: null,
          editSeq: state.editSeq + 1,
        },
        { url: "/plan", cache: { kind: "clear" } },
      );
  }
}

// ── selectors ────────────────────────────────────────────────────────────────

/** Per-kind spinners. One shared flag used to blank the panel during a sweep
    even when the user was looking at the single-mode view. */
export function isFetching(state: PlanState, kind: FetchKind): boolean {
  return state.pending?.kind === kind;
}

/** What the panel currently shows as loading: the computation that belongs to
    the mode on screen, never the other one. */
export function isLoadingForMode(state: PlanState): boolean {
  return isFetching(state, state.mode === "compare" ? "sweep" : "single");
}
