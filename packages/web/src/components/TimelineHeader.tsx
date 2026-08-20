// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { formatHour } from "../utils/format";
import type { ModelForecast } from "../types";
import type { TimezoneMode } from "../hooks/useTimezone";


interface TimelineHeaderProps {
  times: string[];
  selectedHour: string | null;
  onSelectHour: (time: string) => void;
  forecasts: ModelForecast[];
  nowHour: string;
  timezoneMode: TimezoneMode;
  visibleDay: string; // ISO date "2025-04-26" of leftmost visible day
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

function formatStickyDay(isoDate: string): [string, string] {
  if (!isoDate) return ["", ""];
  const d = new Date(isoDate + "T12:00:00Z");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase();
  const day = d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
  return [weekday, day];
}

export function TimelineHeader({
  times,
  selectedHour,
  onSelectHour,
  forecasts,
  nowHour,
  timezoneMode,
  visibleDay,
}: TimelineHeaderProps) {
  function weatherCode(timeStr: string): number | null {
    for (const f of forecasts) {
      const idx = f.hourly.time.indexOf(timeStr);
      if (idx !== -1 && f.hourly.weather_code?.[idx] != null) {
        return f.hourly.weather_code[idx];
      }
    }
    return null;
  }

  function isDayHour(timeStr: string): boolean {
    for (const f of forecasts) {
      const idx = f.hourly.time.indexOf(timeStr);
      if (idx !== -1 && f.hourly.is_day?.[idx] != null) {
        return f.hourly.is_day[idx] === 1;
      }
    }
    // Fallback when is_day is missing: treat 07:00–20:59 as day.
    const hour = parseInt(timeStr.slice(11, 13));
    return hour >= 7 && hour < 21;
  }

  // Mark the first column of each new day for subtle separators
  const dayStarts = new Set<string>();
  let prevDay = "";
  for (const t of times) {
    const day = t.slice(0, 10);
    if (day !== prevDay) { dayStarts.add(t); prevDay = day; }
  }

  // Group consecutive hours by day for the desktop-only day-label row.
  type DayGroup = { dayIso: string; count: number; weekday: string; dayNum: string };
  const dayGroupsArr: DayGroup[] = [];
  {
    let curDay = "";
    for (const t of times) {
      const day = t.slice(0, 10);
      if (day !== curDay) {
        const [w, d] = formatStickyDay(day);
        dayGroupsArr.push({ dayIso: day, count: 1, weekday: w, dayNum: d });
        curDay = day;
      } else {
        dayGroupsArr[dayGroupsArr.length - 1].count++;
      }
    }
  }

  const [weekday, dayNum] = formatStickyDay(visibleDay);

  return (
    <>
      {/* Row 0: per-day labels — desktop only, so mobile keeps its compact layout.
          Each label cell is sticky-left so the leftmost day stays glued to the
          left edge of the scroll viewport until the next day's cell crosses it. */}
      <tr className="hidden lg:table-row">
        <td
          className="sticky left-0 z-30 min-w-[56px] border-r border-b"
          style={{ background: 'var(--ow-bg-1)', borderColor: 'var(--ow-line-2)' }}
        />
        {dayGroupsArr.map((g, gi) => (
          <td
            key={g.dayIso}
            colSpan={g.count}
            className={`py-1 border-b ${gi > 0 ? 'ow-day-sep' : ''}`}
            style={{
              background: 'var(--ow-bg-1)',
              borderColor: 'var(--ow-line-2)',
              position: 'sticky',
              left: 56,
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
          className="sticky left-0 z-20 min-w-[56px] px-2 border-r border-b"
          style={{ background: 'var(--ow-bg-1)', borderColor: 'var(--ow-line-2)' }}
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
        {times.map((t, i) => {
          const isStart = dayStarts.has(t) && i > 0;
          return (
            <td
              key={i}
              className={`text-center p-0 ow-tbl-bg cursor-pointer leading-none ${isStart ? 'ow-day-sep' : ''}`}
              style={{
                fontSize: "13px",
                lineHeight: "20px",
              }}
              onClick={() => onSelectHour(t)}
            >
              {wmoIcon(weatherCode(t), isDayHour(t))}
            </td>
          );
        })}
      </tr>

      {/* Row 2: hour numbers — no sticky left (spanned by row above) */}
      <tr>
        {times.map((t, i) => {
          const isNow = t.startsWith(nowHour);
          const isDayStart = dayStarts.has(t) && i > 0;
          return (
            <th
              key={i}
              scope="col"
              className={`text-[10px] lg:text-xs font-semibold py-1 cursor-pointer transition-colors relative border-b ${isDayStart ? 'ow-day-sep' : ''} ${
                t === selectedHour
                  ? "text-white bg-teal-600"
                  : isNow
                  ? "text-teal-100 bg-teal-700/70 font-bold"
                  : "ow-hour-cell"
              }`}
              style={{
                borderColor: 'var(--ow-line-2)',
              }}
              onClick={() => onSelectHour(t)}
            >
              {formatHour(t, timezoneMode)}
              {isNow && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-teal-400" />
              )}
            </th>
          );
        })}
      </tr>
    </>
  );
}
