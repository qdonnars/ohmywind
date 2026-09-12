// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ReactNode } from "react";
import { ModeToggle } from "../ModeToggle";
import { usePlan } from "../session/planContext";
import { useT } from "../../i18n";

// Header row: ModeToggle plus, flush right, either the trash button that
// discards the plan (forms and the pick-a-mode step) or, in the filled views,
// the recompute control handed in as `action`. There the trash moves down to
// the recap row (see ResetButton), which stays reachable however low the
// mobile drawer sits, while the mode pills scroll away above the results.
export function PlanHeaderRow({
  locked,
  pristine,
  compact,
  action,
}: {
  /** Both tabs dimmed and inactive: the empty state. */
  locked?: boolean;
  /** Neither tab selected: two waypoints are down but no mode is picked yet. */
  pristine?: boolean;
  /** Filled views: one-line pills, `action` instead of the trash. */
  compact?: boolean;
  /** Control rendered flush right of the pills in the compact layout. */
  action?: ReactNode;
}) {
  const { state, actions } = usePlan();
  const mode = state.mode;
  const onModeChange = actions.setMode;
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 min-w-0">
        <ModeToggle value={mode} onChange={onModeChange} locked={locked} pristine={pristine} compact={compact} />
      </div>
      {compact ? action : <ResetButton />}
    </div>
  );
}

// The trash that discards the plan. Nothing to reset on a fully empty form,
// so it only renders once the user has placed enough to have something to
// clear. Tooltip: "Nouveau plan". Two looks for two rows: a muted square
// next to the mode pills, a soft red pill in the recap row of a filled view
// (design "Plan · résultats"), where it has to read as the destructive
// action among the "Modifier" affordance and the totals.
export function ResetButton({ danger }: { danger?: boolean }) {
  const { t } = useT();
  const { state, actions } = usePlan();
  if (state.waypoints.length < 2) return null;
  return (
    <button
      type="button"
      onClick={actions.reset}
      title={t("panel.header.newPlan")}
      aria-label={t("panel.header.newPlan")}
      className="shrink-0 flex items-center justify-center transition-colors hover:opacity-100"
      style={
        danger
          ? {
              width: 34,
              height: 30,
              borderRadius: 999,
              background: "var(--ow-err-soft)",
              border: "1px solid var(--ow-err-line)",
              color: "var(--ow-err)",
            }
          : {
              width: 38,
              borderRadius: 8,
              background: "var(--ow-bg-2)",
              border: "1px solid var(--ow-line)",
              color: "var(--ow-fg-2)",
              opacity: 0.85,
            }
      }
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
