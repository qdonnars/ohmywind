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
import { toTzAware } from "../departureTz";
import type { PassageWindow } from "../types";
import type { PlanMode, TimeAnchor } from "../ModeToggle";
import {
  createInitialState,
  planReducer,
  isFetching,
  isLoadingForMode,
  type PlanState,
} from "./reducer";
import type { InitialSession } from "./initial";
import { defaultSweepLatest, toNaiveLocal, tomorrowRoundedLocal } from "./initial";
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
  setMode: (mode: PlanMode) => void;
  setSweepEarliest: (value: string) => void;
  setSweepLatest: (value: string) => void;
  setSweepInterval: (hours: number) => void;
  selectLeg: (index: number | null) => void;
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

  /** Mint a request, cancelling whatever was in flight. */
  const startRequest = useCallback((kind: "single" | "sweep") => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    dispatch({ type: "FETCH_STARTED", requestId, kind });
    return { requestId, signal: controller.signal };
  }, []);

  const onFailure = useCallback((requestId: number, error: unknown) => {
    // An abort is not a failure: the request was replaced or the page left.
    if (error instanceof DOMException && error.name === "AbortError") return;
    const message = error instanceof Error ? error.message : String(error);
    dispatch({ type: "FETCH_FAILED", requestId, error: friendlyError(message) });
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

  const runSweep = useCallback(() => {
    const { waypoints, archetype, sweepEarliest, sweepLatest, sweepIntervalHours } =
      stateRef.current;
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

  // Leaving the page cancels whatever is in flight.
  useEffect(() => () => abortRef.current?.abort(), []);

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
      setMode: (mode) => dispatch({ type: "MODE_CHANGED", mode }),
      setSweepEarliest: (value) => dispatch({ type: "SWEEP_CHANGED", earliest: value }),
      setSweepLatest: (value) => dispatch({ type: "SWEEP_CHANGED", latest: value }),
      setSweepInterval: (hours) => dispatch({ type: "SWEEP_CHANGED", intervalHours: hours }),
      selectLeg: (index) => dispatch({ type: "LEG_SELECTED", index }),
      compute: () => {
        const { waypoints, archetype, departure, timeAnchor } = stateRef.current;
        runSingle(waypoints, archetype, departure, timeAnchor);
      },
      computeWindows: runSweep,
      selectWindow: (window) => {
        const departure = toNaiveLocal(new Date(window.departure));
        dispatch({
          type: "WINDOW_SELECTED",
          window,
          departure,
          configFingerprint: currentConfigFingerprint(),
        });
        if (!window.passage || !window.complexity_full) {
          // Backwards-compatible fallback for deployments that answer the
          // sweep without the per-window detail.
          const { waypoints, archetype } = stateRef.current;
          runSingle(waypoints, archetype, departure);
        }
      },
      reset: () => {
        abortRef.current?.abort();
        const departure = tomorrowRoundedLocal(Date.now());
        dispatch({
          type: "RESET",
          archetype: loadPolarConfig().base,
          departure,
          sweepLatest: defaultSweepLatest(departure),
        });
      },
    }),
    [runSingle, runSweep],
  );

  return {
    state,
    actions,
    isLoading: isLoadingForMode(state),
    isLoadingSingle: isFetching(state, "single"),
    isLoadingSweep: isFetching(state, "sweep"),
  };
}
