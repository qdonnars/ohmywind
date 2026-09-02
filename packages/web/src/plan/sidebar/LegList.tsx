// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo } from "react";
import type { AggregatedLeg } from "../aggregateLegs";
import { aggregateLegs, buildLegSummaryCells } from "../aggregateLegs";
import { cxLevel, CX_COLORS } from "../types";
import { LegDetailCard } from "../LegDetailCard";
import type { PassageReport } from "../types";
import { planMinUpwind } from "../../config/polarConfig";
import { usePolarConfig } from "../../config/usePolarConfig";
import { usePlan } from "../session/planContext";

// ── LegList ──────────────────────────────────────────────────────────────────
// Click-to-expand list of legs. Collapsed = single natural-language summary
// line ("Tronçon 1 : 45 mn au près avec mer formée"). Expanded = a 4-block KPI
// grid (vent / mer / distance / temps) above the existing compass-and-build-up
// LegDetailCard so the user can scan or drill.

function fmtHM(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

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

function KpiBlock({
  value,
  label,
  tone,
}: {
  value: string;
  label?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className="rounded-md border px-2 py-1"
      style={{
        background: tone === "warn"
          ? "color-mix(in srgb, var(--ow-warn, #fbbf24) 14%, transparent)"
          : "var(--ow-bg-1)",
        borderColor: tone === "warn"
          ? "color-mix(in srgb, var(--ow-warn, #fbbf24) 38%, transparent)"
          : "var(--ow-line)",
      }}
    >
      <div
        className="text-[11px] font-semibold tabular-nums leading-tight break-words"
        style={{ color: "var(--ow-fg-0)", fontFamily: "var(--ow-font-mono)" }}
      >
        {value}
      </div>
      {label && (
        <div
          className="text-[9px] uppercase tracking-wider leading-tight mt-0.5 break-words"
          style={{ color: "var(--ow-fg-2)" }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

function LegRow({
  leg,
  index,
  expanded,
  onToggle,
}: {
  leg: AggregatedLeg;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cx = cxLevel((leg.tws_min + leg.tws_max) / 2);
  const summary = buildLegSummaryCells(leg);

  // KPI values shown on expand. Wind + allure are intentionally absent —
  // the collapsed row already carries them, no point repeating.
  // Compact French formatting: "1,8m (6s)" matches sailing-French copy.
  const fr1 = (n: number) => n.toFixed(1).replace(".", ",");

  const seaValue = leg.hs_avg_m == null
    ? "—"
    : leg.tp_avg_s != null
      ? `${fr1(leg.hs_avg_m)}m (${leg.tp_avg_s.toFixed(0)}s)`
      : `${fr1(leg.hs_avg_m)}m`;
  const seaLabel = leg.hs_avg_m == null
    ? "mer non observée"
    : leg.sea_direction === "face"
      ? "de face"
      : leg.sea_direction === "travers"
        ? "de travers"
        : "par l'arrière";

  // Warn tint when sea state notable. Mirrors the same Hs threshold the
  // summary line uses, so "Mer Formée" badge and warn-coloured KPI agree.
  const seaWarn = leg.hs_avg_m != null && leg.hs_avg_m > 1.25;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };
  const rowBg = expanded ? "var(--ow-bg-2)" : "transparent";

  // Each leg returns three `<tr>`s into the shared `<table>` in LegList:
  // a title row (badge + name + speed + chevron), a chip row (the four
  // summary cells), and an optional expand row (KPIs + LegDetailCard).
  // Because they're all in the same table, the colgroup defined in LegList
  // forces every leg's chip cells to live in the same column widths —
  // exactly the cross-row alignment a tableless flex/grid layout couldn't
  // give us when each LegRow had its own grid container.
  return (
    <>
      {/* Single-row leg: badge + 4 info cells + chevron. The speed
          indicator was dropped and the redundant "Tronçon X" label was
          dropped earlier — the numbered badge identifies the leg. */}
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
              style={{ background: CX_COLORS[cx], color: "#0B1D14", fontFamily: "var(--ow-font-mono)" }}
            >
              {index + 1}→{index + 2}
            </span>
            <span
              className="text-[10px] tabular-nums whitespace-nowrap"
              style={{ color: "var(--ow-fg-2)", fontFamily: "var(--ow-font-mono)" }}
            >
              {fr1(leg.distance_nm)} nm
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
          <td colSpan={6} className="px-4 pb-3">
            {/* Two KPI cells (time / sea). Wind, allure and distance all
                appear in the collapsed row above; repeating them in the
                expand was visual noise. */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <KpiBlock value={`${fmtHM(leg.start_time)} → ${fmtHM(leg.end_time)}`} label="dep → arr" />
              <KpiBlock value={seaValue} label={seaLabel} tone={seaWarn ? "warn" : "default"} />
            </div>
            <LegDetailCard leg={leg} />
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
  const legs: AggregatedLeg[] = useMemo(
    () =>
      aggregateLegs(
        passage.segments,
        waypoints,
        passage.efficiency,
        planMinUpwind(polarCfg, archetype),
      ),
    [passage.segments, passage.efficiency, waypoints, polarCfg, archetype],
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
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
