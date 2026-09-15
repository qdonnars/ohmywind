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
import type { CompareAxis, SweepParams } from "../compare/slots";
import {
  addVariantPoint,
  isVariantComplete,
  startVariant,
  MAX_TRACKS,
  PLAN_TRACK_ID,
  type Track,
} from "../compare/tracks";
import { buildPlanUrl } from "../parseUrl";
import { waypointsEqual } from "../lastSimulation";
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
  /** "single" is the plan itself; "compare" is « Comparer ce trajet » open
      over it, on `compareAxis`. Kept as a mode for the draft and the cache,
      which have persisted it under this name since before the comparison
      became a screen of the plan rather than a sibling of it. */
  mode: PlanMode;
  /** Which of the two things a trip is made of varies: the departure (the
      sweep, read as slots) or the track (variants drawn on the map). */
  compareAxis: CompareAxis;
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
  /** Mobile: the user went past the compact step (asked for a computation,
      opened the form or the comparison), so the panel can open full height. */
  actionTaken: boolean;
  /** The comparison a slot or a track was opened from, while the reader looks
      at it in the plan: the map keeps a way back to it. Null once the plan is
      kept, the route edited, or the comparison reopened. */
  returnTo: CompareAxis | null;

  // ── the track axis ────────────────────────────────────────────────────────
  /** The options: the plan's own track first, then the variants drawn on
      the map. Empty until a first variant is finished; the plan alone is
      then the only option, read straight from the plan. */
  tracks: Track[];
  /** The variant being drawn, the plan's two ends included, or null. */
  variant: [number, number][] | null;
  /** The departure or the boat changed since the tracks were computed. */
  tracksStale: boolean;
  /** The option loaded in the plan, while `returnTo` is "tracks". */
  openedTrackId: string | null;
  /** The option the list points at, drawn full while the others dim. */
  highlightedTrackId: string | null;
  /** In flight, per track. Same two guards as `pending`. */
  trackRequests: Record<string, { id: number; editSeq: number }>;
  /** Edits not yet computed. */
  isStale: boolean;
  apiError: string | null;
  /** The backend was asleep: the same request goes again by itself at `at`
      (epoch ms). Null outside that wait. usePlanSession owns the timer. */
  retry: { at: number; attempt: number; max: number } | null;

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
  /** The door in the plan, or the return from an option. `sweep` seeds the
      window when the shell decided the comparison has nothing fresh to show:
      the reducer cannot know the clock the horizon is counted from. */
  | { type: "COMPARE_OPENED"; axis: CompareAxis; sweep?: SweepParams }
  | { type: "COMPARE_CLOSED" }
  | { type: "COMPARE_AXIS_CHANGED"; axis: CompareAxis }
  /** « Garder » on the return banner: this option is the plan now. */
  | { type: "PLAN_KEPT" }
  /** Mobile: the compact step gives way to the form without computing. */
  | { type: "FORM_OPENED" }
  // The variant being drawn: the plan's ends, and points between them.
  | { type: "VARIANT_STARTED" }
  | { type: "VARIANT_POINT_ADDED"; lat: number; lon: number }
  | { type: "VARIANT_POINT_MOVED"; index: number; lat: number; lon: number }
  | { type: "VARIANT_POINT_INSERTED"; afterIndex: number; lat: number; lon: number }
  | { type: "VARIANT_POINT_DELETED"; index: number }
  | { type: "VARIANT_CANCELLED" }
  /** The variant becomes an option; the shell computes it. */
  | { type: "VARIANT_FINISHED"; id: string; createdAt: string }
  | { type: "TRACK_STARTED"; trackId: string; requestId: number }
  | {
      type: "TRACK_COMPUTED";
      trackId: string;
      requestId: number;
      passage: PassageReport;
      complexity: ComplexityScore;
    }
  | { type: "TRACK_FAILED"; trackId: string; requestId: number; error: string }
  /** A row of the track axis: that option is the plan now, the comparison
      kept behind it. */
  | { type: "TRACK_OPENED"; id: string; configFingerprint: string }
  /** Same, without leaving the comparison: the option becomes the route
      the plan and the departure axis are about. */
  | { type: "TRACK_SELECTED"; id: string; configFingerprint: string }
  /** A variant goes; the plan's own track cannot. */
  | { type: "TRACK_REMOVED"; id: string }
  | { type: "TRACK_HIGHLIGHTED"; id: string | null }
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
  | { type: "FETCH_RETRY_SCHEDULED"; requestId: number; at: number; attempt: number; max: number }
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
    compareAxis: "slots",
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
    returnTo: null,
    tracks: [],
    variant: null,
    tracksStale: false,
    openedTrackId: null,
    highlightedTrackId: null,
    trackRequests: {},
    isStale: initial.isStale,
    apiError: null, retry: null,
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
  return {
    ...state,
    // The tracks were computed on the departure and the boat as they were.
    tracksStale: state.tracks.length > 0 ? true : state.tracksStale,
    ...patch,
    isStale: true,
    editSeq: state.editSeq + 1,
  };
}

/** The track axis, emptied: the options were drawn between the ends of a
    route that no longer exists. */
const NO_TRACKS = {
  tracks: [] as Track[],
  variant: null,
  tracksStale: false,
  openedTrackId: null,
  highlightedTrackId: null,
  trackRequests: {} as Record<string, { id: number; editSeq: number }>,
};

/** Any change to the route. Beyond the usual invalidation it drops the
    expanded leg, whose segment indices are about to stop meaning anything. */
function routeEdited(state: PlanState, waypoints: [number, number][]): PlanState {
  return edited(state, {
    waypoints,
    selectedLegIdx: null,
    selectedStepIdx: null,
    // The comparison behind the plan was about the route as it was: nothing
    // to go back to once it moved, and no variant shares its ends any more.
    returnTo: null,
    ...NO_TRACKS,
    // Dropping back under two waypoints rewinds the mobile panel to its
    // compact step, so reaching two again offers the choice again. Going
    // back up does not restore it on its own: only a tap in the panel does.
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

    case "COMPARE_OPENED":
      // The plan's results stay in memory under the comparison, and the
      // windows stay under the plan when it closes: the render branches gate
      // on `mode`, so nothing stale leaks visually, and toggling back and
      // forth costs no computation.
      return {
        ...state,
        mode: "compare",
        compareAxis: action.axis,
        actionTaken: true,
        returnTo: null,
        apiError: null,
        retry: null,
        ...(action.sweep
          ? {
              sweepEarliest: action.sweep.earliest,
              sweepLatest: action.sweep.latest,
              sweepIntervalHours: action.sweep.intervalHours,
            }
          : {}),
      };

    case "COMPARE_CLOSED":
      if (state.mode === "single") return state;
      return { ...state, mode: "single", returnTo: null, apiError: null, retry: null };

    case "COMPARE_AXIS_CHANGED":
      if (action.axis === state.compareAxis) return state;
      return { ...state, compareAxis: action.axis, apiError: null, retry: null };

    case "PLAN_KEPT":
      if (state.returnTo === null) return state;
      // Kept from the track axis, the option on screen is the plan and the
      // other options go: reopening the comparison would otherwise list a
      // "plan's track" that is no longer the plan's.
      return state.returnTo === "tracks"
        ? { ...state, returnTo: null, ...NO_TRACKS }
        : { ...state, returnTo: null };

    case "FORM_OPENED":
      return state.actionTaken ? state : { ...state, actionTaken: true };

    case "VARIANT_STARTED":
      if (state.waypoints.length < 2 || state.tracks.length >= MAX_TRACKS) return state;
      return { ...state, variant: startVariant(state.waypoints), highlightedTrackId: null };

    case "VARIANT_POINT_ADDED":
      if (!state.variant) return state;
      return { ...state, variant: addVariantPoint(state.variant, action.lat, action.lon) };

    case "VARIANT_POINT_MOVED":
      if (!state.variant) return state;
      return {
        ...state,
        variant: state.variant.map((wp, i): [number, number] =>
          i === action.index ? [action.lat, action.lon] : wp,
        ),
      };

    case "VARIANT_POINT_INSERTED": {
      if (!state.variant) return state;
      const next = [...state.variant];
      next.splice(action.afterIndex + 1, 0, [action.lat, action.lon]);
      return { ...state, variant: next };
    }

    case "VARIANT_POINT_DELETED": {
      // The ends are the plan's: a variant keeps them by construction.
      if (!state.variant) return state;
      if (action.index <= 0 || action.index >= state.variant.length - 1) return state;
      return { ...state, variant: state.variant.filter((_, i) => i !== action.index) };
    }

    case "VARIANT_CANCELLED":
      return state.variant === null ? state : { ...state, variant: null };

    case "VARIANT_FINISHED": {
      if (!state.variant || !isVariantComplete(state.variant)) return state;
      // The first variant makes the plan's own track option 1, with the
      // passage it has when it is fresh; the shell computes it otherwise.
      const fresh = !state.isStale && state.passage !== null && state.complexity !== null;
      const base: Track[] =
        state.tracks.length > 0
          ? state.tracks
          : [
              {
                id: PLAN_TRACK_ID,
                waypoints: state.waypoints,
                createdAt: action.createdAt,
                passage: fresh ? state.passage : null,
                complexity: fresh ? state.complexity : null,
                error: null,
              },
            ];
      const track: Track = {
        id: action.id,
        waypoints: state.variant,
        createdAt: action.createdAt,
        passage: null,
        complexity: null,
        error: null,
      };
      return { ...state, tracks: [...base, track], variant: null, highlightedTrackId: action.id };
    }

    case "TRACK_STARTED":
      return {
        ...state,
        tracksStale: false,
        tracks: state.tracks.map((t) => (t.id === action.trackId ? { ...t, error: null } : t)),
        trackRequests: {
          ...state.trackRequests,
          [action.trackId]: { id: action.requestId, editSeq: state.editSeq },
        },
      };

    case "TRACK_COMPUTED":
    case "TRACK_FAILED": {
      const request = state.trackRequests[action.trackId];
      if (!request || request.id !== action.requestId) return state;
      const rest = { ...state.trackRequests };
      delete rest[action.trackId];
      // Edited mid-flight: the answer is about a departure or a boat the
      // reader has left behind. `tracksStale` already says so.
      if (request.editSeq !== state.editSeq) return { ...state, trackRequests: rest };
      return {
        ...state,
        trackRequests: rest,
        tracks: state.tracks.map((t) =>
          t.id !== action.trackId
            ? t
            : action.type === "TRACK_COMPUTED"
              ? { ...t, passage: action.passage, complexity: action.complexity, error: null }
              : { ...t, error: action.error },
        ),
      };
    }

    case "TRACK_OPENED": {
      const track = state.tracks.find((t) => t.id === action.id);
      if (!track || !track.passage || !track.complexity) return state;
      const resolved = toNaiveLocal(new Date(track.passage.departure_time));
      return withPersist(
        {
          ...state,
          mode: "single",
          waypoints: track.waypoints,
          originWaypoints: track.waypoints,
          passage: track.passage,
          complexity: track.complexity,
          isStale: false,
          selectedLegIdx: null,
          selectedStepIdx: null,
          returnTo: "tracks",
          openedTrackId: track.id,
          apiError: null,
          retry: null,
          pending: null,
        },
        {
          url: buildPlanUrl(track.waypoints, resolved, state.archetype),
          cache: {
            kind: "single",
            waypoints: track.waypoints,
            archetype: state.archetype,
            configFingerprint: action.configFingerprint,
            departure: resolved,
            passage: track.passage,
            complexity: track.complexity,
            forecastUpdatedAt: state.forecastUpdatedAt ?? "",
          },
        },
      );
    }

    case "TRACK_SELECTED": {
      const track = state.tracks.find((t) => t.id === action.id);
      if (!track || !track.passage || !track.complexity || state.tracksStale) return state;
      if (waypointsEqual(track.waypoints, state.waypoints)) return state;
      const resolved = toNaiveLocal(new Date(track.passage.departure_time));
      return withPersist(
        {
          ...state,
          waypoints: track.waypoints,
          originWaypoints: track.waypoints,
          passage: track.passage,
          complexity: track.complexity,
          isStale: false,
          selectedLegIdx: null,
          selectedStepIdx: null,
          // The sweep was run on the route just left: the departure axis
          // computes again on this one when it is next shown.
          windows: null,
          metaWarnings: [],
          apiError: null,
          retry: null,
        },
        {
          url: buildPlanUrl(track.waypoints, resolved, state.archetype),
          cache: {
            kind: "single",
            waypoints: track.waypoints,
            archetype: state.archetype,
            configFingerprint: action.configFingerprint,
            departure: resolved,
            passage: track.passage,
            complexity: track.complexity,
            forecastUpdatedAt: state.forecastUpdatedAt ?? "",
          },
        },
      );
    }

    case "TRACK_REMOVED": {
      if (action.id === PLAN_TRACK_ID) return state;
      const removed = state.tracks.find((t) => t.id === action.id);
      if (!removed) return state;
      const rest = state.tracks.filter((t) => t.id !== action.id);
      const requests = { ...state.trackRequests };
      delete requests[action.id];
      // Only the plan's own track left: the axis is back to the plan alone.
      const tracks = rest.length > 1 ? rest : [];
      const next: PlanState = {
        ...state,
        tracks,
        trackRequests: requests,
        highlightedTrackId: state.highlightedTrackId === action.id ? null : state.highlightedTrackId,
        openedTrackId: state.openedTrackId === action.id ? null : state.openedTrackId,
        returnTo: state.openedTrackId === action.id ? null : state.returnTo,
      };
      // The removed option was the plan's route: the plan goes back to its
      // own track, recomputed if that track has no fresh passage to give.
      if (!waypointsEqual(removed.waypoints, state.waypoints)) return next;
      const plan = rest.find((t) => t.id === PLAN_TRACK_ID);
      if (!plan) return next;
      const fresh = plan.passage !== null && plan.complexity !== null && !state.tracksStale;
      return {
        ...next,
        waypoints: plan.waypoints,
        originWaypoints: plan.waypoints,
        passage: fresh ? plan.passage : state.passage,
        complexity: fresh ? plan.complexity : state.complexity,
        isStale: !fresh,
        editSeq: fresh ? state.editSeq : state.editSeq + 1,
        selectedLegIdx: null,
        selectedStepIdx: null,
        windows: null,
        metaWarnings: [],
      };
    }

    case "TRACK_HIGHLIGHTED":
      return state.highlightedTrackId === action.id ? state : { ...state, highlightedTrackId: action.id };

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
        // Asking for a computation is the one gesture the compact step of
        // the mobile panel waits for.
        actionTaken: true,
        apiError: null, retry: null,
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
      return { ...state, pending: null, apiError: action.error, retry: null };
    }

    case "FETCH_RETRY_SCHEDULED": {
      // Same gate as a failure: a wait about a plan the reader has moved on
      // from is not worth showing. The hook still fires the retry, which
      // computes the plan as it stands then.
      const applies = verdict(state, action.requestId);
      if (applies === "superseded") return state;
      if (applies === "outdated") return { ...state, pending: null };
      return {
        ...state,
        pending: null,
        apiError: null,
        retry: { at: action.at, attempt: action.attempt, max: action.max },
      };
    }

    case "WINDOW_SELECTED": {
      const base: PlanState = {
        ...state,
        mode: "single",
        departure: action.departure,
        // The comparison stays open behind the plan: the map offers the way
        // back to it until this slot is kept or the route edited.
        returnTo: "slots",
        // The options were computed on the departure just left; the shell
        // recomputes them on this one.
        tracksStale: state.tracks.length > 0 ? true : state.tracksStale,
        metaWarnings: [],
        apiError: null, retry: null,
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
          compareAxis: "slots",
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
          returnTo: null,
          ...NO_TRACKS,
          isStale: false,
          apiError: null, retry: null,
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
  if (state.mode !== "compare") return isFetching(state, "single");
  // The track axis shows each option computing on its own row.
  return state.compareAxis === "slots" && isFetching(state, "sweep");
}
