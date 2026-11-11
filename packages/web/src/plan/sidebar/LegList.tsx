// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo } from "react";
import type { AggregatedLeg } from "../aggregateLegs";
import { aggregateLegs, buildLegSummaryCells } from "../aggregateLegs";
import { beaufortLevel, windSoftVar } from "../../domain/thresholds";
import { AlertChip } from "../../components/AlertChip";
import { LegExpanded } from "./LegExpanded";
import type { PassageReport, SegmentReport } from "../types";
import { planMinUpwind } from "../../config/polarConfig";
import { usePolarConfig } from "../../config/usePolarConfig";
import { usePlan } from "../session/planContext";
import { num1 } from "../format";
import { useT } from "../../i18n";

// ── LegList ──────────────────────────────────────────────────────────────────
// Click-to-expand list of legs. Collapsed = one row of figures (durée,
// allure, vent, mer), the units said once in the column headers. A strong
// wind or a formed sea is said by its own figure, inked as a warning; only
// what no figure can say (a chop, a wind against the current) gets a chip
// under the row. Expanded = the leg's steps and the
// card with the dial (see LegExpanded).

const CELL_LINE = { borderTop: "1px solid var(--ow-line)" } as const;
const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

/** The unit of a column, said once in its header: lighter than the label,
    and neither capitalised nor spaced like it. A real space before it, not
    a margin: a screen reader would otherwise read « Merm ». */
function Unit({ children }: { children: string }) {
  return (
    <span className="font-medium normal-case tracking-normal" style={{ color: "var(--ow-fg-2)" }}>
      {children}
    </span>
  );
}

function LegRow({
  leg,
  index,
  expanded,
  onToggle,
  segments,
  minUpwindDeg,
}: {
  leg: AggregatedLeg;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  segments: SegmentReport[];
  minUpwindDeg: number;
}) {
  const summary = buildLegSummaryCells(leg);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };
  const rowBg = expanded ? "var(--ow-bg-2)" : "transparent";
  const figure = "py-2.5 px-1 align-middle text-[12.5px] font-semibold tabular-nums whitespace-nowrap";

  // Each leg returns up to three `<tr>`s into the shared `<table>` in
  // LegList: the row of figures, the alert under it when the leg raises one,
  // and the expanded content. Because they're all in the same table, every
  // leg's figures live in the same column widths, the cross-row alignment a
  // tableless flex/grid layout couldn't give us when each LegRow had its own
  // grid container.
  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={handleKey}
        className="cursor-pointer"
        style={{ background: rowBg }}
      >
        <td className="py-2.5 pl-4 pr-1 align-middle" style={CELL_LINE}>
          {/* The leg is named "from → to" by its user waypoints (1-based),
              beside a bar in the wind's colour: the same softened Beaufort
              tint as the leg's steps on the map and in the bar above. The
              distance sits under it, so leg length reads without expanding. */}
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="shrink-0 rounded-[2px]"
              style={{ width: 4, height: 28, background: windSoftVar(beaufortLevel(leg.tws_avg_kn)) }}
            />
            <div className="tabular-nums whitespace-nowrap" style={MONO}>
              <div className="text-[12.5px] font-bold leading-tight" style={{ color: "var(--ow-fg-0)" }}>
                {index + 1} → {index + 2}
              </div>
              <div className="text-[10.5px] leading-tight mt-0.5" style={{ color: "var(--ow-fg-2)" }}>
                {num1(leg.distance_nm)} nm
              </div>
            </div>
          </div>
        </td>
        <td className={figure} style={{ ...CELL_LINE, color: "var(--ow-fg-0)" }}>
          {summary.duration}
        </td>
        <td className="py-2.5 px-1 align-middle text-xs leading-tight" style={{ ...CELL_LINE, color: "var(--ow-fg-1)" }}>
          {summary.allure}
        </td>
        <td
          className={figure}
          title={summary.windNote ?? undefined}
          style={{ ...CELL_LINE, color: summary.windNote ? "var(--ow-warn-ink)" : "var(--ow-fg-0)" }}
        >
          {summary.wind}
          {/* The colour is the alert for the eye; a screen reader gets the
              words. */}
          {summary.windNote && <span className="sr-only">, {summary.windNote}</span>}
        </td>
        <td
          className={figure}
          title={summary.seaNote ?? undefined}
          style={{ ...CELL_LINE, color: summary.seaNote ? "var(--ow-warn-ink)" : "var(--ow-fg-0)" }}
        >
          {summary.sea ?? <span style={{ color: "var(--ow-fg-2)" }}>—</span>}
          {summary.seaNote && <span className="sr-only">, {summary.seaNote}</span>}
        </td>
        <td className="py-2.5 pl-1 pr-3.5 text-right align-middle" style={CELL_LINE}>
          <span
            aria-hidden="true"
            className="inline-flex"
            style={{
              color: expanded ? "var(--ow-accent)" : "var(--ow-fg-3)",
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 150ms ease, color 150ms ease",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6l5 5 5-5" />
            </svg>
          </span>
        </td>
      </tr>
      {summary.alert && (
        // The alert has a row of its own, under the figures it qualifies and
        // aligned on the leg's name. A click on it opens the leg like the
        // row above; the keyboard has that row.
        <tr onClick={onToggle} className="cursor-pointer" style={{ background: rowBg }}>
          <td colSpan={6} className="pt-0 pb-2.5 pr-4" style={{ paddingLeft: 28 }}>
            <AlertChip size="s">{summary.alert}</AlertChip>
          </td>
        </tr>
      )}
      {expanded && (
        <tr style={{ background: rowBg }}>
          <td colSpan={6} className="px-4 pb-3 pt-1">
            <LegExpanded leg={leg} segments={segments} minUpwindDeg={minUpwindDeg} />
          </td>
        </tr>
      )}
    </>
  );
}

export function LegList({ passage }: { passage: PassageReport }) {
  const { t, lang } = useT();
  const { state, actions } = usePlan();
  const { waypoints, archetype, selectedLegIdx: openIdx } = state;
  const polarCfg = usePolarConfig();
  // Memoised: this walks every segment of the passage and was recomputed
  // inside a JSX IIFE, so it ran again on every tick of the departure slider.
  //
  // The minimum upwind angle is that of the boat this plan was computed for,
  // so a leg whose direct course sits in the no-go zone reads « Près
  // (louvoyage) » rather than a close-hauled label the boat cannot hold
  // (#277).
  const minUpwindDeg = useMemo(() => planMinUpwind(polarCfg, archetype), [polarCfg, archetype]);
  const legs: AggregatedLeg[] = useMemo(() => {
    // The allure and the sea flags are produced by `aggregateLegs` through
    // `t()`, which reads the language from the store, not from a parameter.
    // Naming `lang` here is what ties the memo to it, so a language switch
    // rebuilds the labels.
    void lang;
    return aggregateLegs(passage.segments, waypoints, passage.efficiency, minUpwindDeg);
  }, [passage.segments, passage.efficiency, waypoints, minUpwindDeg, lang]);
  const onOpenChange = actions.selectLeg;
  return (
    <div>
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr
            className="text-[9.5px] uppercase tracking-[0.1em]"
            style={{ color: "var(--ow-fg-2)" }}
          >
            <th className="pt-3 pb-1.5 pl-4 pr-1 text-left font-semibold">{t("panel.legs.colLeg")}</th>
            <th className="pt-3 pb-1.5 px-1 text-left font-semibold">{t("panel.legs.colDuration")}</th>
            <th className="pt-3 pb-1.5 px-1 text-left font-semibold">{t("panel.legs.colPointOfSail")}</th>
            <th className="pt-3 pb-1.5 px-1 text-left font-semibold whitespace-nowrap">
              {t("panel.legs.colWind")} <Unit>kn</Unit>
            </th>
            <th className="pt-3 pb-1.5 px-1 text-left font-semibold whitespace-nowrap">
              {t("panel.legs.colSea")} <Unit>m</Unit>
            </th>
            <th className="pt-3 pb-1.5 pl-1 pr-3.5" />
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, i) => (
            <LegRow
              key={i}
              leg={leg}
              index={i}
              expanded={openIdx === i}
              onToggle={() => onOpenChange(openIdx === i ? null : i)}
              segments={passage.segments}
              minUpwindDeg={minUpwindDeg}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
