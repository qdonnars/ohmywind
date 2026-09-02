// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { memo, useCallback, useMemo } from "react";
import type { MarineHourly, ModelForecast, MetricView } from "../types";
import { TimelineHeader } from "./TimelineHeader";
import { useTimezone } from "../hooks/useTimezone";
import { nowParisHourPrefix } from "../domain/datetime";
import { currentsLevel, tidesLevel, wavesLevel, windLevelVar } from "../domain/thresholds";
import { useTimelineScroll } from "../hooks/useTimelineScroll";
import { ArrowConventionNote } from "./ArrowConventionNote";

type MarineMetric = Exclude<MetricView, "wind">;

// One per displayed table row. ``waves`` exposes 3 (height/direction/period),
// ``currents`` 2 (speed/direction), ``tides`` 1. Each row decides its own
// display & colour rules; the timeline header is shared.
type RowKind = "hs" | "wave_dir" | "wave_period" | "tide" | "current" | "current_dir";

interface RowConfig {
  kind: RowKind;
  label: string;
  unit: string;
}

function rowsForMetric(
  metric: MarineMetric,
  marine: MarineHourly,
): RowConfig[] {
  const tideUnit = marine.tide_height_zh_m != null ? "m ZH" : "m";
  switch (metric) {
    case "waves":
      return [
        { kind: "hs", label: "Hs", unit: "m" },
        { kind: "wave_dir", label: "Dir", unit: "°" },
        { kind: "wave_period", label: "T", unit: "s" },
      ];
    case "tides":
      return [{ kind: "tide", label: "Tide", unit: tideUnit }];
    case "currents":
      return [
        { kind: "current", label: "Curr.", unit: "kn" },
        { kind: "current_dir", label: "Dir", unit: "°" },
      ];
  }
}

const CELL_W = 36;

interface MarineCellProps {
  row: RowConfig;
  marine: MarineHourly;
  /** The hour this cell reads, handed back to `onSelect`. */
  time: string;
  timeIdx: number | undefined;
  // Previous tide value at this position; powers the rising/falling indicator.
  prevTide: number | null;
  selected: boolean;
  isNow: boolean;
  isDayStart: boolean;
  /** Takes the hour rather than closing over it, so the parent can pass one
      stable function for the whole table instead of one closure per cell.
      Without that, `memo` below would miss on every render. */
  onSelect: (time: string) => void;
}

function NullCell({
  nowBorder,
  daySepClass,
  selectedStyle,
  onSelect,
}: {
  nowBorder: string;
  daySepClass: string;
  selectedStyle: string;
  onSelect: () => void;
}) {
  return (
    <td
      role="cell"
      className={`wind-cell ow-null-cell min-w-[32px] lg:min-w-[56px] h-10 lg:h-14 text-center text-xs align-middle cursor-pointer ${nowBorder} ${daySepClass} ${selectedStyle}`}
      onClick={onSelect}
    >
      —
    </td>
  );
}

function MarineCellImpl({
  row,
  marine,
  time,
  timeIdx,
  prevTide,
  selected,
  isNow,
  isDayStart,
  onSelect,
}: MarineCellProps) {
  const nowBorder = isNow ? "border-l-2 border-l-accent" : "";
  const daySepClass = !isNow && isDayStart ? "ow-day-sep" : "";
  const selectedStyle = selected ? "ring-2 ring-accent/70 ring-inset bg-accent/10" : "";
  const select = () => onSelect(time);

  if (timeIdx == null) {
    return (
      <NullCell
        nowBorder={nowBorder}
        daySepClass={daySepClass}
        selectedStyle={selectedStyle}
        onSelect={select}
      />
    );
  }

  let value: number | null = null;
  let secondary: number | null = null; // wave_dir for Hs aria, current_dir, etc.
  let level = 0;
  let display = "—";
  let aria = "";
  let trend = 0; // tides only
  let arrowDeg: number | null = null; // rotation in degrees for arrow rendering
  // For "from" conventions (wind & wave direction), an arrow showing where the
  // wave is going is direction + 180. For "to" (current), no offset.
  let arrowFlip = 0;
  let renderArrow = false;
  let degText: string | null = null;

  switch (row.kind) {
    case "hs": {
      value = marine.wave_height_m[timeIdx];
      secondary = marine.wave_direction_deg[timeIdx];
      if (value != null) {
        level = wavesLevel(value);
        display = value.toFixed(1);
        aria = `Hs ${display} m${secondary != null ? `, from ${Math.round(secondary)}°` : ""}`;
      }
      break;
    }
    case "wave_dir": {
      // wave_direction is "from" (Open-Meteo convention, mirror of wind).
      const dir = marine.wave_direction_deg[timeIdx];
      if (dir != null) {
        value = dir; // sentinel: non-null means we have data to render
        arrowDeg = dir;
        arrowFlip = 180;
        renderArrow = true;
        degText = `${Math.round(dir)}°`;
        aria = `Wave direction from ${Math.round(dir)}°`;
      }
      // Direction has no intensity ramp; level stays 0 → neutral cell.
      break;
    }
    case "current_dir": {
      // current_direction is already "to" — arrow points where the current goes.
      const dir = marine.current_direction_to_deg[timeIdx];
      if (dir != null) {
        value = dir;
        arrowDeg = dir;
        arrowFlip = 0;
        renderArrow = true;
        degText = `${Math.round(dir)}°`;
        aria = `Current setting toward ${Math.round(dir)}°`;
      }
      break;
    }
    case "wave_period": {
      value = marine.wave_period_s[timeIdx];
      if (value != null) {
        display = value.toFixed(0);
        aria = `Wave period ${display} s`;
        // No level — period is informational, see periodLevel comment.
      }
      break;
    }
    case "tide": {
      // Prefer the ZH (chart-datum) series when MARC covers — always ≥ 0,
      // matches what nautical charts display. Fall back to MSL elsewhere.
      const zh = marine.tide_height_zh_m;
      const useZh = zh != null;
      const series = useZh ? zh : marine.tide_height_m;
      value = series[timeIdx];
      if (value != null) {
        level = tidesLevel(Math.abs(value));
        display = useZh
          ? value.toFixed(1)
          : (value >= 0 ? "+" : "") + value.toFixed(1);
        if (prevTide != null) {
          const delta = value - prevTide;
          if (delta > 0.01) trend = 1;
          else if (delta < -0.01) trend = -1;
        }
        aria = `Tide ${display} m${useZh ? " ZH" : ""}${trend > 0 ? ", rising" : trend < 0 ? ", falling" : ""}`;
      }
      break;
    }
    case "current": {
      // Speed only — direction lives on its own row (current_dir) so users
      // get the same Hs/Dir split as waves.
      value = marine.current_speed_kn[timeIdx];
      if (value != null) {
        level = currentsLevel(value);
        display = value.toFixed(1);
        aria = `Current ${display} kn`;
      }
      break;
    }
  }
  // secondary is assigned per row kind above but only read by the arrow branch;
  // touched here so noUnusedLocals stays on for the rest of the file.
  void secondary;

  if (value == null) {
    return (
      <NullCell
        nowBorder={nowBorder}
        daySepClass={daySepClass}
        selectedStyle={selectedStyle}
        onSelect={select}
      />
    );
  }

  // Direction-only cell: neutral background, render only the arrow + degree.
  if (row.kind === "wave_dir" || row.kind === "current_dir") {
    return (
      <td
        role="cell"
        className={`wind-cell min-w-[32px] lg:min-w-[56px] h-10 lg:h-14 text-center align-middle p-0 cursor-pointer ${nowBorder} ${daySepClass} ${selectedStyle}`}
        style={{ background: "var(--ow-bg-1)", color: "var(--ow-fg-1)" }}
        onClick={select}
        aria-label={aria}
      >
        <div className="flex flex-col items-center justify-center leading-none gap-[1px]">
          {renderArrow && arrowDeg != null && (
            <svg
              width="14"
              height="14"
              className="lg:w-[16px] lg:h-[16px] shrink-0"
              viewBox="0 0 16 16"
              style={{
                transform: `rotate(${arrowDeg + arrowFlip}deg)`,
                transition: "transform 0.3s ease",
              }}
            >
              <polygon points="8,1 13,15 8,10 3,15" fill="currentColor" />
            </svg>
          )}
          {degText && (
            <span
              className="text-[9px] lg:text-[10px] tabular-nums leading-none opacity-70"
            >
              {degText}
            </span>
          )}
        </div>
      </td>
    );
  }

  // Period: neutral background like direction. The number is the signal.
  if (row.kind === "wave_period") {
    return (
      <td
        role="cell"
        className={`wind-cell min-w-[32px] lg:min-w-[56px] h-10 lg:h-14 text-center align-middle p-0 cursor-pointer ${nowBorder} ${daySepClass} ${selectedStyle}`}
        style={{ background: "var(--ow-bg-1)", color: "var(--ow-fg-1)" }}
        onClick={select}
        aria-label={aria}
      >
        <div className="flex flex-col items-center justify-center leading-none">
          <span className="text-[15px] lg:text-[16px] font-bold tabular-nums leading-none">
            {display}
            <span className="hidden lg:inline ml-0.5 text-[10px] font-medium opacity-60">
              {row.unit}
            </span>
          </span>
        </div>
      </td>
    );
  }

  const bg = windLevelVar(level);
  const color = `var(--ow-cell-text-${level})`;

  return (
    <td
      role="cell"
      className={`wind-cell min-w-[32px] lg:min-w-[56px] h-10 lg:h-14 text-center align-middle p-0 cursor-pointer ${nowBorder} ${daySepClass} ${selectedStyle}`}
      style={{ backgroundColor: bg, color }}
      onClick={select}
      aria-label={aria}
    >
      <div className="flex flex-col items-center justify-center leading-none gap-[2px]">
        <div className="flex items-center gap-0.5">
          {renderArrow && arrowDeg != null && (
            <svg
              width="11"
              height="11"
              className="lg:w-[14px] lg:h-[14px] shrink-0"
              viewBox="0 0 16 16"
              style={{
                transform: `rotate(${arrowDeg + arrowFlip}deg)`,
                transition: "transform 0.3s ease",
              }}
            >
              <polygon points="8,1 13,15 8,10 3,15" fill="currentColor" />
            </svg>
          )}
          <span className="text-[15px] lg:text-[16px] font-bold tabular-nums leading-none">
            {display}
            <span className="hidden lg:inline ml-0.5 text-[10px] font-medium opacity-60">
              {row.unit}
            </span>
          </span>
        </div>
        {row.kind === "tide" && trend !== 0 && (
          <span
            className="text-[10px] lg:text-[11px] font-bold leading-none opacity-80"
            aria-hidden
          >
            {trend > 0 ? "↑" : "↓"}
          </span>
        )}
      </div>
    </td>
  );
}

/**
 * A 7-day marine timeline is 168 cells per row, and up to three rows, so
 * tapping one hour used to re-render 500 cells to change two. Every prop is a
 * scalar except `row` and `marine`, which the table memoises so the default
 * shallow comparison holds.
 */
const MarineCell = memo(MarineCellImpl);

interface MarineTableProps {
  metric: MarineMetric;
  marine: MarineHourly;
  // Wind forecasts power TimelineHeader's weather icons + day grouping; reuse
  // them so the header is consistent across views.
  forecasts: ModelForecast[];
  selectedHour: string | null;
  onSelectHour: (time: string) => void;
}

export function MarineTable({
  metric,
  marine,
  forecasts,
  selectedHour,
  onSelectHour,
}: MarineTableProps) {
  const [timezoneMode] = useTimezone();

  const masterTimeline = useMemo(() => {
    // Marine is hourly natively; show every hour to match WindTable's finest
    // resolution (AROME = 1h).
    return marine.time;
  }, [marine.time]);

  const timeIndex = useMemo(() => {
    const m = new Map<string, number>();
    marine.time.forEach((t, i) => m.set(t, i));
    return m;
  }, [marine.time]);

  const nowHour = nowParisHourPrefix();
  const { scrollRef, scrolledEnd, visibleDay, dayStarts } = useTimelineScroll(
    masterTimeline,
    CELL_W,
    nowHour,
  );
  // Memoised so the identity of `row` does not defeat MarineCell's memo.
  const rows = useMemo(() => rowsForMetric(metric, marine), [metric, marine]);
  // The series powering the rising/falling indicator follows the same source
  // as the displayed cell (ZH when MARC covers, MSL otherwise). Linear shift
  // doesn't change the sign of deltas, but we keep the references consistent.
  const tideSeries = marine.tide_height_zh_m ?? marine.tide_height_m;

  // One function for the whole table, not one closure per cell.
  const selectHour = useCallback((t: string) => onSelectHour(t), [onSelectHour]);

  return (
    <div className="animate-fade-in min-h-0 flex flex-col">
      <div className={`scroll-container flex-1 min-h-0 ${scrolledEnd ? "scrolled-end" : ""}`}>
        <div ref={scrollRef} className="h-full overflow-auto wind-table-scroll">
          <table className="border-collapse" role="table">
            <thead className="sticky top-0 z-20">
              <TimelineHeader
                times={masterTimeline}
                selectedHour={selectedHour}
                onSelectHour={onSelectHour}
                forecasts={forecasts}
                nowHour={nowHour}
                timezoneMode={timezoneMode}
                visibleDay={visibleDay}
              />
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.kind} className={ri % 2 === 1 ? "model-row-alt" : ""}>
                  <td
                    className="sticky left-0 z-10 px-2 py-1 whitespace-nowrap border-r min-w-[56px]"
                    style={{
                      background: "var(--ow-bg-1)",
                      borderColor: "var(--ow-line-2)",
                    }}
                    role="rowheader"
                  >
                    <div className="flex flex-col items-center leading-none gap-[2px]">
                      <span
                        className="text-[11px] lg:text-[12px] font-bold tracking-wide"
                        style={{ color: "var(--ow-fg-0)" }}
                      >
                        {row.label}
                      </span>
                      <span
                        className="text-[8px] font-medium"
                        style={{ color: "var(--ow-fg-2)" }}
                      >
                        {row.unit}
                      </span>
                    </div>
                  </td>
                  {masterTimeline.map((t, i) => {
                    const idx = timeIndex.get(t);
                    const prevT = i > 0 ? masterTimeline[i - 1] : null;
                    const prevIdx = prevT != null ? timeIndex.get(prevT) : undefined;
                    const prevTide =
                      row.kind === "tide" && prevIdx != null
                        ? tideSeries[prevIdx]
                        : null;
                    return (
                      <MarineCell
                        key={i}
                        row={row}
                        marine={marine}
                        timeIdx={idx}
                        prevTide={prevTide}
                        selected={t === selectedHour}
                        isNow={t.startsWith(nowHour)}
                        isDayStart={dayStarts.has(t) && i > 0}
                        time={t}
                        onSelect={selectHour}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ArrowConventionNote metric={metric} />
    </div>
  );
}
