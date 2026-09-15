// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { TimeAnchorToggle } from "../ModeToggle";
import { usePlan } from "../session/planContext";
import { PlanHeaderRow } from "./PlanHeaderRow";
import { DepartureSlider } from "./DepartureSlider";
import { ArchetypeSelector } from "./ArchetypeSelector";
import { RefreshIcon } from "./parts";
import { useT } from "../../i18n";

/** The inputs of the plan, before it has a result to show: when to leave
    (or when to arrive), on which boat. */
export function PlanForm({ canCalculate }: { canCalculate: boolean }) {
  const { t } = useT();
  const { state, actions, compute } = usePlan();
  const { timeAnchor, waypoints } = state;

  return (
    <div className="p-4 space-y-3 animate-fade-in">
      <PlanHeaderRow />

      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          background: "var(--ow-bg-1)",
          border: "1px solid var(--ow-line)",
          borderTop: "2px solid var(--ow-accent)",
        }}
      >
        <div className="space-y-3">
          <TimeAnchorToggle value={timeAnchor} onChange={actions.setTimeAnchor} />
          <DepartureSlider />
        </div>

        <ArchetypeSelector />

        <button
          onClick={compute}
          disabled={!canCalculate}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{
            background: canCalculate ? "var(--ow-accent)" : "var(--ow-bg-2)",
            color: canCalculate ? "var(--ow-on-accent)" : "var(--ow-fg-3)",
            border: `1px solid ${canCalculate ? "transparent" : "var(--ow-line-2)"}`,
            cursor: canCalculate ? "pointer" : "not-allowed",
          }}
        >
          <RefreshIcon size={14} />
          {canCalculate
            ? t("panel.form.calculate")
            : t("panel.form.waypointsNeeded", { count: waypoints.length })}
        </button>
      </div>
    </div>
  );
}
