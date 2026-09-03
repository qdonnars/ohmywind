// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo } from "react";
import type { AggregatedLeg } from "../aggregateLegs";
import { aggregateLegs, buildLegSummaryCells } from "../aggregateLegs";
import { cxLevel, cxLevelVar } from "../../domain/thresholds";
import { LegExpanded } from "./LegExpanded";
import type { PassageReport, SegmentReport } from "../types";
import { planMinUpwind } from "../../config/polarConfig";
import { usePolarConfig } from "../../config/usePolarConfig";
import { usePlan } from "../session/planContext";

// ── LegList ──────────────────────────────────────────────────────────────────
// Click-to-expand list of legs. Collapsed = one row of summary cells (durée,
// allure, vent, mer). Expanded = the strip of the leg's steps and the card
// with the dial, on the average or on one step (see LegExpanded).

function SummaryCell({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span
      className="text-xs whitespace-normal"
      style={{ color: "var(--ow-fg-1)", lineHeight: 1.15, display: "inline-block" }}
    >
      {value}
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
  const cx = cxLevel((leg.tws_min + leg.tws_max) / 2);
  const summary = buildLegSummaryCells(leg);
  const num1 = (n: number) => n.toFixed(1).replace(".", ",");

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };
  const rowBg = expanded ? "var(--ow-bg-2)" : "transparent";

  // Each leg returns two `<tr>`s into the shared `<table>` in LegList:
  // a summary row (badge + the four cells + chevron) and an optional expand
  // row (the steps strip + the card).
  // Because they're all in the same table, the colgroup defined in LegList
  // forces every leg's chip cells to live in the same column widths, exactly
  // the cross-row alignment a tableless flex/grid layout couldn't
  // give us when each LegRow had its own grid container.
  return (
    <>
      {/* Single-row leg: badge + 4 info cells + chevron. The speed
          indicator was dropped and the redundant "Tronçon X" label was
          dropped earlier: the numbered badge identifies the leg. */}
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={handleKey}
        className="cursor-pointer"
        style={{ background: rowBg }}
      >
        <td className="py-2 pl-3 pr-2 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          {/* Leg label is "from→to" using user-waypoint indices (1-based).
              `index` here is 0-based across legs, so leg N goes from
              waypoint N to waypoint N+1. Distance sits under the badge so
              the user can scan leg length without expanding. */}
          <div className="flex flex-col items-start gap-0.5">
            <span
              className="inline-flex h-6 px-1.5 rounded-md items-center justify-center text-[10px] font-bold tabular-nums whitespace-nowrap"
              style={{ background: cxLevelVar(cx), color: "var(--ow-cell-ink)", fontFamily: "var(--ow-font-mono)" }}
            >
              {index + 1}→{index + 2}
            </span>
            <span
              className="text-[10px] tabular-nums whitespace-nowrap"
              style={{ color: "var(--ow-fg-2)", fontFamily: "var(--ow-font-mono)" }}
            >
              {num1(leg.distance_nm)} nm
            </span>
          </div>
        </td>
        <td className="py-2 px-1 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <SummaryCell value={summary.duration} />
        </td>
        <td className="py-2 px-1 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <SummaryCell value={summary.allure} />
        </td>
        <td className="py-2 px-1 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <SummaryCell value={summary.wind} />
        </td>
        <td className="py-2 px-1 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <SummaryCell value={summary.flag} />
        </td>
        <td className="py-2 pl-1 pr-3 text-right align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <span
            aria-hidden="true"
            className="inline-flex"
            style={{
              color: expanded ? "var(--ow-accent)" : "var(--ow-fg-3)",
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 150ms ease, color 150ms ease",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6l5 5 5-5" />
            </svg>
          </span>
        </td>
      </tr>
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
  const legs: AggregatedLeg[] = useMemo(
    () => aggregateLegs(passage.segments, waypoints, passage.efficiency, minUpwindDeg),
    [passage.segments, passage.efficiency, waypoints, minUpwindDeg],
  );
  const onOpenChange = actions.selectLeg;
  return (
    <div>
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr
            className="text-[9px] uppercase tracking-widest"
            style={{ color: "var(--ow-fg-3)" }}
          >
            <th className="py-1 pl-3 pr-2 pt-3 text-left font-semibold">Tronçon</th>
            <th className="py-1 px-1 pt-3 text-left font-semibold">Durée</th>
            <th className="py-1 px-1 pt-3 text-left font-semibold">Allure</th>
            <th className="py-1 px-1 pt-3 text-left font-semibold">Vent (kn)</th>
            <th className="py-1 px-1 pt-3 text-left font-semibold">Mer</th>
            <th className="py-1 pl-1 pr-3 pt-3" />
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
