// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The planner panel: which of its five views is on screen, and nothing else.
 *
 * This file used to be 1253 lines and take 33 props, with nine sub-components
 * inlined (annexe B, C2). Each of them now lives in its own file under
 * `sidebar/` and reads the session from `PlanContext`, so what is left here is
 * the branch itself.
 *
 * Its order is load-bearing: every view assumes the ones above it did not
 * match.
 *
 * 1. computing: a skeleton, so the panel never shows half a plan;
 * 2. failed: the error, with the mode pills still reachable;
 * 3. no route yet: the empty state;
 * 4. a route but no mode picked: the compact pick-a-mode step;
 * 5. the picked mode, filled when it has a result, as a form otherwise.
 */

import { validateSweep, type SweepValidation } from "./validateSweep";
import { EmptyState, ModePicker } from "./PlanStates";
import { usePolarConfig } from "../config/usePolarConfig";
import { usePlan } from "./session/planContext";
import { PlanHeaderRow } from "./sidebar/PlanHeaderRow";
import { PlanForm } from "./sidebar/PlanForm";
import { CompareResults } from "./sidebar/CompareResults";
import { SingleResults } from "./sidebar/SingleResults";
import { boatLabel } from "./sidebar/boatLabel";
import { useT } from "../i18n";

/** Placeholder while a computation runs, so the panel never shows half a plan. */
function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="skeleton h-8 w-48 rounded-lg" />
      <div className="skeleton h-5 w-32 rounded" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
      </div>
      <div className="skeleton h-2.5 rounded-full" />
      {[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
    </div>
  );
}

export function PlanSidebar() {
  const { t } = useT();
  const { state, actions, archetypes, isLoading } = usePlan();
  const {
    passage,
    complexity,
    windows,
    apiError,
    mode,
    sweepEarliest,
    sweepLatest,
    sweepIntervalHours,
    actionTaken,
    waypoints,
    archetype,
  } = state;
  const polarConfig = usePolarConfig();

  const sweepValid: SweepValidation =
    mode === "compare"
      ? validateSweep(sweepEarliest, sweepLatest, sweepIntervalHours)
      : { ok: true };
  const canCalculate = waypoints.length >= 2 && (mode === "single" || sweepValid.ok);

  // 1. computing
  if (isLoading) return <LoadingSkeleton />;

  // 2. failed
  if (apiError) {
    return (
      <div className="p-4">
        <PlanHeaderRow locked={waypoints.length < 2} />
        <div className="mt-4 rounded-xl p-4 text-sm" style={{ background: "var(--ow-err-soft)", color: "var(--ow-err)", border: "1px solid var(--ow-err-line)" }}>
          <p className="font-semibold mb-1">{t("plan.states.error.title")}</p>
          <p className="leading-relaxed">{apiError}</p>
        </div>
      </div>
    );
  }

  // 3. no route yet
  if (waypoints.length < 2) {
    return (
      <div className="p-4 animate-fade-in">
        <PlanHeaderRow locked />
        <EmptyState />
      </div>
    );
  }

  // 4. a route, no mode picked.
  // Mobile: pills and trash only, vertical real estate is precious and the
  // drawer only animates up enough for the toggle. Desktop adds the larger
  // narrative cards, which reassure first-time users with example phrasings.
  // Either way, clicking a pill or a card unlocks the full panel.
  if (!actionTaken) {
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <PlanHeaderRow pristine />
        <div className="hidden lg:block">
          <ModePicker onPick={actions.setMode} />
        </div>
      </div>
    );
  }

  // 5. the picked mode.
  const label = boatLabel(polarConfig, archetype, archetypes);
  if (mode === "compare" && windows && windows.length > 0) {
    return <CompareResults windows={windows} boatLabel={label} canCalculate={canCalculate} />;
  }
  if (mode === "compare" || !passage || !complexity) {
    return <PlanForm canCalculate={canCalculate} />;
  }
  return <SingleResults passage={passage} complexity={complexity} boatLabel={label} />;
}
