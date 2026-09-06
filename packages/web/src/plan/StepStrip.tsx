// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The steps of an open leg, as a strip of blocks the reader can tap.
 *
 * One block per server sampling point, wide in proportion to its distance
 * and painted in the same wind bands as the bar under the totals, so a leg
 * whose average reads "6–9 kn" shows at a glance which of its steps carried
 * the 9. Tapping a block opens that step in the card below; tapping it again
 * returns to the average. The toggle on the right says the same thing in
 * words, for readers who would not think of tapping a coloured bar.
 */

import type { AggregatedLeg } from "./aggregateLegs";
import { cxLevel, cxLevelVar } from "../domain/thresholds";
import { fmtClock } from "../domain/datetime";
import { useT } from "../i18n";

type View = "average" | "detail";

function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const { t } = useT();
  return (
    <div
      role="group"
      aria-label={t("plan.steps.viewToggle.label")}
      className="shrink-0 inline-flex gap-0.5 p-[2px] rounded-md"
      style={{ background: "var(--ow-bg-2)", border: "1px solid var(--ow-line)" }}
    >
      {(["average", "detail"] as const).map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className="text-[11px] font-semibold rounded px-2 py-1 transition-colors"
            style={{
              background: active ? "var(--ow-bg-1)" : "transparent",
              border: `1px solid ${active ? "var(--ow-line-2)" : "transparent"}`,
              boxShadow: active ? "var(--ow-shadow-sm)" : "none",
              color: active ? "var(--ow-fg-0)" : "var(--ow-fg-2)",
            }}
          >
            {v === "average"
              ? t("plan.steps.viewToggle.average")
              : t("plan.steps.viewToggle.detail")}
          </button>
        );
      })}
    </div>
  );
}

export function StepStrip({
  steps,
  selected,
  onSelect,
}: {
  steps: AggregatedLeg[];
  /** Index of the open step, null for the average. */
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const { t } = useT();
  const n = steps.length;
  if (n === 0) return null;
  const first = steps[0];
  const last = steps[n - 1];
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex gap-1" role="group" aria-label={t("plan.steps.groupLabel")}>
          {steps.map((step, i) => {
            const active = selected === i;
            const dimmed = selected != null && !active;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={active}
                aria-label={t("plan.steps.stepLabel", {
                  index: i + 1,
                  total: n,
                  time: fmtClock(step.start_time),
                })}
                onClick={() => onSelect(active ? null : i)}
                className="rounded-md transition-opacity"
                style={{
                  flex: `${Math.max(step.distance_nm, 0.01)} 1 0`,
                  minWidth: 22,
                  height: 26,
                  background: cxLevelVar(cxLevel(step.tws_avg_kn)),
                  opacity: dimmed ? 0.4 : 1,
                  outline: active ? "2px solid var(--ow-accent)" : "none",
                  outlineOffset: 1,
                }}
              />
            );
          })}
        </div>
        <div
          className="flex justify-between mt-1 text-[10px] tabular-nums"
          style={{ color: "var(--ow-fg-2)", fontFamily: "var(--ow-font-mono)" }}
        >
          <span>{fmtClock(first.start_time)}</span>
          <span>{fmtClock(last.end_time)}</span>
        </div>
      </div>
      {n > 1 && (
        <ViewToggle
          value={selected == null ? "average" : "detail"}
          onChange={(v) => onSelect(v === "average" ? null : (selected ?? 0))}
        />
      )}
    </div>
  );
}
