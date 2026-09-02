// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useMemo, useState } from "react";
import { fetchDepthM, depthGridKey } from "../api/bathymetry";

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
  const [byCell, setByCell] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancelled = false;
    for (const [lat, lon] of waypoints) {
      const cell = depthGridKey(lat, lon);
      void fetchDepthM(lat, lon).then((depth) => {
        if (cancelled) return;
        setByCell((prev) => (cell in prev ? prev : { ...prev, [cell]: depth }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [waypoints]);

  // Memoised, and not as a nicety: PlanMap keys an effect on this array, so a
  // fresh one on every render of the planner tore down and rebuilt the
  // highlight overlay each time a slider ticked. Nothing here changes unless
  // the route or a sounding does.
  return useMemo(
    () => waypoints.map(([lat, lon]) => byCell[depthGridKey(lat, lon)]),
    [waypoints, byCell],
  );
}
