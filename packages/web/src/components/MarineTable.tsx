import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { MarineHourly, ModelForecast, MetricView } from "../types";
import { TimelineHeader } from "./TimelineHeader";
import { useTimezone } from "../hooks/useTimezone";
import { nowParisHourPrefix } from "../utils/format";

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

// Hs bands aligned with packages/data-adapters/.../complexity._SEA_BANDS:
// plate <0.5, belle <1, agitée <2, forte <3, très forte +∞.
function wavesLevel(hs: number): number {
  if (hs < 0.5) return 1;
  if (hs < 1.0) return 2;
  if (hs < 2.0) return 4;
  if (hs < 3.0) return 6;
  return 8;
}

// Currents in kn. Red (level 8) reserved for ≥10 kn (Raz Blanchard /
// Goulet de Brest spring-tide territory) so a typical Med 0.7 kn doesn't
// alarm the user. Spread the intermediate range so 1–3 kn (atlantic
// coastal current) is visibly hotter than the Med baseline without
// reaching extreme colours.
function currentsLevel(kn: number): number {
  if (kn < 0.3) return 0;
  if (kn < 1.0) return 1;
  if (kn < 2.0) return 2;
  if (kn < 3.0) return 3;
  if (kn < 4.0) return 4;
  if (kn < 5.0) return 5;
  if (kn < 7.0) return 6;
  if (kn < 10.0) return 7;
  return 8;
}

// Tide oscillates around 0; colour by magnitude so high tide and low tide are
// equally salient.
function tidesLevel(absM: number): number {
  if (absM < 0.5) return 1;
  if (absM < 1.5) return 2;
  if (absM < 3.0) return 4;
  if (absM < 5.0) return 6;
  return 8;
}

// Wave period is informational (chop vs swell) rather than a hazard axis —
// a 4 s period at 0.6 m Hs is benign wind chop, not danger. Render the row
// uncoloured (neutral) so the user reads the *number* without the colour
// implying a risk that isn't there.

interface MarineCellProps {
  row: RowConfig;
  marine: MarineHourly;
  timeIdx: number | undefined;
  // Previous tide value at this position; powers the rising/falling indicator.
  prevTide: number | null;
  selected: boolean;
  isNow: boolean;
  isDayStart: boolean;
  onSelect: () => void;
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

function MarineCell({
  row,
  marine,
  timeIdx,
  prevTide,
  selected,
  isNow,
  isDayStart,
  onSelect,
}: MarineCellProps) {
  const nowBorder = isNow ? "border-l-2 border-l-teal-400" : "";
  const daySepClass = !isNow && isDayStart ? "ow-day-sep" : "";
  const selectedStyle = selected ? "ring-2 ring-teal-400/70 ring-inset bg-teal-400/10" : "";

  if (timeIdx == null) {
    return (
      <NullCell
        nowBorder={nowBorder}
        daySepClass={daySepClass}
        selectedStyle={selectedStyle}
        onSelect={onSelect}
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
  let renderHeader = false;
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
  // touch unused symbol so TS doesn't drop it (silences noUnusedLocals).
  void renderHeader;
  void secondary;

  if (value == null) {
    return (
      <NullCell
        nowBorder={nowBorder}
        daySepClass={daySepClass}
        selectedStyle={selectedStyle}
        onSelect={onSelect}
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
        onClick={onSelect}
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
        onClick={onSelect}
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

  const bg = `var(--ow-w-${level})`;
  const color = `var(--ow-cell-text-${level})`;

  return (
    <td
      role="cell"
      className={`wind-cell min-w-[32px] lg:min-w-[56px] h-10 lg:h-14 text-center align-middle p-0 cursor-pointer ${nowBorder} ${daySepClass} ${selectedStyle}`}
      style={{ backgroundColor: bg, color }}
      onClick={onSelect}
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [visibleDay, setVisibleDay] = useState("");
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

  const rows = rowsForMetric(metric, marine);
  // The series powering the rising/falling indicator follows the same source
  // as the displayed cell (ZH when MARC covers, MSL otherwise). Linear shift
  // doesn't change the sign of deltas, but we keep the references consistent.
  const tideSeries = marine.tide_height_zh_m ?? marine.tide_height_m;

  return (
    <div className="animate-fade-in">
      <div className={`scroll-container ${scrolledEnd ? "scrolled-end" : ""}`}>
        <div ref={scrollRef} className="overflow-x-auto wind-table-scroll">
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
                        onSelect={() => onSelectHour(t)}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
