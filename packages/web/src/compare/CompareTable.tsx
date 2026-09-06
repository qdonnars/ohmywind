// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { memo, useCallback, useEffect, useMemo } from "react";
import { TimelineHeader } from "../components/TimelineHeader";
import { WindCell } from "../components/WindCell";
import { MODEL_META, type ModelName } from "../config/modelConfig";
import { saveLastSpot } from "../config/lastSpot";
import { nowParisHourPrefix } from "../domain/datetime";
import { wavesLevel, windLevelVar } from "../domain/thresholds";
import { LG_MEDIA_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { useOnline } from "../hooks/useOnline";
import { useTimelineScroll } from "../hooks/useTimelineScroll";
import { useTimezone } from "../hooks/useTimezone";
import { t, useLang, useT } from "../i18n";
import { numFixed } from "../plan/format";
import type { Spot } from "../types";
import { compareTimeline, rowKey, type CompareMetric, type CompareRow } from "./data";

// Approximate cell width (must match WindCell min-w-[36px]).
const CELL_W = 36;
// The sticky first column: a spot name and the model under it. Wider than
// the wind table's 56 px, which only has to fit "AROME".
const FIRST_COL_PHONE = 96;
const FIRST_COL_DESKTOP = 132;

function modelLabel(name: string): string {
  return MODEL_META[name as ModelName]?.label ?? name;
}

function buildTimeIndex(times: string[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  times?.forEach((time, i) => map.set(time, i));
  return map;
}

// ── Significant wave height cell ─────────────────────────────────────────────
// The marine table's Hs cell, on the compare page's own rows: height on the
// sea colour ramp, the direction the waves come from as an arrow.

interface HsCellProps {
  time: string;
  hs: number | null;
  direction: number | null;
  selected: boolean;
  isNow: boolean;
  isDayStart: boolean;
  onSelect: (time: string) => void;
}

function HsCellImpl({ time, hs, direction, selected, isNow, isDayStart, onSelect }: HsCellProps) {
  useLang();
  const nowBorder = isNow ? "border-l-2 border-l-accent" : "";
  const daySepClass = !isNow && isDayStart ? "ow-day-sep" : "";
  const selectedStyle = selected ? "ring-2 ring-accent/70 ring-inset bg-accent/10" : "";

  if (hs == null) {
    return (
      <td
        role="cell"
        className={`wind-cell ow-null-cell min-w-[32px] lg:min-w-[56px] h-10 lg:h-14 text-center text-xs align-middle cursor-pointer ${nowBorder} ${daySepClass} ${selectedStyle}`}
        onClick={() => onSelect(time)}
      >
        —
      </td>
    );
  }

  const level = wavesLevel(hs);
  const display = numFixed(hs, 1);
  const aria =
    direction != null
      ? t("explore.marineTable.aria.hsFrom", { value: display, dir: Math.round(direction) })
      : t("explore.marineTable.aria.hs", { value: display });

  return (
    <td
      role="cell"
      className={`wind-cell min-w-[32px] lg:min-w-[56px] h-10 lg:h-14 text-center align-middle p-0 cursor-pointer ${nowBorder} ${daySepClass} ${selectedStyle}`}
      style={{ backgroundColor: windLevelVar(level), color: `var(--ow-cell-text-${level})` }}
      onClick={() => onSelect(time)}
      aria-label={aria}
    >
      <div className="flex items-center justify-center gap-0.5 leading-none">
        {direction != null && (
          // "From" convention, like the wind: the arrow shows where the
          // waves go, so it is turned half a circle.
          <svg
            width="11"
            height="11"
            className="lg:w-[14px] lg:h-[14px] shrink-0"
            viewBox="0 0 16 16"
            style={{ transform: `rotate(${direction + 180}deg)`, transition: "transform 0.3s ease" }}
          >
            <polygon points="8,1 13,15 8,10 3,15" fill="currentColor" />
          </svg>
        )}
        <span className="text-[15px] lg:text-[16px] font-bold tabular-nums leading-none">
          {display}
          <span className="hidden lg:inline ml-0.5 text-[10px] font-medium opacity-60">m</span>
        </span>
      </div>
    </td>
  );
}

const HsCell = memo(HsCellImpl);

// ── Row header ───────────────────────────────────────────────────────────────

function OpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

interface RowHeaderProps {
  row: CompareRow;
  focused: boolean;
  widthPx: number;
  onFocus: (spot: Spot) => void;
}

function RowHeader({ row, focused, widthPx, onFocus }: RowHeaderProps) {
  const { t } = useT();
  const name = row.spot.name;
  return (
    <td
      role="rowheader"
      className="sticky left-0 z-10 px-1.5 py-1 border-r"
      style={{
        minWidth: widthPx,
        maxWidth: widthPx,
        background: focused ? "var(--ow-accent-soft)" : "var(--ow-bg-1)",
        borderColor: "var(--ow-line-2)",
        boxShadow: focused ? "inset 3px 0 0 var(--ow-accent)" : undefined,
      }}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onFocus(row.spot)}
          aria-label={t("compare.row.focus", { name })}
          title={t("compare.row.focus", { name })}
          className="flex-1 min-w-0 text-left leading-tight"
        >
          <span
            className="block truncate text-[12px] lg:text-[13px] font-bold"
            style={{ color: focused ? "var(--ow-accent)" : "var(--ow-fg-0)" }}
          >
            {name}
          </span>
          <span className="block truncate text-[9px] lg:text-[10px] font-medium" style={{ color: "var(--ow-fg-2)" }}>
            {row.forecast ? modelLabel(row.forecast.modelName) : t("compare.row.noData")}
          </span>
        </button>
        {/* The explore page resumes on the last spot looked at: writing
            this one there is all it takes for the link to open it. */}
        <a
          href="/"
          onClick={() => saveLastSpot(row.spot)}
          aria-label={t("compare.row.open", { name })}
          title={t("compare.row.open", { name })}
          className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-surface-2"
          style={{ color: "var(--ow-fg-1)" }}
        >
          <OpenIcon />
        </a>
      </div>
    </td>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

function SkeletonTable({ rows }: { rows: number }) {
  return (
    <div className="px-3 py-4 space-y-3 animate-fade-in">
      <div className="flex gap-2 items-center">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-4 flex-1 max-w-[200px]" />
      </div>
      {Array.from({ length: Math.max(1, rows) }).map((_, i) => (
        <div key={i} className="flex gap-1">
          <div className="skeleton h-10 w-24 shrink-0" />
          {Array.from({ length: 10 }).map((_, j) => (
            <div key={j} className="skeleton h-10 w-9 shrink-0" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** No spot answered. The browser knows whether the network is the reason. */
function EmptyForecast() {
  const online = useOnline();
  const { t } = useT();
  return (
    <div className="text-center py-8 px-4 text-sm" style={{ color: "var(--ow-fg-2)" }}>
      {online ? t("compare.table.empty") : t("compare.table.offline")}
    </div>
  );
}

interface CompareTableProps {
  rows: CompareRow[];
  isLoading: boolean;
  metric: CompareMetric;
  selectedHour: string | null;
  onSelectHour: (time: string) => void;
  /** `rowKey` of the spot the map is centred on, if any. */
  focusedKey: string | null;
  onFocusSpot: (spot: Spot) => void;
}

/**
 * The favourites side by side: one row per spot on the hourly axis the wind
 * table uses, so a reader who knows one table knows the other. Wind by
 * default, the sea when the pills offer it.
 */
export function CompareTable({
  rows,
  isLoading,
  metric,
  selectedHour,
  onSelectHour,
  focusedKey,
  onFocusSpot,
}: CompareTableProps) {
  const [timezoneMode] = useTimezone();
  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  const firstColumnPx = isDesktop ? FIRST_COL_DESKTOP : FIRST_COL_PHONE;

  const masterTimeline = useMemo(() => compareTimeline(rows), [rows]);
  const nowHour = nowParisHourPrefix();
  const { scrollRef, scrolledEnd, visibleDay, dayStarts } = useTimelineScroll(
    masterTimeline,
    CELL_W,
    nowHour,
  );

  // One index per row and per series, resolved once per data change rather
  // than once per cell: 168 columns times the favourites adds up.
  const indexes = useMemo(
    () =>
      rows.map((row) => ({
        wind: buildTimeIndex(row.forecast?.hourly.time),
        marine: buildTimeIndex(row.marine?.time),
      })),
    [rows],
  );

  const selectHour = useCallback((time: string) => onSelectHour(time), [onSelectHour]);

  // A spot picked on the map is brought into view in the table, and only
  // vertically: the hour being read must stay where it is.
  useEffect(() => {
    if (!focusedKey || !scrollRef.current) return;
    const tr = scrollRef.current.querySelector<HTMLElement>(`tr[data-row="${focusedKey}"]`);
    tr?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [focusedKey, scrollRef]);

  if (isLoading) return <SkeletonTable rows={rows.length} />;
  if (masterTimeline.length === 0) return <EmptyForecast />;

  return (
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <div className={`scroll-container flex-1 min-h-0 flex flex-col ${scrolledEnd ? "scrolled-end" : ""}`}>
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto wind-table-scroll">
          <table className="border-collapse" role="table">
            <thead className="sticky top-0 z-20">
              {/* No weather icons: they would be one spot's sky over every
                  row, and the header cannot show several. */}
              <TimelineHeader
                times={masterTimeline}
                selectedHour={selectedHour}
                onSelectHour={onSelectHour}
                forecasts={[]}
                nowHour={nowHour}
                timezoneMode={timezoneMode}
                visibleDay={visibleDay}
                firstColumnPx={firstColumnPx}
              />
            </thead>
            <tbody>
              {rows.map((row, r) => {
                const key = rowKey(row.spot);
                const { wind, marine } = indexes[r];
                return (
                  <tr key={key} data-row={key} className={r % 2 === 1 ? "model-row-alt" : ""}>
                    <RowHeader
                      row={row}
                      focused={key === focusedKey}
                      widthPx={firstColumnPx}
                      onFocus={onFocusSpot}
                    />
                    {masterTimeline.map((time, i) => {
                      const selected = time === selectedHour;
                      const isNow = time.startsWith(nowHour);
                      const isDayStart = dayStarts.has(time) && i > 0;
                      if (metric === "waves") {
                        const idx = marine.get(time);
                        return (
                          <HsCell
                            key={i}
                            time={time}
                            hs={idx != null ? (row.marine?.wave_height_m[idx] ?? null) : null}
                            direction={idx != null ? (row.marine?.wave_direction_deg[idx] ?? null) : null}
                            selected={selected}
                            isNow={isNow}
                            isDayStart={isDayStart}
                            onSelect={selectHour}
                          />
                        );
                      }
                      const idx = wind.get(time);
                      const hourly = row.forecast?.hourly;
                      return (
                        <WindCell
                          key={i}
                          time={time}
                          speed={idx != null ? (hourly?.wind_speed_10m[idx] ?? null) : null}
                          gusts={idx != null ? (hourly?.wind_gusts_10m[idx] ?? null) : null}
                          direction={idx != null ? (hourly?.wind_direction_10m[idx] ?? null) : null}
                          selected={selected}
                          isNow={isNow}
                          isDayStart={isDayStart}
                          onSelect={selectHour}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
