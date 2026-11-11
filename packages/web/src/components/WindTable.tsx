// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useMemo } from "react";
import type { ModelForecast } from "../types";
import { TimelineHeader } from "./TimelineHeader";
import { WindCell } from "./WindCell";
import { useTimezone } from "../hooks/useTimezone";
import { nowParisHourPrefix } from "../domain/datetime";
import { useTimelineScroll } from "../hooks/useTimelineScroll";
import { useOnline } from "../hooks/useOnline";
import { useOpenMeteoQuota } from "../hooks/useOpenMeteoQuota";
import { openMeteoQuotaMessage } from "../api/openMeteoQuota";
import { MODEL_META, type ModelName } from "../config/modelConfig";
import { useT, t as translate } from "../i18n";
import { circularMean, directionSpreadDeg, MODEL_DIRECTION_SPREAD_DEG } from "../domain/thresholds";
import { DirectionArrow } from "./DirectionArrow";

function modelStep(name: string): number {
  const meta = MODEL_META[name as ModelName];
  return meta ? meta.nativeStepHours : 3;
}

function modelLabel(name: string): string {
  return MODEL_META[name as ModelName]?.label ?? name;
}

function modelShortLabel(name: string): string {
  const meta = MODEL_META[name as ModelName];
  return meta?.shortLabel ?? meta?.label ?? name;
}

function modelDescription(name: string): string {
  const meta = MODEL_META[name as ModelName];
  if (!meta) return name;
  return `${meta.label} (${meta.nativeStepHours}h) . ${translate(meta.provider)}`;
}

// Nominal cell width (a phone's), the fallback useTimelineScroll uses before
// the table is laid out; once it is, the hook measures the real columns (#413).
const CELL_W = 38;

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

/** What the direction row prints for one hour. */
interface HourDirection {
  /** Circular mean of the models' directions, null when none has one. */
  mean: number | null;
  /** Smallest arc covering them all, in whole degrees. */
  spread: number;
  /** Past `MODEL_DIRECTION_SPREAD_DEG`: one arrow would lie, so the row
      prints the spread and each model cell draws its own arrow. */
  disagree: boolean;
}

/**
 * The direction of every hour, read once from the models that have a wind
 * at that hour, the very values their cells print. Only models with a speed
 * count: a model whose step skips the hour has no say in it.
 */
function hourDirections(
  timeline: string[],
  forecasts: ModelForecast[],
  indexes: Map<string, number>[],
): HourDirection[] {
  return timeline.map((time) => {
    const dirs: number[] = [];
    forecasts.forEach((f, m) => {
      const idx = indexes[m].get(time);
      if (idx == null) return;
      const speed = f.hourly.wind_speed_10m[idx];
      const dir = f.hourly.wind_direction_10m[idx];
      if (speed != null && dir != null) dirs.push(dir);
    });
    const spread = Math.round(directionSpreadDeg(dirs));
    return { mean: circularMean(dirs), spread, disagree: spread > MODEL_DIRECTION_SPREAD_DEG };
  });
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

/**
 * Aucun modele n'a repondu pour ce point.
 *
 * `fetchAllModels` avale les echecs reseau et rend une liste vide, exactement
 * comme un point hors de toutes les grilles : le tableau ne peut donc pas
 * distinguer les deux cas tout seul. Le navigateur, lui, le sait. Hors ligne,
 * on nomme la cause au lieu de laisser croire que la mer n'a pas de meteo.
 * Meme chose quand Open-Meteo a refuse la connexion pour quota epuise : le
 * refus est note par le fetcher, et la phrase dit quel quota et quand il
 * revient (voir `api/openMeteoQuota.ts`). Hors ligne passe devant : sans
 * reseau, la question du quota ne se pose pas encore.
 */
function EmptyForecast() {
  const online = useOnline();
  const quota = useOpenMeteoQuota();
  const { t } = useT();
  let text: string;
  if (!online) text = t("explore.windTable.offline");
  else if (quota) text = openMeteoQuotaMessage("connection", quota.window, quota.resetAt);
  else text = t("explore.windTable.empty");
  return (
    <div className="text-center py-8 px-4 text-sm" style={{ color: 'var(--ow-fg-2)' }}>
      {text}
    </div>
  );
}

export function WindTable({
  forecasts,
  isLoading,
  selectedHour,
  onSelectHour,
}: WindTableProps) {
  const { t } = useT();
  const [timezoneMode] = useTimezone();

  const masterTimeline = useMemo(() => {
    const resolution = autoResolution(forecasts);
    const fullTimeline = getMasterTimeline(forecasts);
    return fullTimeline.filter(
      (t) => parseInt(t.slice(11, 13)) % resolution === 0
    );
  }, [forecasts]);

  const nowHour = nowParisHourPrefix();
  const { scrollRef, scrolledEnd, visibleDay } = useTimelineScroll(
    masterTimeline,
    CELL_W,
    nowHour,
  );

  const indexes = useMemo(
    () => forecasts.map((f) => buildTimeIndex(f.hourly.time)),
    [forecasts],
  );
  const directions = useMemo(
    () => hourDirections(masterTimeline, forecasts, indexes),
    [masterTimeline, forecasts, indexes],
  );

  // One function for the whole table, not one closure per cell.
  const selectHour = useCallback((t: string) => onSelectHour(t), [onSelectHour]);

  if (isLoading) {
    return <SkeletonTable />;
  }

  if (forecasts.length === 0) {
    return <EmptyForecast />;
  }

  const lastCol = masterTimeline.length - 1;
  const lastRow = forecasts.length - 1;

  return (
    // Same shape as MarineTable and TideChart: a flex column all the way down
    // to the scroller, and no percentage height anywhere. The scroller used
    // to be `h-full` inside a flex item: Chrome resolves that against the
    // flexed size, Firefox does not (the item's height is indefinite), so the
    // scroller grew to the whole table and the panel clipped the last rows
    // with no way to scroll (Firefox on Mac, forum, 2026-09).
    <div className="animate-fade-in flex-1 min-h-0 flex flex-col">
      <div className={`scroll-container flex-1 min-h-0 flex flex-col ${scrolledEnd ? "scrolled-end" : ""}`}>
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto wind-table-scroll">
          {/* The panel floats over the map with no fill of its own: the
              table is what hides it, gaps between the rows included. */}
          <table className="border-collapse" role="table" style={{ background: "var(--ow-bg-1)" }}>
            <thead className="sticky top-0 z-20">
              <TimelineHeader
                variant="harmonised"
                cornerLabel={t("explore.windTable.unit")}
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
              {/* One direction for the whole table while the models agree:
                  it does not change from model to model, so it is said once,
                  above them (« ce qui ne change pas se tait »). */}
              <tr>
                <td
                  className="sticky left-0 z-10 pl-2 pr-2 h-[22px] text-left whitespace-nowrap text-[10px] leading-none border-t"
                  style={{ background: "var(--ow-bg-1)", color: "var(--ow-fg-2)", borderTopColor: "var(--ow-line)" }}
                  role="rowheader"
                >
                  {t("explore.windTable.direction")}
                </td>
                {masterTimeline.map((time, i) => {
                  const d = directions[i];
                  const label = d.disagree
                    ? t("explore.windTable.spread", { deg: d.spread })
                    : d.mean != null
                      ? t("explore.windTable.meanDirection", { dir: d.mean })
                      : undefined;
                  return (
                    <td
                      key={i}
                      role="cell"
                      aria-label={label}
                      className="p-0 h-[22px] align-middle cursor-pointer border-t"
                      style={{ borderTopColor: "var(--ow-line)", color: "var(--ow-fg-1)" }}
                      onClick={() => selectHour(time)}
                    >
                      {d.disagree ? (
                        <div
                          title={label}
                          className="mx-[1px] h-[18px] flex items-center justify-center rounded-[4px] border border-dashed text-[10px] font-bold tabular-nums leading-none"
                          style={{ borderColor: "var(--ow-line-2)", color: "var(--ow-fg-0)" }}
                          aria-hidden="true"
                        >
                          Δ{d.spread}°
                        </div>
                      ) : (
                        d.mean != null && (
                          <div className="flex justify-center">
                            <DirectionArrow deg={d.mean} from size={11} className="lg:w-[12px] lg:h-[12px]" />
                          </div>
                        )
                      )}
                    </td>
                  );
                })}
              </tr>
              {forecasts.map((forecast, row) => {
                const timeIndex = indexes[row];
                return (
                  <tr key={forecast.modelName}>
                    <td
                      className="sticky left-0 z-10 pl-2 pr-2 pt-[2px] text-left whitespace-nowrap leading-none"
                      style={{ background: "var(--ow-bg-1)", color: "var(--ow-fg-0)" }}
                      role="rowheader"
                    >
                      <span
                        className="text-[10.5px] lg:text-[12px] font-semibold inline-flex items-center gap-[2px]"
                        title={
                          forecast.fellBackFrom
                            ? t("explore.windTable.fallbackTitle", {
                                description: modelDescription(forecast.modelName),
                                model: modelLabel(forecast.fellBackFrom),
                              })
                            : modelDescription(forecast.modelName)
                        }
                      >
                        {/* A phone has 54 px for the names: the variant
                            qualifier goes (« AROME », « ICON »). */}
                        <span className="lg:hidden">{modelShortLabel(forecast.modelName)}</span>
                        <span className="hidden lg:inline">{modelLabel(forecast.modelName)}</span>
                        {forecast.fellBackFrom && (
                          <span
                            aria-label={t("explore.windTable.fallbackBadge", {
                              model: modelLabel(forecast.fellBackFrom),
                            })}
                            className="text-[9px] font-normal opacity-60"
                            style={{ color: "var(--ow-fg-2)" }}
                          >
                            ↳
                          </span>
                        )}
                      </span>
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
                          showDirection={directions[i].disagree}
                          firstRow={row === 0}
                          lastRow={row === lastRow}
                          firstCol={i === 0}
                          lastCol={i === lastCol}
                          time={t}
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
