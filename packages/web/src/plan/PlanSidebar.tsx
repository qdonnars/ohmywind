// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The planner panel: which of its views is on screen, and nothing else.
 *
 * This file used to be 1253 lines and take 33 props, with nine sub-components
 * inlined (annexe B, C2). Each of them now lives in its own file under
 * `sidebar/` or `compare/` and reads the session from `PlanContext`, so what
 * is left here is the branch itself.
 *
 * Its order is load-bearing: every view assumes the ones above it did not
 * match.
 *
 * 1. computing: a skeleton, so the panel never shows half a plan;
 * 2. failed: the error, with the way back still reachable;
 * 3. no route yet: the empty state;
 * 4. a route but nothing asked yet: on a phone the compact step, on desktop
 *    the form;
 * 5. the comparison, when it is open over the plan;
 * 6. the plan, filled when it has a result, as a form otherwise.
 */

import { EmptyState } from "./PlanStates";
import { usePolarConfig } from "../config/usePolarConfig";
import { usePlan } from "./session/planContext";
import { ResetButton } from "./sidebar/ResetButton";
import { PlanForm } from "./sidebar/PlanForm";
import { ReadyStep } from "./sidebar/ReadyStep";
import { SingleResults } from "./sidebar/SingleResults";
import { boatLabel } from "./sidebar/boatLabel";
import { CompareHead, CompareScreen } from "./compare/CompareScreen";
import { useT } from "../i18n";
import { useEffect, useState } from "react";

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
  const { state, archetypes, isLoading, compute, computeWindows } = usePlan();
  const {
    passage,
    complexity,
    apiError,
    retry,
    mode,
    actionTaken,
    waypoints,
    archetype,
  } = state;
  const polarConfig = usePolarConfig();
  const canCalculate = waypoints.length >= 2;
  // Above an error: in the comparison its head, with the way back to the
  // plan; in the plan, the trash, so a broken plan can still be discarded.
  const head =
    mode === "compare" ? (
      <CompareHead />
    ) : (
      <div className="flex justify-end">
        <ResetButton />
      </div>
    );

  // 1. computing. On the departure axis the list waits on its own (see
  // SlotList), so the chips that launched the sweep stay under the hand.
  if (isLoading && !(mode === "compare" && state.compareAxis === "slots")) return <LoadingSkeleton />;

  // 2a. the backend is waking up: the request goes again on its own
  if (retry) {
    return (
      <div className="p-4">
        {head}
        <WakingNotice
          retry={retry}
          onRetryNow={mode === "compare" ? computeWindows : compute}
        />
      </div>
    );
  }

  // 2. failed
  if (apiError) {
    return (
      <div className="p-4">
        {head}
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
        <EmptyState />
      </div>
    );
  }

  // 4. a route, nothing asked yet. On a phone the drawer only opens enough
  // for the compact step, so the map stays the focus while the route is
  // still being traced; desktop has room for the form itself.
  if (!actionTaken) {
    return (
      <>
        <div className="lg:hidden">
          <ReadyStep canCalculate={canCalculate} />
        </div>
        <div className="hidden lg:block">
          <PlanForm canCalculate={canCalculate} />
        </div>
      </>
    );
  }

  // 5. the comparison, open over the plan
  if (mode === "compare") return <CompareScreen />;

  // 6. the plan
  if (!passage || !complexity) return <PlanForm canCalculate={canCalculate} />;
  const label = boatLabel(polarConfig, archetype, archetypes);
  return <SingleResults passage={passage} complexity={complexity} boatLabel={label} />;
}

/**
 * Shown instead of the error while the backend wakes up (usePlanSession
 * retries by itself). A countdown so the wait is visibly finite, and a button
 * for the reader who would rather not wait for it.
 */
function WakingNotice({
  retry,
  onRetryNow,
}: {
  retry: { at: number; attempt: number; max: number };
  onRetryNow: () => void;
}) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((retry.at - now) / 1000));
  return (
    <div
      className="mt-4 rounded-xl p-4 text-sm animate-fade-in"
      style={{ background: "var(--ow-bg-1)", color: "var(--ow-fg-1)", border: "1px solid var(--ow-line-2)" }}
    >
      <p className="font-semibold mb-1" style={{ color: "var(--ow-fg-0)" }}>
        {t("plan.states.waking.title")}
      </p>
      <p className="leading-relaxed">
        {t("plan.states.waking.body", { seconds, attempt: retry.attempt, max: retry.max })}
      </p>
      <button
        type="button"
        onClick={onRetryNow}
        className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold"
        style={{ background: "var(--ow-accent)", color: "var(--ow-on-accent)" }}
      >
        {t("plan.states.waking.retryNow")}
      </button>
    </div>
  );
}
