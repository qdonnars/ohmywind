import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { ModelForecast } from "../types";
import { TimelineHeader } from "./TimelineHeader";
import { WindCell } from "./WindCell";
import { useTimezone } from "../hooks/useTimezone";
import { nowParisHourPrefix } from "../utils/format";
import { MODEL_META, type ModelName } from "../config/modelConfig";

function modelStep(name: string): number {
  const meta = MODEL_META[name as ModelName];
  return meta ? meta.nativeStepHours : 3;
}

function modelLabel(name: string): string {
  return MODEL_META[name as ModelName]?.label ?? name;
}

function modelDescription(name: string): string {
  const meta = MODEL_META[name as ModelName];
  if (!meta) return name;
  return `${meta.label} (${meta.nativeStepHours}h) . ${meta.provider}`;
}

// Approximate cell width (must match WindCell min-w-[36px])
const CELL_W = 36;

function autoResolution(forecasts: ModelForecast[]): number {
  let finest = 6;
  for (const f of forecasts) {
    const step = modelStep(f.modelName);
    if (step < finest) finest = step;
  }
  return finest;
}

interface WindTableProps {
  forecasts: ModelForecast[];
  isLoading: boolean;
  selectedHour: string | null;
  onSelectHour: (time: string) => void;
}

function getMasterTimeline(forecasts: ModelForecast[]): string[] {
  let longest: string[] = [];
  for (const f of forecasts) {
    if (f.hourly.time.length > longest.length) {
      longest = f.hourly.time;
    }
  }
  return longest;
}

function buildTimeIndex(times: string[]): Map<string, number> {
  const map = new Map<string, number>();
  times.forEach((t, i) => map.set(t, i));
  return map;
}

function SkeletonTable() {
  return (
    <div className="px-3 py-4 space-y-3 animate-fade-in">
      <div className="flex gap-2 items-center">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-4 flex-1 max-w-[200px]" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-1">
          <div className="skeleton h-10 w-14 shrink-0" />
          {Array.from({ length: 10 }).map((_, j) => (
            <div key={j} className="skeleton h-10 w-9 shrink-0" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function WindTable({
  forecasts,
  isLoading,
  selectedHour,
  onSelectHour,
}: WindTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [visibleDay, setVisibleDay] = useState("");
  const [timezoneMode] = useTimezone();

  const masterTimeline = useMemo(() => {
    const resolution = autoResolution(forecasts);
    const fullTimeline = getMasterTimeline(forecasts);
    return fullTimeline.filter(
      (t) => parseInt(t.slice(11, 13)) % resolution === 0
    );
  }, [forecasts]);

  const dayStarts = useMemo(() => {
    const set = new Set<string>();
    let prev = "";
    for (const t of masterTimeline) {
      const day = t.slice(0, 10);
      if (day !== prev) { set.add(t); prev = day; }
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
    const nearestIdx = idx >= 0 ? idx : masterTimeline.findIndex((t) => t > nowHour.slice(0, 13));
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

  if (isLoading) {
    return <SkeletonTable />;
  }

  if (forecasts.length === 0) {
    return (
      <div className="text-center py-8 text-sm" style={{ color: 'var(--ow-fg-2)' }}>
        No data available
      </div>
    );
  }

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
              {forecasts.map((forecast) => {
                const timeIndex = buildTimeIndex(forecast.hourly.time);
                return (
                  <tr key={forecast.modelName} className={forecasts.indexOf(forecast) % 2 === 1 ? "model-row-alt" : ""}>
                    <td
                      className="sticky left-0 z-10 px-2 py-1 whitespace-nowrap border-r min-w-[56px]"
                      style={{ background: 'var(--ow-bg-1)', borderColor: 'var(--ow-line-2)' }}
                      role="rowheader"
                    >
                      <div className="flex flex-col items-center leading-none gap-[2px]">
                        <span
                          className="text-[11px] lg:text-[12px] font-bold tracking-wide"
                          style={{ color: 'var(--ow-fg-0)' }}
                          title={modelDescription(forecast.modelName)}
                        >
                          {modelLabel(forecast.modelName)}
                        </span>
                        <span className="text-[8px] font-medium" style={{ color: 'var(--ow-fg-2)' }}>kn</span>
                      </div>
                    </td>
                    {masterTimeline.map((t, i) => {
                      const idx = timeIndex.get(t);
                      const speed = idx != null ? forecast.hourly.wind_speed_10m[idx] : null;
                      const gusts = idx != null ? forecast.hourly.wind_gusts_10m[idx] : null;
                      const direction = idx != null ? forecast.hourly.wind_direction_10m[idx] : null;
                      return (
                        <WindCell
                          key={i}
                          speed={speed}
                          gusts={gusts}
                          direction={direction}
                          selected={t === selectedHour}
                          isNow={t.startsWith(nowHour)}
                          isDayStart={dayStarts.has(t) && i > 0}
                          onSelect={() => onSelectHour(t)}
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
