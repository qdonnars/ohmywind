// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The one place `/plan` writes to the outside world.
 *
 * Three media, each with its own moment:
 *
 * | Medium | Written | Cleared |
 * |---|---|---|
 * | address bar | at mount when the cache supplied the route, when a result is committed, on reset, and put back after a back press | never (reset rewrites to `/plan`) |
 * | `ow_last_simulation_v1` | when a result is committed | on reset |
 * | `ow_plan_draft_v1` | on every edit while the plan is stale | the moment it stops being stale |
 *
 * The first two are driven by the `PersistCommand` the reducer emits, so the
 * decision to write stays in the state machine; only the merge with what is
 * already on disk happens here, because that needs to read it.
 */

import {
  loadLastSimulation,
  saveLastSimulation,
  clearLastSimulation,
  waypointsEqual,
} from "../lastSimulation";
import { savePlanDraft, clearPlanDraft } from "../draft";
import type { CacheWrite, PersistCommand, PlanState } from "./reducer";
import { navigate, normalisePath } from "../../navigation";
import { backStack } from "../../hooks/useBackDismiss";

/**
 * Merge a committed result into the persisted simulation.
 *
 * The merge is what keeps the opposite mode alive: running a sweep must not
 * erase the single-mode result of the same route, and vice versa. A different
 * route is a different plan, so nothing carries over.
 */
export function applyCacheWrite(write: CacheWrite): void {
  if (write.kind === "clear") {
    clearLastSimulation();
    return;
  }
  const previous = loadLastSimulation();
  const sameRoute =
    previous &&
    waypointsEqual(previous.waypoints, write.waypoints) &&
    previous.archetype === write.archetype;

  if (write.kind === "single") {
    saveLastSimulation({
      waypoints: write.waypoints,
      archetype: write.archetype,
      configFingerprint: write.inheritFingerprint
        ? previous?.configFingerprint ?? write.configFingerprint
        : write.configFingerprint,
      mode: "single",
      single: {
        departure: write.departure,
        passage: write.passage,
        complexity: write.complexity,
        forecastUpdatedAt: write.forecastUpdatedAt,
      },
      compare: sameRoute ? previous?.compare : undefined,
      cachedAt: Date.now(),
    });
    return;
  }

  saveLastSimulation({
    waypoints: write.waypoints,
    archetype: write.archetype,
    configFingerprint: write.configFingerprint,
    mode: "compare",
    single: sameRoute ? previous?.single : undefined,
    compare: {
      sweepEarliest: write.sweepEarliest,
      sweepLatest: write.sweepLatest,
      sweepIntervalHours: write.sweepIntervalHours,
      windows: write.windows,
      metaWarnings: write.metaWarnings,
      forecastUpdatedAt: write.forecastUpdatedAt,
    },
    cachedAt: Date.now(),
  });
}

/**
 * Rewrite the address bar.
 *
 * Split from the storage writes because it is ordering-sensitive: `history`
 * is shared with `useBackDismiss`, which gives every open layer (an expanded
 * leg, the comparison) a history entry of its own and pops it when the layer
 * closes. Picking a slot in the comparison, or committing a result over an
 * expanded leg, closes the layer and rewrites the URL in the same commit, so
 * this write lands on the layer's own entry. It keeps that entry's state:
 * the token is what lets `BackStack.close` pop the entry once the layer is
 * gone. Written with the state reset instead, the entry stayed behind, dead:
 * the next back press moved the address bar to the departure the plan had
 * before the slot, and the plan on screen did not follow. Called from a
 * layout effect so it runs before the pop, which the passive pass asks for.
 *
 * The pop then lands on the entry under the layer, whose URL is the one from
 * before this write; `resyncUrl` is what puts it right.
 *
 * Goes through `navigate` rather than `history` directly so the router is told
 * about the rewrite; see `navigation.ts` for what silence cost.
 */
export function applyUrlWrite(command: PersistCommand): void {
  if (command.url !== undefined) {
    navigate(command.url, { replace: true, preserveState: keepLayerState() });
  }
}

/** Whether the current entry may be an open layer's, whose token has to
    survive a rewrite. With no layer open, whatever the entry carries is a
    leftover (a token the page could not pop), and a reset clears it: the
    router takes a layer entry for a page to replace rather than stack on. */
function keepLayerState(): boolean {
  return backStack.depth > 0;
}

/**
 * After a back press: the address bar, put back on the plan.
 *
 * Every entry of `/plan` below the current one was written before the last
 * rewrite, so the URL it carries describes an earlier plan: the departure
 * before a slot was picked, the route before a track was opened. Landing on
 * it is a press that closed a layer (from the user, or the pop `BackStack`
 * asks for) or one that had nothing left to close; in both cases the page
 * stays and its plan with it, so the entry takes the plan's URL. Nothing to
 * do when the press left the page, or when the entry is already right.
 *
 * `written` is the URL of the last rewrite, `null` before any.
 */
export function resyncUrl(written: string | null): void {
  if (written === null) return;
  const here = window.location.pathname + window.location.search;
  if (here === written) return;
  if (normalisePath(window.location.pathname) !== normalisePath(written.split("?")[0])) return;
  navigate(written, { replace: true, preserveState: keepLayerState() });
}

/** Write the committed result to `ow_last_simulation_v1`, or clear it. */
export function applyCacheCommand(command: PersistCommand): void {
  if (command.cache !== undefined) {
    applyCacheWrite(command.cache);
  }
}

/**
 * Mirror the uncommitted state of this tab.
 *
 * `isStale` is exactly the "edited since the last computation" signal, so it
 * decides whether there is a draft at all: every success path clears it, and
 * clearing it here erases the draft in the same beat. Cheap enough (a few
 * hundred bytes of JSON) to run on every change without debouncing.
 */
export function syncDraft(state: PlanState): void {
  if (!state.isStale) {
    clearPlanDraft();
    return;
  }
  savePlanDraft({
    waypoints: state.waypoints,
    originWaypoints: state.originWaypoints,
    departure: state.departure,
    timeAnchor: state.timeAnchor,
    archetype: state.archetype,
    mode: state.mode,
    sweepEarliest: state.sweepEarliest,
    sweepLatest: state.sweepLatest,
    sweepIntervalHours: state.sweepIntervalHours,
  });
}
