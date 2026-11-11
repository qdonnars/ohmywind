// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { memo, useCallback, useMemo, type CSSProperties, type ReactNode } from "react";
import type { MarineHourly, ModelForecast, MetricView } from "../types";
import { TimelineHeader } from "./TimelineHeader";
import { DirectionArrow } from "./DirectionArrow";
import { useTimezone } from "../hooks/useTimezone";
import { nowParisHourPrefix } from "../domain/datetime";
import { currentsLevel, tidesLevel, waveLevel, windLevelVar } from "../domain/thresholds";
import { useTimelineScroll } from "../hooks/useTimelineScroll";
import { t, useLang, useT, type Key } from "../i18n";
import { numFixed } from "../plan/format";
import { describeCurrentSource, formatGridSize, shomDistanceM } from "../domain/currentSource";
import { PanelNote } from "./PanelNote";

type MarineMetric = Exclude<MetricView, "wind">;

/**
 * The line under the currents table: which source, and the one number that
 * qualifies it. Tidal streams only for SHOM and MARC, so the wind is the
 * thing to remember they leave out; SMOC has everything folded into an 8 km
 * cell, so the grid is the thing to remember.
 */
function currentSourceNote(marine: MarineHourly): string {
  const src = describeCurrentSource(
    marine.current_source,
    marine.marc_resolution_m,
    marine.shom_nearest_km,
  );
  switch (src.kind) {
    case "marc":
      return t("explore.marineTable.currentSource.marc", { res: formatGridSize(src.resolutionM) });
    case "shom": {
      if (src.nearestKm == null) return t("explore.marineTable.currentSource.shomNoDistance");
      const m = shomDistanceM(src.nearestKm);
      return m < 50
        ? t("explore.marineTable.currentSource.shomClose")
        : t("explore.marineTable.currentSource.shom", { m: String(m) });
    }
    default:
      return t("explore.marineTable.currentSource.smoc");
  }
}

/** Why the currents of a spot are withheld, one sentence per reason. */
const UNKNOWN_NOTE = {
  managed: "explore.marineTable.unknown.managed",
  unresolved: "explore.marineTable.unknown.unresolved",
  non_tidal: "explore.marineTable.unknown.non_tidal",
  model_edge: "explore.marineTable.unknown.model_edge",
} as const;

/** The grid the currents on screen were sampled on: "8 km" for the global
    model, the atlas cell otherwise. What the tidal-gap warning names. */
function currentGridSize(marine: MarineHourly): string {
  const src = describeCurrentSource(marine.current_source, marine.marc_resolution_m, marine.shom_nearest_km);
  return src.kind === "marc" ? formatGridSize(src.resolutionM) : "8 km";
}

// One per displayed table row. ``waves`` exposes 3 (direction/height/period),
// ``currents`` 2 (speed/direction), ``tides`` 1. Each row decides its own
// display & colour rules; the timeline header is shared.
type RowKind = "hs" | "wave_dir" | "wave_period" | "tide" | "current" | "current_dir";

interface RowConfig {
  kind: RowKind;
  /** Said once, after the row's name, never in its cells. Null where the
      cells carry their own sign (degrees). */
  unit: string | null;
}

/** Row header per kind. The kind stays the data; the wording is looked up at
    render time, so a row is never stored in one language. */
const ROW_LABEL: Record<RowKind, Key> = {
  hs: "explore.marineTable.row.hs",
  wave_dir: "explore.marineTable.row.waveFrom",
  wave_period: "explore.marineTable.row.period",
  tide: "explore.marineTable.row.tide",
  current: "explore.marineTable.row.current",
  current_dir: "explore.marineTable.row.direction",
};

/** Rows painted with a colour ramp: the quantity the view is about. The
    picked hour is outlined on them, and their name is set in the bolder
    style; the rows around them are context and read quieter. */
const FILLED: ReadonlySet<RowKind> = new Set<RowKind>(["hs", "tide", "current"]);

function rowsForMetric(
  metric: MarineMetric,
  marine: MarineHourly,
): RowConfig[] {
  const tideUnit = marine.tide_height_zh_m != null ? "m ZH" : "m";
  switch (metric) {
    case "waves":
      // Where the sea comes from first, as the wind table opens on its
      // direction, then the height, then the period that only speaks when
      // it changes.
      return [
        { kind: "wave_dir", unit: null },
        { kind: "hs", unit: "m" },
        { kind: "wave_period", unit: "s" },
      ];
    case "tides":
      return [{ kind: "tide", unit: tideUnit }];
    case "currents":
      return [
        { kind: "current", unit: "kn" },
        { kind: "current_dir", unit: null },
      ];
  }
}

// Nominal cell width (a phone's), the fallback useTimelineScroll uses before
// the table is laid out.
const CELL_W = 38;

// The fill lives on an inner block rather than on the <td>: a collapsed table
// ignores border-radius on its cells. Same geometry as the wind table.
const TD_CLASS = "wind-cell p-0 align-middle cursor-pointer min-w-[38px] lg:min-w-[52px]";

/** Height of a row's cells, the filled one standing out. */
const ROW_HEIGHT: Record<RowKind, string> = {
  wave_dir: "h-[22px]",
  hs: "h-[42px] lg:h-[44px]",
  wave_period: "h-[26px]",
  tide: "h-[42px] lg:h-[44px]",
  current: "h-[42px] lg:h-[44px]",
  // Unchanged by the harmonisation, which does not cover currents: arrow and
  // bearing, as before.
  current_dir: "h-10 lg:h-14",
};

/** The direction row of the sea opens the table body, under a hairline. */
function rowTopBorder(kind: RowKind): CSSProperties | undefined {
  return kind === "wave_dir" ? { borderTop: "1px solid var(--ow-line)" } : undefined;
}

interface MarineCellProps {
  row: RowConfig;
  marine: MarineHourly;
  /** The hour this cell reads, handed back to `onSelect`. */
  time: string;
  timeIdx: number | undefined;
  /** The same series one column to the left: the tide's rising/falling
      mark, and whether the period changed and is worth printing. */
  prevValue: number | null;
  selected: boolean;
  firstCol: boolean;
  lastCol: boolean;
  /** Takes the hour rather than closing over it, so the parent can pass one
      stable function for the whole table instead of one closure per cell.
      Without that, `memo` below would miss on every render. */
  onSelect: (time: string) => void;
}

/** Rounded at the two ends of a filled row; the picked hour outlined. */
function fillShape(selected: boolean, firstCol: boolean, lastCol: boolean): CSSProperties {
  const r = 7;
  return {
    borderRadius: `${firstCol ? r : 0}px ${lastCol ? r : 0}px ${lastCol ? r : 0}px ${firstCol ? r : 0}px`,
    boxShadow: selected ? "inset 0 0 0 2px var(--ow-fg-0)" : undefined,
  };
}

function MarineCellImpl({
  row,
  marine,
  time,
  timeIdx,
  prevValue,
  selected,
  firstCol,
  lastCol,
  onSelect,
}: MarineCellProps) {
  // Subscribes the cell to the language, so a switch relabels every cell.
  useLang();
  const select = () => onSelect(time);
  const height = ROW_HEIGHT[row.kind];
  const filled = FILLED.has(row.kind);
  const td = (content: ReactNode, aria?: string) => (
    <td
      role="cell"
      className={TD_CLASS}
      style={rowTopBorder(row.kind)}
      onClick={select}
      aria-label={aria}
    >
      {content}
    </td>
  );

  const value = timeIdx == null ? null : readValue(row.kind, marine, timeIdx);
  if (value == null) {
    // A filled row keeps its band, in grey; a context row just says nothing.
    return td(
      <div
        className={`${height} w-full flex items-center justify-center text-xs ${filled ? "ow-null-cell" : ""}`}
        style={filled ? fillShape(selected, firstCol, lastCol) : { color: "var(--ow-fg-2)" }}
      >
        —
      </div>,
    );
  }

  switch (row.kind) {
    case "wave_dir": {
      // wave_direction is "from" (Open-Meteo convention, mirror of wind):
      // the arrow points where the sea goes. Arrow only, the bearing is in
      // the label.
      const dir = Math.round(value);
      return td(
        <div className={`${height} flex items-center justify-center`} style={{ color: "var(--ow-fg-1)" }}>
          <DirectionArrow deg={value} from size={12} />
        </div>,
        t("explore.marineTable.aria.waveDirection", { dir }),
      );
    }
    case "current_dir": {
      // current_direction is already "to": the arrow points where it goes.
      const dir = Math.round(value);
      return td(
        <div
          className={`${height} flex flex-col items-center justify-center leading-none gap-[1px]`}
          style={{ color: "var(--ow-fg-1)" }}
        >
          <DirectionArrow deg={value} from={false} size={14} className="lg:w-[16px] lg:h-[16px]" />
          <span className="text-[9px] lg:text-[10px] tabular-nums leading-none opacity-70">{dir}°</span>
        </div>,
        t("explore.marineTable.aria.currentDirection", { dir }),
      );
    }
    case "wave_period": {
      // The period is said when it changes, a "·" otherwise: a column of
      // 7 7 7 7 hides the hour it turns to 9. The label keeps the value
      // for a screen reader either way.
      const shown = Math.round(value);
      const same = prevValue != null && Math.round(prevValue) === shown;
      return td(
        <div
          className={`${height} flex items-center justify-center tabular-nums text-[11.5px] leading-none`}
          style={{
            color: same ? "var(--ow-fg-3)" : "var(--ow-fg-1)",
            fontWeight: same ? 400 : 600,
          }}
        >
          {same ? "·" : shown}
        </div>,
        t("explore.marineTable.aria.wavePeriod", { value: String(shown) }),
      );
    }
    case "hs": {
      const display = numFixed(value, 1);
      const dir = timeIdx != null ? marine.wave_direction_deg[timeIdx] : null;
      const aria =
        dir != null
          ? t("explore.marineTable.aria.hsFrom", { value: display, dir: Math.round(dir) })
          : t("explore.marineTable.aria.hs", { value: display });
      return td(
        <div
          className={`${height} w-full flex items-center justify-center tabular-nums text-[15px] font-bold leading-none`}
          style={{
            ...fillShape(selected, firstCol, lastCol),
            background: `var(--ow-wave-${waveLevel(value)})`,
            // The ramp is dark under a metre and light from there.
            color: value < 1 ? "var(--ow-fg-0)" : "var(--ow-cell-ink)",
          }}
        >
          {display}
        </div>,
        aria,
      );
    }
    case "current": {
      const display = numFixed(value, 1);
      const level = currentsLevel(value);
      return td(
        <div
          className={`${height} w-full flex items-center justify-center tabular-nums text-[15px] lg:text-[16px] font-bold leading-none`}
          style={{
            ...fillShape(selected, firstCol, lastCol),
            background: windLevelVar(level),
            color: `var(--ow-cell-text-${level})`,
          }}
        >
          {display}
        </div>,
        t("explore.marineTable.aria.current", { value: display }),
      );
    }
    case "tide": {
      // Prefer the ZH (chart-datum) series when MARC covers — always ≥ 0,
      // matches what nautical charts display. Fall back to MSL elsewhere.
      const useZh = marine.tide_height_zh_m != null;
      const display = useZh ? numFixed(value, 1) : (value >= 0 ? "+" : "") + numFixed(value, 1);
      let trend = 0;
      if (prevValue != null) {
        const delta = value - prevValue;
        if (delta > 0.01) trend = 1;
        else if (delta < -0.01) trend = -1;
      }
      const tideKey =
        trend > 0
          ? "explore.marineTable.aria.tideRising"
          : trend < 0
            ? "explore.marineTable.aria.tideFalling"
            : "explore.marineTable.aria.tide";
      const level = tidesLevel(Math.abs(value));
      return td(
        <div
          className={`${height} w-full flex flex-col items-center justify-center leading-none gap-[2px]`}
          style={{
            ...fillShape(selected, firstCol, lastCol),
            background: windLevelVar(level),
            color: `var(--ow-cell-text-${level})`,
          }}
        >
          <span className="text-[15px] lg:text-[16px] font-bold tabular-nums leading-none">{display}</span>
          {trend !== 0 && (
            <span className="text-[10px] lg:text-[11px] font-bold leading-none opacity-80" aria-hidden>
              {trend > 0 ? "↑" : "↓"}
            </span>
          )}
        </div>,
        t(tideKey, { value: display, unit: useZh ? "m ZH" : "m" }),
      );
    }
  }
}

/** The number a row reads at one hour, null when the source has none. */
function readValue(kind: RowKind, marine: MarineHourly, i: number): number | null {
  switch (kind) {
    case "hs":
      return marine.wave_height_m[i];
    case "wave_dir":
      return marine.wave_direction_deg[i];
    case "wave_period":
      return marine.wave_period_s[i];
    case "current":
      return marine.current_speed_kn[i];
    case "current_dir":
      return marine.current_direction_to_deg[i];
    case "tide":
      // The series the cell shows: ZH when MARC covers, MSL otherwise.
      return (marine.tide_height_zh_m ?? marine.tide_height_m)[i];
  }
}

/**
 * A 7-day marine timeline is 168 cells per row, and up to three rows, so
 * tapping one hour used to re-render 500 cells to change two. Every prop is a
 * scalar except `row` and `marine`, which the table memoises so the default
 * shallow comparison holds.
 */
const MarineCell = memo(MarineCellImpl);

/** A row's name, with its unit said once, quieter, after it. */
function RowLabel({ row }: { row: RowConfig }) {
  const { t } = useT();
  const filled = FILLED.has(row.kind);
  return (
    <td
      className="sticky left-0 z-10 pl-2 pr-2 text-left whitespace-nowrap leading-none"
      style={{
        background: "var(--ow-bg-1)",
        color: filled ? "var(--ow-fg-0)" : "var(--ow-fg-2)",
        ...rowTopBorder(row.kind),
      }}
      role="rowheader"
    >
      <span className={filled ? "text-[10.5px] lg:text-[12px] font-semibold" : "text-[10px]"}>
        {t(ROW_LABEL[row.kind])}
        {row.unit && (
          <span className="font-medium ml-[3px]" style={{ color: "var(--ow-fg-2)" }}>
            {row.unit}
          </span>
        )}
      </span>
    </td>
  );
}

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
  const { t } = useT();
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
  const { scrollRef, scrolledEnd, visibleDay } = useTimelineScroll(
    masterTimeline,
    CELL_W,
    nowHour,
  );
  // Memoised so the identity of `row` does not defeat MarineCell's memo.
  const rows = useMemo(() => rowsForMetric(metric, marine), [metric, marine]);

  // One function for the whole table, not one closure per cell.
  const selectHour = useCallback((t: string) => onSelectHour(t), [onSelectHour]);
  const lastCol = masterTimeline.length - 1;

  return (
    // Flex column down to the scroller, no percentage height: see WindTable.
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <div className={`scroll-container flex-1 min-h-0 flex flex-col ${scrolledEnd ? "scrolled-end" : ""}`}>
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto wind-table-scroll">
          <table className="border-collapse" role="table">
            <thead className="sticky top-0 z-20">
              <TimelineHeader
                variant="harmonised"
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
              {rows.map((row) => (
                <tr key={row.kind}>
                  <RowLabel row={row} />
                  {masterTimeline.map((t, i) => {
                    const idx = timeIndex.get(t);
                    const prevIdx = i > 0 ? timeIndex.get(masterTimeline[i - 1]) : undefined;
                    const prevValue = prevIdx != null ? readValue(row.kind, marine, prevIdx) : null;
                    return (
                      <MarineCell
                        key={i}
                        row={row}
                        marine={marine}
                        timeIdx={idx}
                        prevValue={prevValue}
                        selected={t === selectedHour}
                        firstCol={i === 0}
                        lastCol={i === lastCol}
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
      {metric === "currents" && marine.current_unknown && (
        <PanelNote variant="warning">
          {t(UNKNOWN_NOTE[marine.current_unknown.reason], { zone: marine.current_unknown.zone })}
        </PanelNote>
      )}
      {metric === "currents" && !marine.current_unknown && !marine.tidal_gap && <PanelNote>{currentSourceNote(marine)}</PanelNote>}
      {metric === "currents" && !marine.current_unknown && marine.tidal_gap && (
        <PanelNote variant="warning">
          {marine.tidal_gap.kind === "pass"
            ? t("explore.marineTable.tidalGap.pass", { zone: marine.tidal_gap.zone, size: currentGridSize(marine) })
            : t("explore.marineTable.tidalGap.zone", { size: currentGridSize(marine) })}
        </PanelNote>
      )}
    </div>
  );
}
