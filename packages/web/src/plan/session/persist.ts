// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The one place `/plan` writes to the outside world.
 *
 * Three media, each with its own moment:
 *
 * | Medium | Written | Cleared |
 * |---|---|---|
 * | address bar | when a result is committed, and on reset | never (reset rewrites to `/plan`) |
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
import { navigate } from "../../navigation";

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
 * leg, here) a history entry of its own and pops it when the layer closes.
 * Committing a result closes the expanded leg, so this write and that pop
 * land in the same commit. Writing first is what keeps them compatible: a
 * `replaceState` resets `history.state` to null, which is exactly the signal
 * `BackStack.close` reads to leave an entry it no longer owns alone. Called
 * from a layout effect for that reason, while the rest waits for the passive
 * pass.
 *
 * Goes through `navigate` rather than `history` directly so the router is told
 * about the rewrite; see `navigation.ts` for what silence cost.
 */
export function applyUrlWrite(command: PersistCommand): void {
  if (command.url !== undefined) {
    navigate(command.url, { replace: true });
  }
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
    departure: state.departure,
    timeAnchor: state.timeAnchor,
    archetype: state.archetype,
    mode: state.mode,
    sweepEarliest: state.sweepEarliest,
    sweepLatest: state.sweepLatest,
    sweepIntervalHours: state.sweepIntervalHours,
  });
}
