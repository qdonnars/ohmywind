// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "./session/planContext";
import { CompareFoot } from "./compare/CompareFoot";

/**
 * What the panel pins under its scrolling content, per view. Mounted by the
 * page in the drawer's and the sidebar's `foot` slot, so it follows the
 * same branch as `PlanSidebar` without the two having to be kept in step
 * by hand: the comparison's settings and frozen row while it is open on a
 * wide screen, nothing otherwise. The doors into the comparison are the
 * end of the plan's results, not a pinned zone.
 */
export function PlanFoot() {
  const { state, isLoading } = usePlan();
  const { mode, waypoints, actionTaken } = state;
  if (isLoading || waypoints.length < 2 || !actionTaken) return null;
  // The comparison's pinned zone is a wide-screen thing: on a phone it took
  // the list's room, so the settings sit in the list instead.
  if (mode === "compare") {
    return (
      <div className="hidden lg:block">
        <CompareFoot />
      </div>
    );
  }
  return null;
}
