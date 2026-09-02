// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The planner session, reachable from anywhere under the panel.
 *
 * `PlanSidebar` took 33 props, spread from `PlanPage` into two renders that
 * had to be kept in step by hand (annexe B, C2). Almost none of them belonged
 * to the panel itself: they were the session, threaded down through
 * components that only passed them along.
 *
 * The value is `{ state, actions }` plus the three things the session does not
 * own: the boat catalogue fetched from the server, the spinner of the mode on
 * screen, and the two computations wrapped so they also re-frame the map.
 *
 * `usePlan` is about *what a component depends on*, not about re-render count:
 * React context has no per-field subscription, so every consumer still
 * re-renders when the session changes, exactly as they did when the props were
 * spread. What it buys is that each file states its own needs in one line
 * instead of accepting a bag of props from three levels up.
 *
 * The provider component lives in `PlanProvider.tsx`, so this module stays
 * free of JSX and can be imported from anywhere without dragging one in.
 */

import { createContext, useContext } from "react";
import type { Archetype } from "../types";
import type { PlanState } from "./reducer";
import type { PlanActions } from "./usePlanSession";

export interface PlanContextValue {
  state: PlanState;
  actions: PlanActions;
  /** Boat catalogue from `/api/v1/archetypes`. Empty until it lands. */
  archetypes: Archetype[];
  /** Spinner of the mode on screen, never the other computation's. */
  isLoading: boolean;
  /** Compute the single passage, re-framing the camera on the route first. */
  compute: () => void;
  /** Same, for the sweep. */
  computeWindows: () => void;
}

export const PlanContext = createContext<PlanContextValue | null>(null);

export function usePlan(): PlanContextValue {
  const value = useContext(PlanContext);
  if (value === null) {
    throw new Error("usePlan doit être appelé sous un PlanProvider");
  }
  return value;
}
