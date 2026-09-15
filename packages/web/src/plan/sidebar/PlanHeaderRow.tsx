// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ReactNode } from "react";
import { usePlan } from "../session/planContext";
import { routeLengthNm } from "../../utils/geo";
import { num1 } from "../format";
import { useT } from "../../i18n";

// Header row: the route in one line (its points, its legs, its length) and,
// flush right, the controls that act on the whole plan: the recompute
// control handed in as `action` by the filled views, and the trash that
// discards the plan. Side by side, so the two things one does to a plan
// are found in one place; the title « Votre route » that used to sit
// above the line said nothing the line did not.
//
// The mode pills used to sit here. A trip is one track and one departure;
// the plan is that trip, and « Comparer ce trajet » a door at the bottom of
// its results rather than a sibling mode to pick before seeing anything.
export function PlanHeaderRow({
  locked,
  action,
}: {
  /** Dimmed: the empty state, under two waypoints. */
  locked?: boolean;
  /** Control rendered before the trash, in the filled views. */
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
    <div className="flex items-center gap-2" style={{ minHeight: 34 }}>
      <div
        className="flex-1 min-w-0 text-xs font-semibold tabular-nums truncate"
        style={{ color: locked ? "var(--ow-fg-3)" : "var(--ow-fg-1)", fontFamily: "var(--ow-font-mono)" }}
        title={t("panel.route.title")}
      >
        {sub}
      </div>
      {action}
      <ResetButton />
    </div>
  );
}

// The trash that discards the plan. Nothing to reset on a fully empty form,
// so it only renders once the user has placed enough to have something to
// clear. Tooltip: "Nouveau plan". A soft red square, the size of the
// recompute control it sits next to, so it reads as the destructive action
// of the row.
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
