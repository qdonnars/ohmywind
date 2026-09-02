// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, type ReactNode } from "react";
import { PlanContext, type PlanContextValue } from "./planContext";

/**
 * Publishes the session to the panel. See `planContext.ts` for what is in it.
 *
 * The caller assembles the value from several sources, so it is memoised here
 * on its parts: one identity per session change rather than one per render of
 * the page.
 */
export function PlanProvider({
  value,
  children,
}: {
  value: PlanContextValue;
  children: ReactNode;
}) {
  const { state, actions, archetypes, isLoading, compute, computeWindows } = value;
  const memoised = useMemo<PlanContextValue>(
    () => ({ state, actions, archetypes, isLoading, compute, computeWindows }),
    [state, actions, archetypes, isLoading, compute, computeWindows],
  );
  return <PlanContext.Provider value={memoised}>{children}</PlanContext.Provider>;
}
