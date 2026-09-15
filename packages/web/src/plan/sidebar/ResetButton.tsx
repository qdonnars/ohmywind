// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "../session/planContext";
import { useT } from "../../i18n";

// The trash that discards the plan. Nothing to reset on a fully empty form,
// so it only renders once the user has placed enough to have something to
// clear. Tooltip: "Nouveau plan". A soft red square the size of the control
// it sits next to (Calculer on a form, Recalculer on a result), so it reads
// as the destructive action of the row.
export function ResetButton() {
  const { t } = useT();
  const { state, actions } = usePlan();
  if (state.waypoints.length < 2) return null;
  return (
    <button
      type="button"
      onClick={actions.reset}
      title={t("panel.header.newPlan")}
      aria-label={t("panel.header.newPlan")}
      className="shrink-0 flex items-center justify-center rounded-lg transition-colors"
      style={{
        width: 38,
        height: 34,
        background: "var(--ow-err-soft)",
        border: "1px solid var(--ow-err-line)",
        color: "var(--ow-err)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 4h11" />
        <path d="M6 4V2.5h4V4" />
        <path d="M3.5 4l.9 9.2a1 1 0 0 0 1 .8h5.2a1 1 0 0 0 1-.8L12.5 4" />
        <path d="M6.5 6.5v5" />
        <path d="M9.5 6.5v5" />
      </svg>
    </button>
  );
}
