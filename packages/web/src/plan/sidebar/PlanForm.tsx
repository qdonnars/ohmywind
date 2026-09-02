// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { TimeAnchorToggle } from "../ModeToggle";
import { usePlan } from "../session/planContext";
import { PlanHeaderRow } from "./PlanHeaderRow";
import { DepartureSlider } from "./DepartureSlider";
import { SweepForm } from "./SweepForm";
import { ArchetypeSelector } from "./ArchetypeSelector";
import { RefreshIcon } from "./parts";

/** The inputs of the picked mode, before it has a result to show. */
export function PlanForm({ canCalculate }: { canCalculate: boolean }) {
  const { state, actions, compute, computeWindows } = usePlan();
  const { mode, timeAnchor, waypoints } = state;
  const accent = mode === "compare" ? "#F4C25C" : "var(--ow-accent)";
  const ctaInk = mode === "compare" ? "#3a2a08" : "#fff";

  return (
    <div className="p-4 space-y-3 animate-fade-in">
      <PlanHeaderRow />

      {/* Tab-panel: everything below is "the contents" of the picked mode.
          The 2 px accent stripe at the top picks up the mode's color
          (cyan for Simuler, amber for Comparer) so the panel reads as the
          payload of the active pill above. */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          background: "var(--ow-bg-1)",
          border: "1px solid var(--ow-line)",
          borderTop: `2px solid ${accent}`,
        }}
      >
        {mode === "single" ? (
          <div className="space-y-3">
            <TimeAnchorToggle value={timeAnchor} onChange={actions.setTimeAnchor} />
            <DepartureSlider />
          </div>
        ) : (
          <SweepForm />
        )}

        <ArchetypeSelector />

        <button
          onClick={mode === "single" ? compute : computeWindows}
          disabled={!canCalculate}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{
            background: canCalculate ? accent : "var(--ow-bg-2)",
            color: canCalculate ? ctaInk : "var(--ow-fg-3)",
            border: `1px solid ${canCalculate ? "transparent" : "var(--ow-line-2)"}`,
            cursor: canCalculate ? "pointer" : "not-allowed",
          }}
        >
          <RefreshIcon size={14} />
          {canCalculate
            ? mode === "single" ? "Calculer le passage" : "Comparer les créneaux"
            : `${waypoints.length}/2 waypoints`}
        </button>
      </div>
    </div>
  );
}
