// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { memo, useEffect, useMemo, useRef } from "react";
import { beaufortLevel, windLevelVar } from "../domain/thresholds";
import { nowParisHourPrefix } from "../domain/datetime";
import { useTimezone } from "../hooks/useTimezone";
import { getLocale, t, tn, useLang, useT } from "../i18n";
import { fmtNm } from "../utils/geo";
import { formatHour } from "../utils/format";
import type { Spot } from "../types";
import {
  aggregateWaves,
  aggregateWind,
  buildTimeIndex,
  compareColumns,
  compareDays,
  nowColumnKey,
  rowKey,
  waveLevel,
  windLabel,
  type CompareColumn,
  type CompareRow,
  type HourWindow,
  type Resolution,
  type WaveAgg,
  type WindAgg,
} from "./data";

// ── Cells ────────────────────────────────────────────────────────────────────
// One cell is a stack of bands, one per quantity: the wind always, the sea
// when asked for. Each band has its own colour ramp, so they never read as
// one quantity.

function Arrow({ dir, size, color }: { dir: number; size: number; color: string }) {
  // "From" convention, like the wind table: the arrow points where it goes.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className="shrink-0"
      style={{ transform: `rotate(${dir + 180}deg)` }}
      aria-hidden="true"
    >
      <polygon points="8,1 13,15 8,10 3,15" fill={color} />
    </svg>
  );
}

interface BandProps {
  bg: string;
  ink: string;
  main: string;
  sub?: string;
  height: number;
  dense: boolean;
  arrow: number | null;
}

function Band({ bg, ink, main, sub, height, dense, arrow }: BandProps) {
  const mainSize = main.length > 4 ? (dense ? 10.5 : 12) : dense ? 12 : 13.5;
  return (
    <div
      className="flex items-center justify-center gap-[3px] tabular-nums whitespace-nowrap overflow-hidden"
      style={{ height, background: bg, color: ink, fontFamily: "var(--ow-font-mono)" }}
    >
      {arrow != null && <Arrow dir={arrow} size={dense ? 10 : 12} color={ink} />}
      <span className="font-bold leading-none" style={{ fontSize: mainSize, letterSpacing: "-0.02em" }}>
        {main}
      </span>
      {sub && (
        <span className="leading-none" style={{ fontSize: dense ? 8.5 : 9.5, opacity: 0.8 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function windAria(agg: WindAgg, res: Resolution): string {
  const wind = res === 1 || agg.lo === agg.hi ? String(agg.mid) : t("compare.cell.aria.range", { lo: agg.lo, hi: agg.hi });
  if (agg.gust != null && agg.dir != null) {
    return t("compare.cell.aria.windGustsDirection", { wind, gusts: agg.gust, direction: agg.dir });
  }
  if (agg.gust != null) return t("compare.cell.aria.windGusts", { wind, gusts: agg.gust });
  if (agg.dir != null) return t("compare.cell.aria.windDirection", { wind, direction: agg.dir });
  return t("compare.cell.aria.wind", { wind });
}

function waveAria(agg: WaveAgg): string {
  const hs = agg.hs.toFixed(1);
  const period = agg.period != null ? Math.round(agg.period) : "–";
  return agg.dir != null
    ? t("compare.cell.aria.waveFrom", { hs, dir: agg.dir, period })
    : t("compare.cell.aria.wave", { hs, period });
}

interface CellProps {
  wind: WindAgg | null;
  wave: WaveAgg | null;
  /** Whether the sea band is part of the cell at all. */
  withWave: boolean;
  res: Resolution;
  width: number;
  dense: boolean;
}

function CellImpl({ wind, wave, withWave, res, width, dense }: CellProps) {
  useLang();
  const base = dense ? 30 : 34;
  const add = dense ? 19 : 22;
  const total = base + (withWave ? add : 0);
  const windHeight = total - (withWave ? add + 1 : 0);
  const aria = [wind ? windAria(wind, res) : null, withWave && wave ? waveAria(wave) : null]
    .filter(Boolean)
    .join(". ");

  if (!wind && !(withWave && wave)) {
    return (
      <div
        role="cell"
        className="shrink-0 rounded-[5px] flex items-center justify-center text-xs"
        style={{ width, height: total, background: "var(--ow-bg-2)", color: "var(--ow-fg-3)" }}
      >
        —
      </div>
    );
  }

  const level = wind ? beaufortLevel(wind.mid) : 0;
  const wl = wave ? waveLevel(wave.hs) : 0;
  return (
    <div
      role="cell"
      className="shrink-0 rounded-[5px] overflow-hidden flex flex-col"
      style={{ width, height: total }}
      aria-label={aria}
    >
      {wind ? (
        <Band
          bg={windLevelVar(level)}
          ink={`var(--ow-cell-text-${level})`}
          main={windLabel(wind, res)}
          sub={wind.gust != null ? `(${wind.gust})` : undefined}
          height={windHeight}
          dense={dense}
          arrow={wind.dir}
        />
      ) : (
        <div style={{ height: windHeight, background: "var(--ow-bg-2)" }} />
      )}
      {withWave && (
        <>
          <div style={{ height: 1 }} />
          {wave ? (
            <Band
              bg={`var(--ow-wave-${wl})`}
              ink={wave.hs < 1.0 ? "var(--ow-fg-0)" : "var(--ow-cell-ink)"}
              main={wave.hs.toFixed(1)}
              sub={wave.period != null ? `${Math.round(wave.period)}s` : undefined}
              height={add}
              dense={dense}
              arrow={wave.dir}
            />
          ) : (
            <div style={{ height: add, background: "var(--ow-bg-2)" }} />
          )}
        </>
      )}
    </div>
  );
}

const Cell = memo(CellImpl);

// ── Header ───────────────────────────────────────────────────────────────────

const DAY_DTF = new Map<string, [Intl.DateTimeFormat, Intl.DateTimeFormat]>();
function dayFormatters(): [Intl.DateTimeFormat, Intl.DateTimeFormat] {
  const locale = getLocale();
  let pair = DAY_DTF.get(locale);
  if (!pair) {
    pair = [
      new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }),
      new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }),
    ];
    DAY_DTF.set(locale, pair);
  }
  return pair;
}

/** "SAM 6": the day band over its columns. */
function formatDayBand(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const [weekday, dayNum] = dayFormatters();
  return `${weekday.format(d).toUpperCase().replace(/\.$/, "")} ${dayNum.format(d)}`;
}

/** "6" at the finest step, "6–9" otherwise, in the clock the reader chose. */
function columnLabel(col: CompareColumn, mode: ReturnType<typeof useTimezone>[0]): string {
  const from = Number(formatHour(col.times[0], mode));
  if (col.times.length === 1) return String(from);
  const to = from + col.times.length;
  return `${from}–${to > 24 ? to - 24 : to}`;
}

// ── Table ────────────────────────────────────────────────────────────────────

/** Widths the two layouts use, by step: a range needs room a value does not. */
function cellWidthFor(res: Resolution, dense: boolean): number {
  if (dense) return res === 1 ? 42 : res === 3 ? 70 : 92;
  return res === 1 ? 50 : res === 3 ? 88 : 124;
}

interface CompareTableProps {
  rows: CompareRow[];
  res: Resolution;
  win: HourWindow;
  /** Show the sea band under the wind. */
  wave: boolean;
  /** The phone layout: tighter type and rows. */
  dense: boolean;
  nameWidth: number;
  gap: number;
  /** `rowKey` of the spot the map is centred on, if any. */
  focusedKey: string | null;
  onFocusSpot: (spot: Spot) => void;
  /** Distance from the reader, in nautical miles, by `rowKey`, when known. */
  distances?: ReadonlyMap<string, number>;
}

/**
 * The favourites side by side: one row per spot, the days following each
 * other in the horizontal scroll, the hours of the window cut by the step.
 * No ranking and no model name: the numbers and the colour scale, the
 * reader judges.
 */
export function CompareTable({
  rows,
  res,
  win,
  wave,
  dense,
  nameWidth,
  gap,
  focusedKey,
  onFocusSpot,
  distances,
}: CompareTableProps) {
  const { t } = useT();
  const [timezoneMode] = useTimezone();
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => compareDays(rows), [rows]);
  const columns = useMemo(() => compareColumns(days, res, win), [days, res, win]);
  const nowHour = nowParisHourPrefix();
  const nowKey = nowColumnKey(columns, nowHour);

  // One index per row and per series, resolved once per data change rather
  // than once per cell.
  const indexes = useMemo(
    () =>
      rows.map((row) => ({
        wind: buildTimeIndex(row.forecast?.hourly.time),
        marine: buildTimeIndex(row.marine?.time),
      })),
    [rows],
  );

  // The columns of a day, for the band over them.
  const perDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of columns) counts.set(c.day, (counts.get(c.day) ?? 0) + 1);
    return counts;
  }, [columns]);

  // Open on the current hour, with a column of the past still visible, the
  // way the wind table does. Re-done when the grid changes: the reader who
  // changes the step or the window is asking for a fresh reading.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !nowKey) return;
    const el = scroller.querySelector<HTMLElement>(`[data-col="${nowKey}"]`);
    if (!el) return;
    const cellWidth = el.offsetWidth;
    scroller.scrollTo({ left: Math.max(0, el.offsetLeft - nameWidth - gap - cellWidth), behavior: "instant" });
  }, [nowKey, columns, nameWidth, gap]);

  // A spot picked on the map is brought into view, vertically only.
  useEffect(() => {
    if (!focusedKey || !scrollRef.current) return;
    const row = scrollRef.current.querySelector<HTMLElement>(`[data-row="${focusedKey}"]`);
    row?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [focusedKey]);

  // A mouse drag pans the table, as a thumb does on a phone.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let drag: { x: number; left: number } | null = null;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, left: scroller.scrollLeft };
      scroller.classList.add("is-dragging");
    };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      scroller.scrollLeft = drag.left - (e.clientX - drag.x);
    };
    const onUp = () => {
      drag = null;
      scroller.classList.remove("is-dragging");
    };
    scroller.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      scroller.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const cellWidth = cellWidthFor(res, dense);
  const stickyLeft = { position: "sticky" as const, left: 0, background: "var(--ow-bg-1)" };

  return (
    <div
      ref={scrollRef}
      className="ow-hscroll wind-table-scroll flex-1 min-h-0 overflow-auto"
      role="table"
      aria-label={t("common.nav.compare.title")}
    >
      <div className="inline-flex flex-col min-w-full" style={{ gap, padding: "0 12px 10px 0" }}>
        {/* Day bands and hour labels, stuck to the top of the scroller. */}
        <div className="sticky top-0 z-[3]" style={{ background: "var(--ow-bg-1)", paddingBottom: 4 }}>
          <div className="flex" style={{ gap, marginBottom: 3 }}>
            <div className="shrink-0 z-[4]" style={{ ...stickyLeft, width: nameWidth }} />
            {days.map((day, di) => {
              const n = perDay.get(day) ?? 0;
              return (
                <div
                  key={day}
                  className="shrink-0"
                  style={{
                    width: n * cellWidth + (n - 1) * gap,
                    borderTop: "2px solid var(--ow-accent-line)",
                    paddingTop: 3,
                    marginRight: di === days.length - 1 ? 0 : gap,
                  }}
                >
                  {/* Stuck to the left edge of the scroller, next to the
                      names, for as long as its day is on screen. */}
                  <span
                    className="inline-block font-bold pl-0.5"
                    style={{
                      position: "sticky",
                      left: nameWidth + gap,
                      fontFamily: "var(--ow-font-mono)",
                      fontSize: dense ? 10 : 11.5,
                      color: "var(--ow-fg-1)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {formatDayBand(day)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex" style={{ gap }}>
            <div
              className="shrink-0 z-[4] flex items-end pb-0.5"
              style={{ ...stickyLeft, width: nameWidth }}
            >
              <span
                className="text-[9px] font-semibold uppercase"
                style={{ letterSpacing: "0.08em", color: "var(--ow-fg-2)" }}
              >
                {tn("compare.spots.count", rows.length)}
              </span>
            </div>
            {columns.map((col, i) => {
              const isNow = col.key === nowKey;
              return (
                <div
                  key={col.key}
                  data-col={col.key}
                  className="shrink-0 text-center"
                  style={{ width: cellWidth, marginLeft: col.first && i > 0 ? gap : 0 }}
                >
                  <div
                    className="font-semibold"
                    style={{
                      fontFamily: "var(--ow-font-mono)",
                      fontSize: dense ? 9.5 : 11,
                      color: isNow ? "var(--ow-accent)" : "var(--ow-fg-1)",
                      borderBottom: isNow ? "2px solid var(--ow-accent)" : "2px solid transparent",
                    }}
                    title={isNow ? t("compare.header.now") : undefined}
                  >
                    {columnLabel(col, timezoneMode)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {rows.map((row, r) => {
          const key = rowKey(row.spot);
          const focused = key === focusedKey;
          const { wind, marine } = indexes[r];
          const distance = distances?.get(key);
          return (
            <div key={key} data-row={key} role="row" className="flex items-stretch" style={{ gap }}>
              <button
                type="button"
                role="rowheader"
                onClick={() => onFocusSpot(row.spot)}
                aria-label={t("compare.row.focus", { name: row.spot.name })}
                title={t("compare.row.focus", { name: row.spot.name })}
                className="shrink-0 z-[2] text-left transition-colors flex flex-col justify-center"
                style={{
                  ...stickyLeft,
                  width: nameWidth,
                  paddingRight: 8,
                  paddingLeft: focused ? 6 : 0,
                  background: focused ? "var(--ow-accent-soft)" : "var(--ow-bg-1)",
                  boxShadow: focused ? "inset 3px 0 0 var(--ow-accent)" : undefined,
                }}
              >
                <div
                  className="truncate font-semibold"
                  style={{
                    fontSize: dense ? 11.5 : 13,
                    letterSpacing: "-0.01em",
                    color: focused ? "var(--ow-accent)" : "var(--ow-fg-0)",
                  }}
                >
                  {row.spot.name}
                </div>
                <div
                  className="truncate"
                  style={{ fontFamily: "var(--ow-font-mono)", fontSize: 9.5, color: "var(--ow-fg-2)", minHeight: 12 }}
                >
                  {!row.forecast
                    ? t("compare.row.noData")
                    : distance != null
                      ? distance < 1
                        ? t("explore.places.distanceUnderOne")
                        : t("explore.places.distance", { value: fmtNm(distance).replace(/ nm$/, "") })
                      : ""}
                </div>
              </button>
              {columns.map((col, i) => (
                <div key={col.key} className="flex" style={{ marginLeft: col.first && i > 0 ? gap : 0 }}>
                  <Cell
                    wind={aggregateWind(row.forecast, wind, col.times)}
                    wave={wave ? aggregateWaves(row.marine, marine, col.times) : null}
                    withWave={wave}
                    res={res}
                    width={cellWidth}
                    dense={dense}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
