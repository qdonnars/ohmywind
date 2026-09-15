// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The imperative shell around `plan/session/reducer.ts`.
 *
 * Everything that touches the outside world lives here: the two computations,
 * their abort controllers, the `/config` preferences read at request time, and
 * the single effect that writes to the address bar, to the simulation cache
 * and to this tab's draft. The reducer stays pure and testable without a DOM.
 *
 * Request lifecycle:
 *
 * 1. a monotonic id is minted and handed to `FETCH_STARTED`;
 * 2. any request still in flight is aborted, so at most one computation is
 *    ever pending and the browser stops paying for the one nobody wants;
 * 3. the reply is dispatched with its id. The reducer drops it when a newer
 *    request has replaced it, or when the user edited the plan meanwhile.
 *
 * The abort covers the POST to the API. Sampling the forecast corridor
 * (`buildForecastCacheSafe`) is not interruptible yet, so an aborted
 * computation may still finish gathering data it will not use; the reply is
 * dropped either way.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import {
  fetchPassage,
  fetchPassageByEta,
  fetchPassageWindows,
  coldStartDelay,
  friendlyError,
  type PlanOverrides,
} from "../../api/passage";
import {
  buildForecastCacheSafe,
  singleWindowMs,
  sweepWindowMs,
  etaWindowMs,
} from "../../api/forecastCache";
import { activeModels, loadModelConfig } from "../../config/modelConfig";
import {
  effectivePolar,
  isPersoActive,
  isPolarCustomized,
  loadPolarConfig,
  planEfficiency,
  polarFingerprint,
  savePolarConfig,
} from "../../config/polarConfig";
import { toTzAware } from "../../domain/datetime";
import type { PassageWindow } from "../types";
import type { TimeAnchor } from "../ModeToggle";
import { defaultSweep, type CompareAxis, type SweepParams } from "../compare/slots";
import { isVariantComplete, PLAN_TRACK_ID } from "../compare/tracks";
import {
  createInitialState,
  planReducer,
  isFetching,
  isLoadingForMode,
  type PlanState,
} from "./reducer";
import type { InitialSession } from "./initial";
import { defaultSweepLatest, tomorrowRoundedLocal } from "./initial";
import { toNaiveLocal } from "../../domain/datetime";
import { applyCacheCommand, applyUrlWrite, syncDraft } from "./persist";

// Build the plan-time overrides payload from current /config preferences.
// Read at request time (not at mount) so a /config tweak takes effect on the
// next refetch without a page reload. Polar matrix is only attached when the
// editor deviates from the default for the active archetype. Otherwise the
// server's bundled polar wins, saving ~kB per request.
function resolveOverrides(): PlanOverrides {
  const overrides: PlanOverrides = {};
  const modelCfg = loadModelConfig();
  const models = activeModels(modelCfg);
  if (models.length > 0) overrides.models = models;
  const polarCfg = loadPolarConfig();
  if (isPersoActive(polarCfg)) {
    // The custom matrix is always built on cfg.base's grid, the boat of
    // record while the perso polar is the active pick (#220). The page's slug
    // matches it (seeded via initialPlanBoat, re-pinned by selectPerso), so
    // passing it here would be redundant at best and, in a cross-tab /config
    // edit, would resurrect the mismatch. When perso is parked in favour of a
    // stock archetype, no matrix travels: the server's bundled polar for the
    // requested slug wins.
    overrides.polar = effectivePolar(polarCfg);
  }
  return overrides;
}

// Plan-time efficiency: the /config performance coefficient, always explicit
// since config v3 (1.0 = race trim, 0.75 = typical cruising).
function resolveEfficiency(): number {
  return planEfficiency(loadPolarConfig());
}

// Joint fingerprint of model + polar config. Same shape across single &
// compare so the cache check is a one-liner. Read at the same moment as the
// result lands, so the persisted simulation is paired with the config that
// produced it.
/** Automatic attempts after a cold-start failure, before the error shows. */
const MAX_COLD_START_RETRIES = 4;

export function currentConfigFingerprint(): string {
  return `${activeModels(loadModelConfig()).join(",")}|${polarFingerprint(loadPolarConfig())}`;
}

/** Everything `/plan` can do, as named intents rather than setters. */
export interface PlanActions {
  appendWaypoint: (lat: number, lon: number) => void;
  moveWaypoint: (index: number, lat: number, lon: number) => void;
  insertWaypoint: (afterIndex: number, lat: number, lon: number) => void;
  deleteWaypoint: (index: number) => void;
  setArchetype: (slug: string) => void;
  selectPerso: () => void;
  setDeparture: (value: string) => void;
  setTimeAnchor: (anchor: TimeAnchor) => void;
  /** Mobile: leave the compact step for the form, without computing. */
  openForm: () => void;
  /** The door in the plan. On the departure axis, a comparison that has no
      fresh windows to show is seeded on the plan's departure and computed
      at once, so opening it is an answer rather than a form. */
  openCompare: (axis?: CompareAxis) => void;
  /** « ‹ Plan »: back to the plan, the windows kept for the next time. */
  closeCompare: () => void;
  /** « Garder » on the return banner. */
  keepPlan: () => void;
  /** « Appliquer » in the window settings: the sweep is set and recomputed
      in one go, so the list never shows a window it was not computed for. */
  applySweep: (sweep: SweepParams) => void;
  // ── the track axis ────────────────────────────────────────────────────────
  /** « Tracer une variante »: the map draws a new track between the plan's ends. */
  startVariant: () => void;
  addVariantPoint: (lat: number, lon: number) => void;
  moveVariantPoint: (index: number, lat: number, lon: number) => void;
  insertVariantPoint: (afterIndex: number, lat: number, lon: number) => void;
  deleteVariantPoint: (index: number) => void;
  cancelVariant: () => void;
  /** « Terminer et comparer »: the variant becomes an option and is computed
      with the plan's departure, the plan's own track too when it has no
      fresh passage to lend. */
  finishVariant: () => void;
  /** Recompute every option on the departure and the boat as they stand. */
  computeTracks: () => void;
  openTrack: (id: string) => void;
  /** The option becomes the plan's route without leaving the comparison. */
  selectTrack: (id: string) => void;
  removeTrack: (id: string) => void;
  highlightTrack: (id: string | null) => void;
  /** The frozen departure of the track axis: set it and recompute the plan
      and every option on it. */
  applyTrackDeparture: (departure: string) => void;
  selectLeg: (index: number | null) => void;
  /** Open one step of the expanded leg in the card, null for its average. */
  selectStep: (index: number | null) => void;
  /** Compute the single passage for the plan on screen. */
  compute: () => void;
  /** Compute the sweep for the plan on screen. */
  computeWindows: () => void;
  selectWindow: (window: PassageWindow) => void;
  reset: () => void;
}

export interface PlanSession {
  state: PlanState;
  actions: PlanActions;
  /** Spinner of the view on screen: never the other mode's computation. */
  isLoading: boolean;
  isLoadingSingle: boolean;
  isLoadingSweep: boolean;
}

export function usePlanSession(initial: InitialSession): PlanSession {
  const [state, dispatch] = useReducer(planReducer, initial, createInitialState);

  // Mutable because they belong to the transport, not to the rendered state.
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Latest state, so the one-shot actions (compute, drill-down, reset) can
  // read the current plan without listing every field in their dependency
  // array, which would rebuild every handler on each tick of the departure
  // slider. Refreshed from an effect, never during render: by the time any
  // user gesture can fire, effects have flushed. Route edits deliberately do
  // NOT go through it, they are expressed as actions the reducer applies to
  // its own state, so two clicks in the same frame cannot lose one.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Cold start. The backend answers "unavailable, retry in N s" while the
  // Space wakes up, which takes it a minute or two. Rather than an error the
  // reader has to read and relaunch by hand, the same request goes again by
  // itself, a few times, with the panel saying so (PlanSidebar). The counter
  // resets on a success and on a request the reader starts; the timer dies
  // with any new request and with the page.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const lastKindRef = useRef<"single" | "sweep">("single");
  const rerunRef = useRef<() => void>(() => {});
  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /** Mint a request, cancelling whatever was in flight. */
  const startRequest = useCallback((kind: "single" | "sweep") => {
    clearRetryTimer();
    lastKindRef.current = kind;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    dispatch({ type: "FETCH_STARTED", requestId, kind });
    return { requestId, signal: controller.signal };
  }, [clearRetryTimer]);

  const onFailure = useCallback((requestId: number, error: unknown) => {
    // An abort is not a failure: the request was replaced or the page left.
    if (error instanceof DOMException && error.name === "AbortError") return;
    // An ApiError carries the server's stable code; anything else only has
    // words, and `friendlyError` falls back to matching them.
    const reported = error instanceof Error ? error : String(error);
    const delay = coldStartDelay(error);
    if (delay !== null && retryAttemptRef.current < MAX_COLD_START_RETRIES) {
      const attempt = retryAttemptRef.current + 1;
      retryAttemptRef.current = attempt;
      dispatch({
        type: "FETCH_RETRY_SCHEDULED",
        requestId,
        at: Date.now() + delay * 1000,
        attempt,
        max: MAX_COLD_START_RETRIES,
      });
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        rerunRef.current();
      }, delay * 1000);
      return;
    }
    dispatch({ type: "FETCH_FAILED", requestId, error: friendlyError(reported) });
  }, []);

  const runSingle = useCallback(
    (
      waypoints: [number, number][],
      archetype: string,
      departure: string,
      anchor: TimeAnchor = "departure",
    ) => {
      const { requestId, signal } = startRequest("single");
      const overrides = resolveOverrides();
      const departureIso = toTzAware(departure);
      const anchorMs = Date.parse(departureIso);
      // Sample the route corridor in the browser and attach it so the server
      // reads weather from this payload instead of calling Open-Meteo itself
      // (distributes the upstream load off the Space's single IP). On any
      // failure the cache is undefined and the server fetches live.
      const window_ =
        anchor === "arrival" ? etaWindowMs(waypoints, anchorMs) : singleWindowMs(waypoints, anchorMs);
      buildForecastCacheSafe(waypoints, { window: window_ })
        .then((forecastCache) =>
          anchor === "arrival"
            ? fetchPassageByEta({
                waypoints,
                targetArrival: departureIso,
                archetype,
                efficiency: resolveEfficiency(),
                overrides,
                forecastCache,
                signal,
              })
            : fetchPassage({
                waypoints,
                departure: departureIso,
                archetype,
                efficiency: resolveEfficiency(),
                overrides,
                forecastCache,
                signal,
              }),
        )
        .then((res) => {
          retryAttemptRef.current = 0;
          dispatch({
            type: "FETCH_SUCCEEDED",
            requestId,
            kind: "single",
            configFingerprint: currentConfigFingerprint(),
            passage: res.passage,
            complexity: res.complexity,
            forecastUpdatedAt: res.forecast_updated_at,
          });
        })
        .catch((error: unknown) => onFailure(requestId, error));
    },
    [startRequest, onFailure],
  );

  // `sweep` overrides what the state holds: a caller that has just dispatched
  // new bounds cannot read them back from `stateRef` in the same tick.
  // One controller per option: the options compute side by side, and a
  // redraw of one must not cancel the others.
  const trackAbortRef = useRef(new Map<string, AbortController>());
  const runTrack = useCallback(
    (track: { id: string; waypoints: [number, number][] }, departureOverride?: string) => {
      const s = stateRef.current;
      const departure = departureOverride ?? s.departure;
      const { archetype, timeAnchor } = s;
      trackAbortRef.current.get(track.id)?.abort();
      const controller = new AbortController();
      trackAbortRef.current.set(track.id, controller);
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      dispatch({ type: "TRACK_STARTED", trackId: track.id, requestId });
      const overrides = resolveOverrides();
      const departureIso = toTzAware(departure);
      const anchorMs = Date.parse(departureIso);
      const window_ =
        timeAnchor === "arrival"
          ? etaWindowMs(track.waypoints, anchorMs)
          : singleWindowMs(track.waypoints, anchorMs);
      buildForecastCacheSafe(track.waypoints, { window: window_ })
        .then((forecastCache) =>
          timeAnchor === "arrival"
            ? fetchPassageByEta({
                waypoints: track.waypoints,
                targetArrival: departureIso,
                archetype,
                efficiency: resolveEfficiency(),
                overrides,
                forecastCache,
                signal: controller.signal,
              })
            : fetchPassage({
                waypoints: track.waypoints,
                departure: departureIso,
                archetype,
                efficiency: resolveEfficiency(),
                overrides,
                forecastCache,
                signal: controller.signal,
              }),
        )
        .then((res) => {
          dispatch({
            type: "TRACK_COMPUTED",
            trackId: track.id,
            requestId,
            passage: res.passage,
            complexity: res.complexity,
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          dispatch({
            type: "TRACK_FAILED",
            trackId: track.id,
            requestId,
            error: friendlyError(error instanceof Error ? error : String(error)),
          });
        });
    },
    [],
  );

  const runSweep = useCallback((sweep?: SweepParams) => {
    const { waypoints, archetype } = stateRef.current;
    const sweepEarliest = sweep?.earliest ?? stateRef.current.sweepEarliest;
    const sweepLatest = sweep?.latest ?? stateRef.current.sweepLatest;
    const sweepIntervalHours = sweep?.intervalHours ?? stateRef.current.sweepIntervalHours;
    const { requestId, signal } = startRequest("sweep");
    const earliestIso = toTzAware(sweepEarliest);
    const latestIso = toTzAware(sweepLatest);
    const window_ = sweepWindowMs(waypoints, Date.parse(earliestIso), Date.parse(latestIso));
    buildForecastCacheSafe(waypoints, { window: window_ })
      .then((forecastCache) =>
        fetchPassageWindows({
          waypoints,
          earliest: earliestIso,
          latest: latestIso,
          archetype,
          intervalHours: sweepIntervalHours,
          efficiency: resolveEfficiency(),
          overrides: resolveOverrides(),
          forecastCache,
          signal,
        }),
      )
      .then((res) => {
        retryAttemptRef.current = 0;
        dispatch({
          type: "FETCH_SUCCEEDED",
          requestId,
          kind: "sweep",
          configFingerprint: currentConfigFingerprint(),
          windows: res.windows,
          metaWarnings: res.meta_warnings,
          forecastUpdatedAt: res.forecast_updated_at,
        });
      })
      .catch((error: unknown) => onFailure(requestId, error));
  }, [startRequest, onFailure]);

  // The retry recomputes the plan as it stands when the timer fires, not as
  // it was when the request failed: an edit in between is not lost, and a
  // route shrunk below two points is not sent.
  useEffect(() => {
    rerunRef.current = () => {
      const s = stateRef.current;
      if (s.waypoints.length < 2) return;
      if (lastKindRef.current === "sweep") runSweep();
      else runSingle(s.waypoints, s.archetype, s.departure, s.timeAnchor);
    };
  }, [runSingle, runSweep]);

  // Leaving the page cancels whatever is in flight, retry timer included.
  useEffect(() => {
    // The map of controllers lives as long as the hook: reading it here
    // rather than in the cleanup is what the lint asks, and the same object.
    const trackAborts = trackAbortRef.current;
    return () => {
      abortRef.current?.abort();
      for (const controller of trackAborts.values()) controller.abort();
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  // ── the one place this page writes to the outside world ───────────────────
  // One subscription to the state, in two phases. The commands the reducer
  // emits are applied exactly once thanks to their sequence number; the draft
  // continuously mirrors the uncommitted plan.
  //
  // The address bar goes first, during the layout phase, because it shares
  // `window.history` with `useBackDismiss` (see `applyUrlWrite`). Storage
  // waits for the passive pass so a big simulation is never stringified
  // between a commit and its paint.
  const appliedUrlSeq = useRef(0);
  useLayoutEffect(() => {
    const command = state.persist;
    if (command && command.seq > appliedUrlSeq.current) {
      appliedUrlSeq.current = command.seq;
      applyUrlWrite(command);
    }
  }, [state]);

  const appliedCacheSeq = useRef(0);
  useEffect(() => {
    const command = state.persist;
    if (command && command.seq > appliedCacheSeq.current) {
      appliedCacheSeq.current = command.seq;
      applyCacheCommand(command);
    }
    syncDraft(state);
  }, [state]);

  const actions = useMemo<PlanActions>(
    () => ({
      appendWaypoint: (lat, lon) => dispatch({ type: "WAYPOINT_APPENDED", lat, lon }),
      moveWaypoint: (index, lat, lon) =>
        dispatch({ type: "WAYPOINT_MOVED", index, lat, lon }),
      insertWaypoint: (afterIndex, lat, lon) =>
        dispatch({ type: "WAYPOINT_INSERTED", afterIndex, lat, lon }),
      deleteWaypoint: (index) => dispatch({ type: "WAYPOINT_DELETED", index }),
      setArchetype: (slug) => {
        const cfg = loadPolarConfig();
        if (isPolarCustomized(cfg)) {
          // Perso stays defined: picking a stock hull just parks it for
          // planning (no matrix push, the server's bundled polar wins). The
          // tuning is kept untouched so the « Perso » entry brings it back.
          savePolarConfig({ ...cfg, persoActive: false });
        } else {
          // Write through to /config: one boat for the whole app.
          savePolarConfig({ ...cfg, base: slug, source: "archetype" });
        }
        dispatch({ type: "ARCHETYPE_CHANGED", archetype: slug });
      },
      selectPerso: () => {
        // Reactivate the customization and re-pin the page's slug to the grid
        // it was built on.
        const cfg = loadPolarConfig();
        savePolarConfig({ ...cfg, persoActive: true });
        dispatch({ type: "ARCHETYPE_CHANGED", archetype: cfg.base });
      },
      setDeparture: (value) => dispatch({ type: "DEPARTURE_CHANGED", departure: value }),
      setTimeAnchor: (anchor) => dispatch({ type: "TIME_ANCHOR_CHANGED", timeAnchor: anchor }),
      openForm: () => dispatch({ type: "FORM_OPENED" }),
      openCompare: (axis = "slots") => {
        const s = stateRef.current;
        // Windows still describing this route are shown as they are; a
        // comparison that has none, or whose route moved, starts over from
        // the plan's departure.
        const fresh = s.windows !== null && s.windows.length > 0 && !s.isStale;
        const sweep = axis === "slots" && !fresh ? defaultSweep(s.departure, Date.now()) : undefined;
        dispatch({ type: "COMPARE_OPENED", axis, sweep });
        if (sweep && s.waypoints.length >= 2) {
          retryAttemptRef.current = 0;
          runSweep(sweep);
        }
      },
      closeCompare: () => dispatch({ type: "COMPARE_CLOSED" }),
      keepPlan: () => dispatch({ type: "PLAN_KEPT" }),
      applySweep: (sweep) => {
        dispatch({
          type: "SWEEP_CHANGED",
          earliest: sweep.earliest,
          latest: sweep.latest,
          intervalHours: sweep.intervalHours,
        });
        if (stateRef.current.waypoints.length < 2) return;
        retryAttemptRef.current = 0;
        runSweep(sweep);
      },
      startVariant: () => dispatch({ type: "VARIANT_STARTED" }),
      addVariantPoint: (lat, lon) => dispatch({ type: "VARIANT_POINT_ADDED", lat, lon }),
      moveVariantPoint: (index, lat, lon) =>
        dispatch({ type: "VARIANT_POINT_MOVED", index, lat, lon }),
      insertVariantPoint: (afterIndex, lat, lon) =>
        dispatch({ type: "VARIANT_POINT_INSERTED", afterIndex, lat, lon }),
      deleteVariantPoint: (index) => dispatch({ type: "VARIANT_POINT_DELETED", index }),
      cancelVariant: () => dispatch({ type: "VARIANT_CANCELLED" }),
      finishVariant: () => {
        const s = stateRef.current;
        if (!s.variant || !isVariantComplete(s.variant)) return;
        const id = `v${Date.now()}`;
        dispatch({ type: "VARIANT_FINISHED", id, createdAt: toNaiveLocal(new Date()) });
        runTrack({ id, waypoints: s.variant });
        // Read from the snapshot rather than the state the dispatch will
        // produce: same rule as `runSweep`.
        const planLendsPassage = !s.isStale && s.passage !== null && s.complexity !== null;
        if (s.tracks.length === 0 && !planLendsPassage) {
          runTrack({ id: PLAN_TRACK_ID, waypoints: s.waypoints });
        }
      },
      computeTracks: () => {
        for (const track of stateRef.current.tracks) runTrack(track);
      },
      openTrack: (id) =>
        dispatch({ type: "TRACK_OPENED", id, configFingerprint: currentConfigFingerprint() }),
      selectTrack: (id) =>
        dispatch({ type: "TRACK_SELECTED", id, configFingerprint: currentConfigFingerprint() }),
      removeTrack: (id) => {
        trackAbortRef.current.get(id)?.abort();
        trackAbortRef.current.delete(id);
        dispatch({ type: "TRACK_REMOVED", id });
      },
      highlightTrack: (id) => dispatch({ type: "TRACK_HIGHLIGHTED", id }),
      applyTrackDeparture: (departure) => {
        const s = stateRef.current;
        dispatch({ type: "DEPARTURE_CHANGED", departure });
        if (s.waypoints.length < 2) return;
        retryAttemptRef.current = 0;
        // The plan first, so returning to it finds it fresh, then every
        // option on the same departure.
        runSingle(s.waypoints, s.archetype, departure, s.timeAnchor);
        for (const track of s.tracks) runTrack(track, departure);
      },
      selectLeg: (index) => dispatch({ type: "LEG_SELECTED", index }),
      selectStep: (index) => dispatch({ type: "STEP_SELECTED", index }),
      compute: () => {
        retryAttemptRef.current = 0;
        const { waypoints, archetype, departure, timeAnchor } = stateRef.current;
        runSingle(waypoints, archetype, departure, timeAnchor);
      },
      computeWindows: () => {
        retryAttemptRef.current = 0;
        runSweep();
      },
      selectWindow: (window) => {
        const departure = toNaiveLocal(new Date(window.departure));
        dispatch({
          type: "WINDOW_SELECTED",
          window,
          departure,
          configFingerprint: currentConfigFingerprint(),
        });
        const s = stateRef.current;
        if (!window.passage || !window.complexity_full) {
          // Backwards-compatible fallback for deployments that answer the
          // sweep without the per-window detail.
          runSingle(s.waypoints, s.archetype, departure);
        }
        // The slot picked is the departure of the track axis too: every
        // option follows it.
        for (const track of s.tracks) runTrack(track, departure);
      },
      reset: () => {
        abortRef.current?.abort();
        for (const controller of trackAbortRef.current.values()) controller.abort();
        const departure = tomorrowRoundedLocal(Date.now());
        dispatch({
          type: "RESET",
          archetype: loadPolarConfig().base,
          departure,
          sweepLatest: defaultSweepLatest(departure),
        });
      },
    }),
    [runSingle, runSweep, runTrack],
  );

  return {
    state,
    actions,
    isLoading: isLoadingForMode(state),
    isLoadingSingle: isFetching(state, "single"),
    isLoadingSweep: isFetching(state, "sweep"),
  };
}
