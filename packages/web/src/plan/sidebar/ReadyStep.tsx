// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "../session/planContext";
import { PlanHeaderRow } from "./PlanHeaderRow";
import { RefreshIcon } from "./parts";
import { useT } from "../../i18n";

/**
 * The compact step of the mobile drawer, once two waypoints are down and
 * nothing has been asked yet. The drawer only opens enough for this row, so
 * the map stays the focus while the route is still being traced: the button
 * computes with the departure and the boat as they stand, the link under it
 * opens the form for the reader who wants to set them first. Desktop has no
 * drawer to keep short and shows the form straight away.
 */
export function ReadyStep({ canCalculate }: { canCalculate: boolean }) {
  const { t } = useT();
  const { state, actions, compute } = usePlan();
  return (
    <div className="p-4 space-y-3 animate-fade-in">
      <PlanHeaderRow />
      <button
        type="button"
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
          : t("panel.form.waypointsNeeded", { count: state.waypoints.length })}
      </button>
      <button
        type="button"
        onClick={actions.openForm}
        className="w-full text-center text-xs font-semibold underline underline-offset-2"
        style={{ color: "var(--ow-fg-1)" }}
      >
        {t("panel.ready.adjust")}
      </button>
    </div>
  );
}
