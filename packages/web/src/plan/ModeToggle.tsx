// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The two names a plan can be in, and the departure / arrival anchor toggle.
 *
 * The mode pills that used to live here are gone: « Simuler ma route » is
 * the plan itself now, and « Comparer ce trajet » a screen opened from it
 * (see `plan/compare/`). The types keep this module's name because the
 * draft, the cache and the reducer have imported them from here since the
 * two were siblings.
 */

import { useT, type Key } from "../i18n";

/** "single" is the plan; "compare" is the comparison open over it. */
export type PlanMode = "single" | "compare";

// Sub-mode of the plan: is the picked time a departure or a target arrival?
// Departure → forward simulation. Arrival → ETA-driven solve
// (server.estimate_passage_for_arrival via /api/v1/passage-by-eta).
export type TimeAnchor = "departure" | "arrival";

const TIME_ANCHOR_META: Record<TimeAnchor, { title: Key; sub: Key }> = {
  departure: { title: "plan.timeAnchor.departure.title", sub: "plan.timeAnchor.departure.sub" },
  arrival: { title: "plan.timeAnchor.arrival.title", sub: "plan.timeAnchor.arrival.sub" },
};

export function TimeAnchorToggle({
  value,
  onChange,
}: {
  value: TimeAnchor;
  onChange: (a: TimeAnchor) => void;
}) {
  const { t } = useT();
  // Light accent-soft pill on the active option, no border, no shadow, no
  // enclosing surface: a sub-option of the form, not a parallel choice.
  return (
    <div
      className="grid grid-cols-2 gap-0.5"
      role="tablist"
      aria-label={t("plan.timeAnchor.tablist")}
    >
      {(["departure", "arrival"] as const).map((m) => {
        const meta = TIME_ANCHOR_META[m];
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className="text-left transition-colors"
            style={{
              padding: "8px 10px",
              background: active ? "var(--ow-accent-soft)" : "transparent",
              borderRadius: 6,
            }}
          >
            <div
              className="text-xs font-semibold mb-0.5"
              style={{ color: active ? "var(--ow-fg-0)" : "var(--ow-fg-1)" }}
            >
              {t(meta.title)}
            </div>
            <div className="text-[10px] leading-tight" style={{ color: "var(--ow-fg-2)" }}>
              {t(meta.sub)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
