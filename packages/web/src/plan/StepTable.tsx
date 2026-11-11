// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The steps of an open leg side by side, one column each.
 *
 * The « detail » of a leg used to be one step at a time, reached with the
 * arrows of the card: to see when the wind filled in, the reader walked
 * five cards and remembered four. Here the five are one table, read like
 * the forecast tables of the explore page (direction, wind over gust on
 * its Beaufort tint, sea on its own ramp, current, speed), and a tap on a
 * column opens that step in the card below.
 *
 * The units are in the row labels, once. A row that has nothing to say on
 * any step is not drawn: the sea without sea data, the current when no step
 * carries one worth reporting (same rule as the card).
 */

import { useEffect, useRef } from "react";
import type { AggregatedLeg } from "./aggregateLegs";
import { buildLegSummaryCells } from "./aggregateLegs";
import { waveLevel } from "../compare/data";
import { CellAlert } from "../components/AlertChip";
import { FlowArrow } from "../components/FlowArrow";
import {
  CURRENT_RELEVANCE_THRESHOLD_KN,
  beaufortLevel,
  windSoftVar,
  windTextVar,
} from "../domain/thresholds";
import { fmtClock } from "../domain/datetime";
import { num1 } from "./format";
import { useT } from "../i18n";

/** Width of a step's column. Five of them and the labels fit the panel;
    past that the table scrolls sideways under its sticky labels. */
const COL_PX = 56;
const ACCENT = "var(--ow-accent)";

/** The ends of a row of fills are rounded, the cells between are flush. */
function endRadius(i: number, n: number): string {
  if (n === 1) return "7px";
  if (i === 0) return "7px 0 0 7px";
  if (i === n - 1) return "0 7px 7px 0";
  return "0";
}

/** The picked column is ringed in accent over its two fills: the sides, the
    top of the wind and the bottom of the sea. */
function ring(edge: "top" | "bottom"): string {
  const cap = edge === "top" ? "inset 0 2px 0" : "inset 0 -2px 0";
  return `inset 2px 0 0 ${ACCENT}, inset -2px 0 0 ${ACCENT}, ${cap} ${ACCENT}`;
}

function Unit({ children }: { children: string }) {
  return (
    <span className="font-medium" style={{ color: "var(--ow-fg-2)" }}>
      {children}
    </span>
  );
}

/** A row's label, in the column that stays put when the table scrolls. It
    takes the background of the open leg it sits in, or the figures would
    show through it. */
function RowLabel({
  strong = false,
  unit,
  children,
  className = "",
}: {
  strong?: boolean;
  unit?: string;
  children?: string;
  className?: string;
}) {
  return (
    <div
      role="rowheader"
      className={`sticky left-0 z-[2] self-stretch flex items-center pr-2 whitespace-nowrap ${
        strong ? "text-[11.5px] font-semibold" : "text-[10.5px]"
      } ${className}`}
      style={{ background: "var(--ow-bg-2)", color: strong ? "var(--ow-fg-0)" : "var(--ow-fg-1)" }}
    >
      {children}
      {unit && <>{" "}<Unit>{unit}</Unit></>}
    </div>
  );
}

export function StepTable({
  steps,
  selected,
  onSelect,
}: {
  steps: AggregatedLeg[];
  /** Index of the step open in the card below. */
  selected: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useT();
  const n = steps.length;
  const flags = steps.map((s) => {
    const cells = buildLegSummaryCells(s);
    return cells.alert ?? cells.flag;
  });
  const hasSea = steps.some((s) => s.hs_avg_m != null);
  const hasCurrent = steps.some(
    (s) => (s.current_speed_kn ?? 0) >= CURRENT_RELEVANCE_THRESHOLD_KN || s.current_unknown,
  );

  // The arrows of the card move the selection too: past the fifth step the
  // picked column may be off screen, so it is brought back, sideways only.
  // Guarded because jsdom has no scrollIntoView.
  const pickedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    pickedRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected]);

  const pick = (i: number) => () => onSelect(i);

  return (
    // `contain: inline-size`: the table sits in a cell of the legs table,
    // which grows to its widest content. Ten steps would have widened the
    // whole panel (#385); contained, they scroll inside it instead.
    <div className="overflow-x-auto -mx-4 px-4" style={{ contain: "inline-size", scrollbarWidth: "thin" }}>
      <div
        role="table"
        aria-label={t("plan.steps.table.label")}
        className="grid items-center w-max tabular-nums"
        style={{ gridTemplateColumns: `minmax(52px, max-content) repeat(${n}, ${COL_PX}px)` }}
      >
        {/* Start time of each step: the control that picks it. The label is
            22 px high; its hit area runs down over the direction row, so
            the finger gets 46 px without the table growing by a line. */}
        <div role="row" className="contents">
          <RowLabel />
          {steps.map((s, i) => {
            const active = i === selected;
            return (
              <div key={i} role="columnheader" className="flex">
                <button
                  ref={active ? pickedRef : undefined}
                  type="button"
                  aria-pressed={active}
                  aria-label={t("plan.steps.stepLabel", {
                    index: i + 1,
                    total: n,
                    time: fmtClock(s.start_time),
                  })}
                  onClick={pick(i)}
                  className="relative z-[1] w-full text-[11.5px] after:absolute after:inset-x-0 after:top-0 after:-bottom-6 after:content-['']"
                  style={{
                    height: 22,
                    fontWeight: active ? 700 : 600,
                    color: active ? ACCENT : "var(--ow-fg-1)",
                    borderBottom: `2px solid ${active ? ACCENT : "transparent"}`,
                  }}
                >
                  {fmtClock(s.start_time)}
                </button>
              </div>
            );
          })}
        </div>

        <div role="row" className="contents">
          <RowLabel>{t("plan.steps.table.direction")}</RowLabel>
          {steps.map((s, i) => (
            <div
              key={i}
              role="cell"
              aria-label={`${Math.round(s.twd_avg_deg)}°`}
              className="flex items-center justify-center"
              style={{ height: 24 }}
            >
              <FlowArrow toDeg={s.twd_avg_deg + 180} />
            </div>
          ))}
        </div>

        <div role="row" className="contents">
          <RowLabel strong unit="kn">{t("panel.legDetail.rowWind")}</RowLabel>
          {steps.map((s, i) => {
            const level = beaufortLevel(s.tws_avg_kn);
            return (
              <div
                key={i}
                role="cell"
                onClick={pick(i)}
                className="relative flex flex-col items-center justify-center gap-0.5 leading-none cursor-pointer"
                style={{
                  height: 40,
                  background: windSoftVar(level),
                  color: windTextVar(level),
                  borderRadius: endRadius(i, n),
                  boxShadow: i === selected ? ring("top") : "none",
                }}
              >
                <span className="text-[15px] font-bold">{Math.round(s.tws_avg_kn)}</span>
                {s.gust_max_kn != null && (
                  <span className="text-[10px] font-semibold opacity-70">
                    ↑{Math.round(s.gust_max_kn)}
                  </span>
                )}
                {!hasSea && flags[i] && <CellAlert label={flags[i]} />}
              </div>
            );
          })}
        </div>

        {hasSea && (
          <div role="row" className="contents">
            <RowLabel strong unit="m" className="mt-[3px]">{t("panel.legDetail.rowSea")}</RowLabel>
            {steps.map((s, i) => {
              const hs = s.hs_avg_m;
              return (
                <div
                  key={i}
                  role="cell"
                  onClick={pick(i)}
                  className="relative mt-[3px] flex items-center justify-center text-[13.5px] font-bold cursor-pointer"
                  style={{
                    height: 30,
                    background: hs != null ? `var(--ow-wave-${waveLevel(hs)})` : "var(--ow-bg-1)",
                    color: hs == null ? "var(--ow-fg-2)" : hs < 1 ? "var(--ow-fg-0)" : "var(--ow-cell-ink)",
                    borderRadius: endRadius(i, n),
                    boxShadow: i === selected ? ring("bottom") : "none",
                  }}
                >
                  {hs != null ? num1(hs) : "—"}
                  {flags[i] && <CellAlert label={flags[i]} />}
                </div>
              );
            })}
          </div>
        )}

        {hasCurrent && (
          <div role="row" className="contents">
            <RowLabel unit="kn" className="mt-1">{t("panel.legDetail.rowCurrent")}</RowLabel>
            {steps.map((s, i) => {
              const speed = s.current_speed_kn;
              const shown = speed != null && speed >= CURRENT_RELEVANCE_THRESHOLD_KN;
              return (
                <div
                  key={i}
                  role="cell"
                  className="mt-1 flex items-center justify-center gap-[3px] text-[11.5px] font-semibold"
                  style={{ height: 24, color: shown ? "var(--ow-current)" : "var(--ow-fg-3)" }}
                  title={speed == null && s.current_unknown ? t("panel.legDetail.currentUnknown") : undefined}
                >
                  {shown && s.current_direction_to_deg != null && (
                    <FlowArrow toDeg={s.current_direction_to_deg} size={10} color="var(--ow-current)" />
                  )}
                  {speed != null ? num1(speed) : s.current_unknown ? "?" : "·"}
                </div>
              );
            })}
          </div>
        )}

        <div role="row" className="contents">
          <RowLabel unit="kn" className="mt-0.5 border-t border-[var(--ow-line)]">
            {t("panel.legDetail.rowSpeed")}
          </RowLabel>
          {steps.map((s, i) => (
            <div
              key={i}
              role="cell"
              className="mt-0.5 flex items-center justify-center text-[13px] font-bold border-t border-[var(--ow-line)]"
              style={{ height: 26, color: ACCENT }}
            >
              {num1(s.target_speed_kn)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
