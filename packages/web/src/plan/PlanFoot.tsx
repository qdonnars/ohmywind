// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "./session/planContext";
import { CompareDoor } from "./CompareDoor";
import { CompareFoot } from "./compare/CompareFoot";

/**
 * What the panel pins under its scrolling content, per view. Mounted by the
 * page in the drawer's and the sidebar's `foot` slot, so it follows the
 * same branch as `PlanSidebar` without the two having to be kept in step
 * by hand: nothing while computing or before a route, the comparison's
 * settings and frozen row while it is open, the door into it under a
 * computed plan.
 */
export function PlanFoot() {
  const { state, isLoading } = usePlan();
  const { mode, passage, isStale, waypoints, apiError, retry, actionTaken } = state;
  if (isLoading || waypoints.length < 2 || !actionTaken) return null;
  if (mode === "compare") return <CompareFoot />;
  if (passage && !isStale && !apiError && !retry) return <CompareDoor />;
  return null;
}
