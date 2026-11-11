// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { getLocale } from "../i18n/store";
import { useMemo } from "react";
import { formatHour } from "../utils/format";
import type { ModelForecast } from "../types";
import type { TimezoneMode } from "../hooks/useTimezone";
import { useT } from "../i18n";

interface TimelineHeaderProps {
  times: string[];
  selectedHour: string | null;
  onSelectHour: (time: string) => void;
  forecasts: ModelForecast[];
  nowHour: string;
  timezoneMode: TimezoneMode;
  visibleDay: string; // ISO date "2025-04-26" of leftmost visible day
  /** Width of the sticky first column, which the tables under this header
      have to match. 56 px fits a model name; a spot name needs more. */
  firstColumnPx?: number;
  /**
   * "harmonised" is the header of the explore wind and sea tables: day tag in
   * capitals over the first column of each day, plain hours, « Maint. » in
   * accent on the current hour, the picked hour in bold. "legacy" is kept for
   * the tide chart, whose curve is drawn on fixed 36 px columns that the
   * wider harmonised cells would no longer line up with.
   */
  variant?: "legacy" | "harmonised";
  /** Harmonised only: the word in the top-left corner, the unit the whole
      table is read in (« nœuds »), said once there instead of in every cell. */
  cornerLabel?: string;
}

function wmoIcon(code: number | null, isDay: boolean): string {
  if (code == null) return "";
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code === 1) return isDay ? "🌤️" : "🌙";
  if (code === 2) return isDay ? "⛅" : "☁️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return isDay ? "🌦️" : "🌧️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code === 85 || code === 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "";
}

// Built once at module load. `toLocaleDateString` builds a formatter on every
// call, and this header formats one label per day plus one per visible day
// change, on a component that re-renders on every scroll tick.
// Keyed on the locale so a language switch gets fresh ones, once.
const STICKY_DTF = new Map<string, [Intl.DateTimeFormat, Intl.DateTimeFormat]>();
function stickyFormatters(): [Intl.DateTimeFormat, Intl.DateTimeFormat] {
  const locale = getLocale();
  let pair = STICKY_DTF.get(locale);
  if (!pair) {
    pair = [
      new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }),
      new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }),
    ];
    STICKY_DTF.set(locale, pair);
  }
  return pair;
}

function formatStickyDay(isoDate: string): [string, string] {
  if (!isoDate) return ["", ""];
  const d = new Date(isoDate + "T12:00:00Z");
  const [weekday, dayNum] = stickyFormatters();
  // French short weekdays carry a trailing dot ("jeu."): the sticky label is
  // a tag, not a sentence, so it goes.
  return [weekday.format(d).toUpperCase().replace(/\.$/, ""), dayNum.format(d)];
}

/** Everything a column needs, resolved once per timeline instead of per render.
 *
 * The two lookups this replaces were the expensive part: `weatherCode` and
 * `isDayHour` each walked `indexOf` over every model's time series, for every
 * one of the 168 columns, on every render. An index per model turns that from
 * quadratic into a map read, and the result is cached until the timeline, the
 * forecasts or the clock mode actually change. */
interface Column {
  time: string;
  icon: string;
  hourLabel: string;
  isDayStart: boolean;
}

function buildColumns(
  times: string[],
  forecasts: ModelForecast[],
  timezoneMode: TimezoneMode,
): Column[] {
  const indexes = forecasts.map((f) => {
    const m = new Map<string, number>();
    f.hourly.time.forEach((t, i) => m.set(t, i));
    return { forecast: f, index: m };
  });

  const weatherCode = (t: string): number | null => {
    for (const { forecast, index } of indexes) {
      const idx = index.get(t);
      if (idx !== undefined && forecast.hourly.weather_code?.[idx] != null) {
        return forecast.hourly.weather_code[idx];
      }
    }
    return null;
  };

  const isDayHour = (t: string): boolean => {
    for (const { forecast, index } of indexes) {
      const idx = index.get(t);
      if (idx !== undefined && forecast.hourly.is_day?.[idx] != null) {
        return forecast.hourly.is_day[idx] === 1;
      }
    }
    // Fallback when is_day is missing: treat 07:00-20:59 as day.
    const hour = parseInt(t.slice(11, 13));
    return hour >= 7 && hour < 21;
  };

  let prevDay = "";
  return times.map((t, i) => {
    const day = t.slice(0, 10);
    const isDayStart = day !== prevDay && i > 0;
    prevDay = day;
    return {
      time: t,
      icon: wmoIcon(weatherCode(t), isDayHour(t)),
      hourLabel: formatHour(t, timezoneMode),
      isDayStart,
    };
  });
}

/** The day tag of the harmonised header, « JEU. 3 »: the weekday keeps its
    abbreviation dot, as a column header in capitals. */
function formatDayTag(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z");
  const [weekday, dayNum] = stickyFormatters();
  return `${weekday.format(d)} ${dayNum.format(d)}`.toLocaleUpperCase(getLocale());
}

/** Consecutive columns grouped by day, for the desktop-only day-label row. */
interface DayGroup {
  dayIso: string;
  count: number;
  weekday: string;
  dayNum: string;
}

function buildDayGroups(times: string[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let curDay = "";
  for (const t of times) {
    const day = t.slice(0, 10);
    if (day !== curDay) {
      const [weekday, dayNum] = formatStickyDay(day);
      groups.push({ dayIso: day, count: 1, weekday, dayNum });
      curDay = day;
    } else {
      groups[groups.length - 1].count++;
    }
  }
  return groups;
}

export function TimelineHeader({
  times,
  selectedHour,
  onSelectHour,
  forecasts,
  nowHour,
  timezoneMode,
  visibleDay,
  firstColumnPx = 56,
  variant = "legacy",
  cornerLabel,
}: TimelineHeaderProps) {
  const columns = useMemo(
    () => buildColumns(times, forecasts, timezoneMode),
    [times, forecasts, timezoneMode],
  );
  const dayGroups = useMemo(() => buildDayGroups(times), [times]);

  if (variant === "harmonised") {
    return (
      <HarmonisedRows
        columns={columns}
        dayGroups={dayGroups}
        selectedHour={selectedHour}
        onSelectHour={onSelectHour}
        nowHour={nowHour}
        cornerLabel={cornerLabel}
      />
    );
  }

  const [weekday, dayNum] = formatStickyDay(visibleDay);

  return (
    <>
      {/* Row 0: per-day labels — desktop only, so mobile keeps its compact layout.
          Each label cell is sticky-left so the leftmost day stays glued to the
          left edge of the scroll viewport until the next day's cell crosses it. */}
      <tr className="hidden lg:table-row">
        <td
          className="sticky left-0 z-30 border-r border-b"
          style={{ minWidth: firstColumnPx, background: 'var(--ow-bg-1)', borderColor: 'var(--ow-line-2)' }}
        />
        {dayGroups.map((g, gi) => (
          <td
            key={g.dayIso}
            colSpan={g.count}
            className={`py-1 border-b ${gi > 0 ? 'ow-day-sep' : ''}`}
            style={{
              background: 'var(--ow-bg-1)',
              // The bottom border only: a full borderColor here would also
              // repaint the day separator's left border (.ow-day-sep).
              borderBottomColor: 'var(--ow-line-2)',
              position: 'sticky',
              // The measured width of the sticky label column
              // (useTimelineScroll): the model names make it wider than the
              // nominal 56 px, and the label slid under it (« N 12 »).
              left: `var(--ow-sticky-col, ${firstColumnPx}px)`,
              zIndex: 19,
            }}
          >
            <div className="pl-2 whitespace-nowrap">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ow-accent)' }}>
                {g.weekday}
              </span>
              <span className="ml-1 text-[11px] font-bold tabular-nums" style={{ color: 'var(--ow-fg-0)' }}>
                {g.dayNum}
              </span>
            </div>
          </td>
        ))}
      </tr>

      {/* Row 1: weather icons — sticky left spans both rows. The day badge here
          is shown on mobile only; on desktop the per-day labels in Row 0 (sticky-left)
          replace it so the date isn't written twice. */}
      <tr>
        <td
          rowSpan={2}
          className="sticky left-0 z-20 px-2 border-r border-b"
          style={{ minWidth: firstColumnPx, background: 'var(--ow-bg-1)', borderColor: 'var(--ow-line-2)' }}
        >
          <div className="lg:hidden flex flex-col items-center justify-center h-full leading-none gap-[2px]">
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--ow-accent)' }}>
              {weekday}
            </span>
            <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--ow-fg-0)' }}>
              {dayNum}
            </span>
          </div>
        </td>
        {columns.map((col, i) => (
          <td
            key={i}
            className={`text-center p-0 ow-tbl-bg cursor-pointer leading-none ${col.isDayStart ? 'ow-day-sep' : ''}`}
            style={{
              fontSize: "13px",
              lineHeight: "20px",
            }}
            onClick={() => onSelectHour(col.time)}
          >
            {col.icon}
          </td>
        ))}
      </tr>

      {/* Row 2: hour numbers — no sticky left (spanned by row above) */}
      <tr>
        {columns.map((col, i) => {
          const isNow = col.time.startsWith(nowHour);
          return (
            <th
              key={i}
              scope="col"
              className={`text-[10px] lg:text-xs font-semibold py-1 cursor-pointer transition-colors relative border-b ${col.isDayStart ? 'ow-day-sep' : ''} ${
                col.time === selectedHour
                  ? "text-on-accent bg-accent-strong"
                  : isNow
                  ? "text-on-accent-muted bg-accent-deep/70 font-bold"
                  : "ow-hour-cell"
              }`}
              style={{
                borderBottomColor: 'var(--ow-line-2)',
              }}
              onClick={() => onSelectHour(col.time)}
            >
              {col.hourLabel}
              {isNow && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
              )}
            </th>
          );
        })}
      </tr>
    </>
  );
}

interface HarmonisedRowsProps {
  columns: Column[];
  dayGroups: DayGroup[];
  selectedHour: string | null;
  onSelectHour: (time: string) => void;
  nowHour: string;
  cornerLabel?: string;
}

/**
 * The header of the explore tables after the harmonisation: one state, one
 * mark. The current hour is named rather than filled (« Maint. » in accent),
 * the picked hour is the only bold black one, and the column outline below
 * belongs to the table, not to the header. The day tag rides over the first
 * column of its day on every screen size, sticky like the desktop label it
 * replaces, so the phone no longer needs a day badge in the corner.
 */
function HarmonisedRows({
  columns,
  dayGroups,
  selectedHour,
  onSelectHour,
  nowHour,
  cornerLabel,
}: HarmonisedRowsProps) {
  const { t } = useT();
  return (
    <>
      <tr>
        <td
          rowSpan={3}
          className="sticky left-0 z-30 pl-2 pr-2 pb-1 align-bottom text-left whitespace-nowrap min-w-[54px] lg:min-w-[78px] text-[10px] leading-none"
          style={{ background: "var(--ow-bg-1)", color: "var(--ow-fg-2)" }}
        >
          {cornerLabel}
        </td>
        {dayGroups.map((g) => (
          <td
            key={g.dayIso}
            colSpan={g.count}
            className="px-0 pt-1 pb-[3px]"
            style={{
              background: "var(--ow-bg-1)",
              position: "sticky",
              // Same anchoring as the legacy day row: the measured width of
              // the sticky label column (useTimelineScroll).
              left: "var(--ow-sticky-col, 54px)",
              zIndex: 19,
            }}
          >
            <div
              className="whitespace-nowrap text-[9.5px] font-bold leading-none"
              style={{ color: "var(--ow-fg-1)", letterSpacing: "0.08em" }}
            >
              {formatDayTag(g.dayIso)}
            </div>
          </td>
        ))}
      </tr>
      <tr>
        {columns.map((col, i) => (
          <td
            key={i}
            className="text-center p-0 ow-tbl-bg cursor-pointer leading-none"
            style={{ fontSize: "13px", lineHeight: "20px" }}
            onClick={() => onSelectHour(col.time)}
          >
            {col.icon}
          </td>
        ))}
      </tr>
      <tr>
        {columns.map((col, i) => {
          const isNow = col.time.startsWith(nowHour);
          const isSelected = col.time === selectedHour;
          return (
            <th
              key={i}
              scope="col"
              aria-current={isNow ? "time" : undefined}
              className="ow-hour-cell px-0 pt-[2px] pb-1 cursor-pointer whitespace-nowrap tabular-nums text-[11px] lg:text-[12px] leading-none"
              style={{
                fontWeight: isSelected || isNow ? 700 : 500,
                color: isSelected
                  ? "var(--ow-fg-0)"
                  : isNow
                    ? "var(--ow-accent)"
                    : "var(--ow-fg-2)",
              }}
              onClick={() => onSelectHour(col.time)}
            >
              {isNow ? (
                <>
                  {t("explore.timeline.now")}
                  {/* The word replaces the hour on screen; a screen reader
                      still hears which hour it is. */}
                  <span className="sr-only"> {col.hourLabel}</span>
                </>
              ) : (
                col.hourLabel
              )}
            </th>
          );
        })}
      </tr>
    </>
  );
}
