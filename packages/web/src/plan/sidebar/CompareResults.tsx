// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import type { PassageWindow } from "../types";
import { WindowsTable } from "../WindowsTable";
import { Warn, RecapButton } from "../PlanStates";
import { usePlan } from "../session/planContext";
import { PlanHeaderRow } from "./PlanHeaderRow";
import { SweepForm } from "./SweepForm";
import { ArchetypeSelector } from "./ArchetypeSelector";
import { RecomputeBar, ResultsAnchor, StalePlaceholder } from "./parts";
import { fmtClock, fmtDay } from "../../domain/datetime";
import { useT } from "../../i18n";

/** Compare mode with a sweep behind it: the table of windows plus its recap. */
export function CompareResults({
  windows,
  boatLabel,
  canCalculate,
}: {
  windows: PassageWindow[];
  boatLabel: string;
  canCalculate: boolean;
}) {
  const { t, tn } = useT();
  const { state, actions, computeWindows } = usePlan();
  const { sweepEarliest, sweepLatest, sweepIntervalHours, metaWarnings, isStale } = state;
  const [isEditingParams, setIsEditingParams] = useState(false);

  return (
    <div className="animate-fade-in">
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--ow-line)" }}>
        <PlanHeaderRow />
      </div>

      <RecomputeBar
        onClick={computeWindows}
        disabled={!canCalculate}
        style={{
          background: canCalculate ? "var(--ow-compare)" : "var(--ow-bg-2)",
          color: canCalculate ? "var(--ow-on-compare)" : "var(--ow-fg-3)",
          border: `1px solid ${canCalculate ? "transparent" : "var(--ow-line)"}`,
        }}
      />

      <ResultsAnchor />
      <RecapButton
        primary={`${fmtDay(sweepEarliest)} ${fmtClock(sweepEarliest)} → ${fmtDay(sweepLatest)} ${fmtClock(sweepLatest)}`}
        secondary={t("panel.compare.recapStep", {
          interval: sweepIntervalHours,
          boat: boatLabel,
        })}
        isOpen={isEditingParams}
        onClick={() => setIsEditingParams((v) => !v)}
      />
      {isEditingParams && (
        <div className="px-4 py-3 space-y-3" style={{ borderBottom: "1px solid var(--ow-line)", background: "var(--ow-bg-2)" }}>
          <SweepForm />
          <ArchetypeSelector />
        </div>
      )}

      {metaWarnings.length > 0 && (
        <div className="px-4 py-2.5 space-y-1.5" style={{ borderBottom: "1px solid var(--ow-line)" }}>
          {metaWarnings.map((m, i) => <Warn key={i}>{m}</Warn>)}
        </div>
      )}

      {/* When the route has been edited since the sweep, the cached windows
          (and the per-window passages they'd drill into) describe the *old*
          itinerary, and opening one would render a route that no longer
          matches the map. Hide the table behind a recompute prompt, mirroring single
          mode (#152). */}
      {isStale ? (
        <StalePlaceholder>{t("panel.compare.stale")}</StalePlaceholder>
      ) : (
        <>
          <WindowsTable windows={windows} onSelect={actions.selectWindow} />
          <p className="px-4 py-2 text-[10px]" style={{ color: "var(--ow-fg-3)", borderTop: "1px solid var(--ow-line)" }}>
            {tn("panel.compare.windowsCompared", windows.length)}
          </p>
        </>
      )}
    </div>
  );
}
