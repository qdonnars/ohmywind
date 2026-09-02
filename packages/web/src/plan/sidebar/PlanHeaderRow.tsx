// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { ModeToggle } from "../ModeToggle";
import { usePlan } from "../session/planContext";

// Header row: ModeToggle + an optional trash button to discard the plan.
// The trash sits flush with the toggle and only renders when a route exists
// (no waypoints → nothing to reset). Tooltip: "Réinitialiser".
export function PlanHeaderRow({
  locked,
  pristine,
}: {
  /** Both tabs dimmed and inactive: the empty state. */
  locked?: boolean;
  /** Neither tab selected: two waypoints are down but no mode is picked yet. */
  pristine?: boolean;
}) {
  const { state, actions } = usePlan();
  const mode = state.mode;
  const onModeChange = actions.setMode;
  // Nothing to reset on a fully empty form, so the trash only shows once the
  // user has placed enough to have something to clear.
  const onReset = state.waypoints.length >= 2 ? actions.reset : undefined;
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 min-w-0">
        <ModeToggle value={mode} onChange={onModeChange} locked={locked} pristine={pristine} />
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          title="Nouveau plan"
          aria-label="Nouveau plan"
          className="shrink-0 flex items-center justify-center rounded-lg transition-colors hover:opacity-100"
          style={{
            width: 38,
            background: "var(--ow-bg-2)",
            border: "1px solid var(--ow-line)",
            color: "var(--ow-fg-2)",
            opacity: 0.85,
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
      )}
    </div>
  );
}
