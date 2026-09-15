// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ReactNode } from "react";
import { usePlan } from "../session/planContext";
import { routeLengthNm } from "../../utils/geo";
import { num1 } from "../format";
import { useT } from "../../i18n";

// Header row: the route in one line (its points, its legs, its length) and,
// flush right, either the trash button that discards the plan (the forms)
// or, in the filled views, the recompute control handed in as `action`.
// There the trash moves down to the recap row (see ResetButton), which stays
// reachable however low the mobile drawer sits.
//
// The mode pills used to sit here. A trip is one track and one departure;
// the plan is that trip, and « Comparer ce trajet » a door at the bottom of
// its results rather than a sibling mode to pick before seeing anything.
export function PlanHeaderRow({
  locked,
  compact,
  action,
}: {
  /** Dimmed: the empty state, under two waypoints. */
  locked?: boolean;
  /** Filled views: `action` instead of the trash. */
  compact?: boolean;
  /** Control rendered flush right of the route in the compact layout. */
  action?: ReactNode;
}) {
  const { t, tn } = useT();
  const { state } = usePlan();
  const n = state.waypoints.length;
  const sub =
    n < 2
      ? tn("panel.route.points", n)
      : t("panel.route.summary", {
          points: n,
          legs: tn("panel.route.legs", n - 1),
          nm: num1(routeLengthNm(state.waypoints)),
        });
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div
          className="text-[13px] font-semibold leading-tight truncate"
          style={{ color: locked ? "var(--ow-fg-2)" : "var(--ow-fg-0)" }}
        >
          {t("panel.route.title")}
        </div>
        <div
          className="text-[10px] mt-0.5 tabular-nums truncate"
          style={{ color: "var(--ow-fg-3)", fontFamily: "var(--ow-font-mono)" }}
        >
          {sub}
        </div>
      </div>
      {compact ? action : <ResetButton />}
    </div>
  );
}

// The trash that discards the plan. Nothing to reset on a fully empty form,
// so it only renders once the user has placed enough to have something to
// clear. Tooltip: "Nouveau plan". Two looks for two rows: a muted square
// next to the route line, a soft red pill in the recap row of a filled view
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
              height: 34,
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
