// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useMemo, useState } from "react";
import { fetchDepthM, depthGridKey } from "../api/bathymetry";

/**
 * Soundings already resolved in this tab.
 *
 * The EMODnet DTM is a static product, so a value never goes stale, yet a
 * reload used to re-ask for every waypoint: two GetFeatureInfo round trips of
 * 570 to 760 ms each measured on a two-waypoint plan restored from the URL,
 * for numbers the tab had already been told. `sessionStorage` rather than
 * `localStorage`: this is a convenience for the plan in front of the reader,
 * not a dataset worth keeping across visits.
 */
const STORAGE_KEY = "ow_waypoint_depths_v1";

/** A route has a handful of waypoints. The cap only guards a tab that keeps
    planning all day from growing the entry without bound. */
const MAX_CELLS = 200;

type DepthsByCell = Record<string, number | null>;

/** Exported for the tests: anything that is not a cell-to-depth map is
    discarded rather than trusted. */
export function parseStoredDepths(raw: string): DepthsByCell | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const out: DepthsByCell = {};
    for (const [cell, depth] of Object.entries(parsed as Record<string, unknown>)) {
      if (depth === null) {
        out[cell] = null;
      } else if (typeof depth === "number" && Number.isFinite(depth)) {
        out[cell] = depth;
      } else {
        return null;
      }
    }
    return out;
  } catch {
    return null;
  }
}

function loadDepths(): DepthsByCell {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return (raw && parseStoredDepths(raw)) || {};
  } catch {
    return {};
  }
}

function saveDepths(byCell: DepthsByCell): void {
  try {
    const entries = Object.entries(byCell);
    // Oldest first in insertion order, so the tail is what a long session
    // most recently looked at.
    const kept = entries.length > MAX_CELLS ? entries.slice(-MAX_CELLS) : entries;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage disabled or full: the lookups still work, they just cost a
    // request again after a reload.
  }
}

/**
 * Sounding under each waypoint, in the same order as the waypoints.
 *
 * `undefined` means the lookup has not landed yet, `null` means there is no
 * sounding to show (land, outside the surveyed area, or a failed request).
 * The caller renders nothing in either case, but the two are kept apart so
 * a future loading state has something to hang off.
 *
 * State is keyed by grid cell rather than by index: waypoints get inserted,
 * deleted and reordered under us, and an index-keyed cache would show
 * waypoint 3 the depth that belonged to waypoint 2 for one frame. Repeated
 * lookups of a known cell cost nothing, the API module caches them, so
 * every waypoint can be asked again on every change without a request.
 */
export function useWaypointDepths(waypoints: [number, number][]): (number | null | undefined)[] {
  const [byCell, setByCell] = useState<DepthsByCell>(loadDepths);

  useEffect(() => {
    let cancelled = false;
    for (const [lat, lon] of waypoints) {
      const cell = depthGridKey(lat, lon);
      // Known cell, whatever the answer was: the DTM cannot have changed, so
      // there is nothing to ask again. This is what makes the persisted map
      // save a request rather than only a render.
      if (cell in byCell) continue;
      void fetchDepthM(lat, lon).then((depth) => {
        if (cancelled) return;
        setByCell((prev) => (cell in prev ? prev : { ...prev, [cell]: depth }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [waypoints, byCell]);

  useEffect(() => {
    saveDepths(byCell);
  }, [byCell]);

  // Memoised, and not as a nicety: PlanMap keys an effect on this array, so a
  // fresh one on every render of the planner tore down and rebuilt the
  // highlight overlay each time a slider ticked. Nothing here changes unless
  // the route or a sounding does.
  return useMemo(
    () => waypoints.map(([lat, lon]) => byCell[depthGridKey(lat, lon)]),
    [waypoints, byCell],
  );
}
