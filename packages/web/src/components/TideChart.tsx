import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { MarineHourly, ModelForecast } from "../types";
import { TimelineHeader } from "./TimelineHeader";
import { useTimezone } from "../hooks/useTimezone";
import { nowParisHourPrefix, formatHour } from "../utils/format";

// Fixed cell width for the chart so the SVG aligns perfectly with the timeline
// header. 36 px shows ~30 hours per viewport on a typical mobile (good for
// reading tidal cycles which span ~12h). Desktop gets the same density rather
// than wider cells — a tide chart is more legible compact than spread out.
const CELL_W = 36;
const STICKY_W = 56;

const SVG_HEIGHT = 110;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;

interface Extremum {
  idx: number;
  type: "high" | "low";
}

function findExtrema(values: (number | null)[]): Extremum[] {
  const out: Extremum[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const a = values[i - 1];
    const b = values[i];
    const c = values[i + 1];
    if (a == null || b == null || c == null) continue;
    // Use ≥ on one side to break ties on flat plateaus (rare but possible).
    if (b > a && b >= c) out.push({ idx: i, type: "high" });
    else if (b < a && b <= c) out.push({ idx: i, type: "low" });
  }
  return out;
}

interface TideChartProps {
  marine: MarineHourly;
  // Wind forecasts power TimelineHeader's weather icons + day grouping; reuse
  // them so the header is consistent with the other views.
  forecasts: ModelForecast[];
  selectedHour: string | null;
  onSelectHour: (time: string) => void;
}

export function TideChart({
  marine,
  forecasts,
  selectedHour,
  onSelectHour,
}: TideChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [visibleDay, setVisibleDay] = useState("");
  const [timezoneMode] = useTimezone();

  const masterTimeline = useMemo(() => marine.time, [marine.time]);

  const dayStarts = useMemo(() => {
    const set = new Set<string>();
    let prev = "";
    for (const t of masterTimeline) {
      const day = t.slice(0, 10);
      if (day !== prev) {
        set.add(t);
        prev = day;
      }
    }
    return set;
  }, [masterTimeline]);

  const nowHour = nowParisHourPrefix();

  const updateVisibleDay = useCallback(() => {
    const el = scrollRef.current;
    if (!el || masterTimeline.length === 0) return;
    const leftmostIdx = Math.max(0, Math.floor(el.scrollLeft / CELL_W));
    const t = masterTimeline[Math.min(leftmostIdx, masterTimeline.length - 1)];
    if (t) setVisibleDay(t.slice(0, 10));
  }, [masterTimeline]);

  const checkScrollEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
    setScrolledEnd(atEnd);
    updateVisibleDay();
  }, [updateVisibleDay]);

  useEffect(() => {
    if (!scrollRef.current || masterTimeline.length === 0) return;
    const idx = masterTimeline.findIndex((t) => t.startsWith(nowHour));
    const nearestIdx =
      idx >= 0 ? idx : masterTimeline.findIndex((t) => t > nowHour.slice(0, 13));
    if (nearestIdx > 0) {
      scrollRef.current.scrollLeft = Math.max(0, nearestIdx * CELL_W - 60);
    }
    checkScrollEnd();
  }, [masterTimeline, nowHour, checkScrollEnd]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScrollEnd, { passive: true });
    return () => el.removeEventListener("scroll", checkScrollEnd);
  }, [checkScrollEnd]);

  // Tide curve geometry. Prefer the chart-datum (ZH) series when MARC covers
  // the spot — that's what nautical charts and SHOM annuals display, and it's
  // always ≥ 0 so users don't see negative heights at low tide.
  const useZh = marine.tide_height_zh_m != null;
  const tides = useZh ? (marine.tide_height_zh_m as (number | null)[]) : marine.tide_height_m;
  const refLabel = useZh ? "ZH" : "MSL";
  const unitLabel = useZh ? "m ZH" : "m";
  const valid = tides.filter((v): v is number => v != null);
  const hasData = valid.length >= 2;
  const tideMin = hasData ? Math.min(...valid) : -1;
  const tideMax = hasData ? Math.max(...valid) : 1;
  // Clamp range so a totally flat tide line still renders inside the band.
  const range = Math.max(0.05, tideMax - tideMin);

  const xForIdx = (i: number) => i * CELL_W + CELL_W / 2;
  const yForTide = (h: number) =>
    PAD_TOP + (1 - (h - tideMin) / range) * (SVG_HEIGHT - PAD_TOP - PAD_BOTTOM);

  // Linear path through every hour. At hourly resolution the natural ~12h
  // tidal period is sampled densely enough that straight segments read smooth.
  let pathLine = "";
  const pathPoints: [number, number][] = [];
  let started = false;
  for (let i = 0; i < tides.length; i++) {
    const h = tides[i];
    if (h == null) continue;
    const x = xForIdx(i);
    const y = yForTide(h);
    pathPoints.push([x, y]);
    pathLine += started ? ` L ${x},${y}` : `M ${x},${y}`;
    started = true;
  }

  // Filled "water" area below the curve, closed at the bottom.
  const fillPath =
    pathPoints.length >= 2
      ? `${pathLine} L ${pathPoints[pathPoints.length - 1][0]},${SVG_HEIGHT - PAD_BOTTOM + 4} L ${pathPoints[0][0]},${SVG_HEIGHT - PAD_BOTTOM + 4} Z`
      : "";

  const extrema = useMemo(() => findExtrema(tides), [tides]);

  const svgWidth = masterTimeline.length * CELL_W;

  // Index of the "now" cell (or -1) for the vertical guide line.
  const nowIdx = masterTimeline.findIndex((t) => t.startsWith(nowHour));
  const selectedIdx = selectedHour ? masterTimeline.indexOf(selectedHour) : -1;

  return (
    <div className="animate-fade-in">
      <div className={`scroll-container ${scrolledEnd ? "scrolled-end" : ""}`}>
        <div ref={scrollRef} className="overflow-x-auto wind-table-scroll">
          <table className="border-collapse" role="table">
            <colgroup>
              <col style={{ width: STICKY_W }} />
              {masterTimeline.map((_, i) => (
                <col key={i} style={{ width: CELL_W }} />
              ))}
            </colgroup>
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
              <tr>
                <td
                  className="sticky left-0 z-10 px-2 whitespace-nowrap border-r"
                  style={{
                    background: "var(--ow-bg-1)",
                    borderColor: "var(--ow-line-2)",
                    height: SVG_HEIGHT,
                  }}
                  role="rowheader"
                >
                  <div className="flex flex-col items-center justify-center leading-none gap-[2px] h-full">
                    <span
                      className="text-[11px] lg:text-[12px] font-bold tracking-wide"
                      style={{ color: "var(--ow-fg-0)" }}
                    >
                      Tide
                    </span>
                    <span
                      className="text-[8px] font-medium"
                      style={{ color: "var(--ow-fg-2)" }}
                    >
                      {unitLabel}
                    </span>
                  </div>
                </td>
                <td
                  colSpan={masterTimeline.length}
                  className="p-0 align-bottom"
                  style={{ height: SVG_HEIGHT }}
                >
                  <svg
                    width={svgWidth}
                    height={SVG_HEIGHT}
                    style={{ display: "block" }}
                    role="img"
                    aria-label="Courbe de marée"
                  >
                    <defs>
                      <linearGradient id="tide-water" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--ow-accent)"
                          stopOpacity="0.35"
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--ow-accent)"
                          stopOpacity="0.04"
                        />
                      </linearGradient>
                    </defs>

                    {/* Day separators — thin vertical lines at each day boundary. */}
                    {masterTimeline.map((t, i) =>
                      i > 0 && dayStarts.has(t) ? (
                        <line
                          key={`day-${i}`}
                          x1={i * CELL_W}
                          y1={0}
                          x2={i * CELL_W}
                          y2={SVG_HEIGHT}
                          stroke="var(--ow-line)"
                          strokeWidth={1}
                          opacity={0.6}
                        />
                      ) : null,
                    )}

                    {/* Reference line (zero of the dataset). In ZH mode this is
                        chart datum / lowest astronomical tide; in MSL mode it's
                        mean sea level. Drawn only when 0 is inside the displayed
                        range. */}
                    {tideMin <= 0 && tideMax >= 0 && (
                      <>
                        <line
                          x1={0}
                          y1={yForTide(0)}
                          x2={svgWidth}
                          y2={yForTide(0)}
                          stroke="var(--ow-fg-3)"
                          strokeWidth={1}
                          strokeDasharray="3 3"
                          opacity={0.4}
                        />
                        <text
                          x={4}
                          y={yForTide(0) - 3}
                          fontSize="9"
                          fill="var(--ow-fg-2)"
                          opacity={0.7}
                          style={{
                            paintOrder: "stroke",
                            stroke: "var(--ow-bg-0)",
                            strokeWidth: 3,
                            strokeLinejoin: "round",
                          }}
                        >
                          {refLabel}
                        </text>
                      </>
                    )}

                    {hasData && (
                      <>
                        <path d={fillPath} fill="url(#tide-water)" stroke="none" />
                        <path
                          d={pathLine}
                          stroke="var(--ow-accent)"
                          strokeWidth={2}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    )}

                    {/* "Now" indicator — vertical teal line. */}
                    {nowIdx >= 0 && (
                      <line
                        x1={xForIdx(nowIdx)}
                        y1={0}
                        x2={xForIdx(nowIdx)}
                        y2={SVG_HEIGHT}
                        stroke="var(--ow-accent)"
                        strokeWidth={1.5}
                        opacity={0.5}
                      />
                    )}

                    {/* Selected-hour marker — emphasised vertical line + dot
                        + value label. Label flips to the left of the dot when
                        the selection is within 4 cells of the right edge so
                        the text doesn't get clipped at the SVG boundary. */}
                    {selectedIdx >= 0 && tides[selectedIdx] != null && (
                      (() => {
                        const sx = xForIdx(selectedIdx);
                        const sh = tides[selectedIdx] as number;
                        const sy = yForTide(sh);
                        const onRight = selectedIdx <= tides.length - 4;
                        const labelX = onRight ? sx + 9 : sx - 9;
                        const labelAnchor = onRight ? "start" : "end";
                        const labelText = useZh
                          ? `${sh.toFixed(2)} m`
                          : `${sh >= 0 ? "+" : ""}${sh.toFixed(2)} m`;
                        return (
                          <>
                            <line
                              x1={sx}
                              y1={0}
                              x2={sx}
                              y2={SVG_HEIGHT}
                              stroke="var(--ow-accent)"
                              strokeWidth={1.5}
                            />
                            <circle
                              cx={sx}
                              cy={sy}
                              r={4.5}
                              fill="var(--ow-accent)"
                              stroke="var(--ow-bg-0)"
                              strokeWidth={2}
                            />
                            <text
                              x={labelX}
                              y={sy + 4}
                              textAnchor={labelAnchor}
                              fontSize="11"
                              fontWeight={700}
                              fill="var(--ow-accent)"
                              style={{
                                paintOrder: "stroke",
                                stroke: "var(--ow-bg-0)",
                                strokeWidth: 3,
                                strokeLinejoin: "round",
                              }}
                            >
                              {labelText}
                            </text>
                          </>
                        );
                      })()
                    )}

                    {/* Extrema markers + labels. High tides labelled above,
                        low tides below, so they don't collide with the curve. */}
                    {extrema.map((e) => {
                      const h = tides[e.idx] as number;
                      const x = xForIdx(e.idx);
                      const y = yForTide(h);
                      const time = formatHour(masterTimeline[e.idx], timezoneMode);
                      const heightLabel = useZh
                        ? `${h.toFixed(2)} m`
                        : `${h >= 0 ? "+" : ""}${h.toFixed(2)} m`;
                      const labelY = e.type === "high" ? y - 10 : y + 18;
                      return (
                        <g key={`ext-${e.idx}`}>
                          <circle
                            cx={x}
                            cy={y}
                            r={3}
                            fill="var(--ow-accent)"
                            stroke="var(--ow-bg-0)"
                            strokeWidth={1.5}
                          />
                          <text
                            x={x}
                            y={labelY}
                            textAnchor="middle"
                            fontSize="10"
                            fontWeight={700}
                            fill="var(--ow-fg-0)"
                            style={{
                              paintOrder: "stroke",
                              stroke: "var(--ow-bg-0)",
                              strokeWidth: 3,
                              strokeLinejoin: "round",
                            }}
                          >
                            {time}
                          </text>
                          <text
                            x={x}
                            y={labelY + 11}
                            textAnchor="middle"
                            fontSize="9"
                            fill="var(--ow-fg-1)"
                            style={{
                              paintOrder: "stroke",
                              stroke: "var(--ow-bg-0)",
                              strokeWidth: 3,
                              strokeLinejoin: "round",
                            }}
                          >
                            {heightLabel}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
