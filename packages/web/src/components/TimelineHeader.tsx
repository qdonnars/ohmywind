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
  /** The word in the top-left corner, the unit the whole
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

  return times.map((t) => ({
    time: t,
    icon: wmoIcon(weatherCode(t), isDayHour(t)),
    hourLabel: formatHour(t, timezoneMode),
  }));
}

/** The day tag of the header, « JEU. 3 »: the weekday keeps its
    abbreviation dot, as a column header in capitals. */
function formatDayTag(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z");
  const [weekday, dayNum] = stickyFormatters();
  return `${weekday.format(d)} ${dayNum.format(d)}`.toLocaleUpperCase(getLocale());
}

/** Consecutive columns grouped by day, for the day tags. */
interface DayGroup {
  dayIso: string;
  count: number;
}

function buildDayGroups(times: string[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let curDay = "";
  for (const t of times) {
    const day = t.slice(0, 10);
    if (day !== curDay) {
      groups.push({ dayIso: day, count: 1 });
      curDay = day;
    } else {
      groups[groups.length - 1].count++;
    }
  }
  return groups;
}

/**
 * The hours header of the three explore views (wind, sea and currents,
 * tide): one state, one mark. The current hour is named rather than filled
 * (« Maint. » in accent), the picked hour is the only bold black one, and
 * the column outline below belongs to the table, not to the header. The day
 * tag rides over the first column of its day on every screen size, sticky,
 * so the phone needs no day badge in the corner.
 */
export function TimelineHeader({
  times,
  selectedHour,
  onSelectHour,
  forecasts,
  nowHour,
  timezoneMode,
  cornerLabel,
}: TimelineHeaderProps) {
  const columns = useMemo(
    () => buildColumns(times, forecasts, timezoneMode),
    [times, forecasts, timezoneMode],
  );
  const dayGroups = useMemo(() => buildDayGroups(times), [times]);
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
              // The measured width of the sticky label column
              // (useTimelineScroll): the row labels make it wider than its
              // minimum, and the tag would slide under it.
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
