// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The track axis: one line per option, the same line as a slot.
 *
 * A track is a line too: the colour swatch stands where the hour stands,
 * then the duration and the arrival in full figures, and the distance, the
 * sea and the engine share as the grey sentence. Under the lines, « Tracer
 * une variante » opens the map for a new option between the plan's ends;
 * while one is being drawn, the list gives way to what the drawing needs
 * (how many points, cancel, finish).
 */

import { useState } from "react";
import { usePlan } from "../session/planContext";
import { StalePlaceholder } from "../sidebar/parts";
import { fmtDurationSafe, num1 } from "../format";
import { fmtClock } from "../../domain/datetime";
import { useT, type Key } from "../../i18n";
import {
  isVariantComplete,
  planAsTrack,
  sortTracks,
  summariseTrack,
  trackColorToken,
  MAX_TRACKS,
  type Track,
  type TrackSort,
} from "./tracks";
import { ChevronIcon } from "./icons";

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

const SORTS: readonly TrackSort[] = ["order", "duration", "sea"];
const SORT_KEYS: Record<TrackSort, Key> = {
  order: "panel.compare.sort.order",
  duration: "panel.compare.sort.duration",
  sea: "panel.compare.sort.sea",
};

function Swatch({ index }: { index: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 self-center rounded-sm"
      style={{ width: 16, height: 3, background: `var(${trackColorToken(index)})` }}
    />
  );
}

function Dot() {
  return <span aria-hidden="true" style={{ color: "var(--ow-fg-3)" }}>·</span>;
}

function TrackRow({
  track,
  index,
  active,
  computing,
  onOpen,
  onPoint,
}: {
  track: Track;
  /** Position among the options: names it and colours it. */
  index: number;
  active: boolean;
  computing: boolean;
  onOpen: () => void;
  onPoint: (on: boolean) => void;
}) {
  const { t, tn } = useT();
  const name = t("panel.tracks.option", { n: index + 1 });
  const summary = track.passage ? summariseTrack(track.passage, track.complexity) : null;
  const openable = summary !== null;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!openable}
      onMouseEnter={() => onPoint(true)}
      onMouseLeave={() => onPoint(false)}
      onFocus={() => onPoint(true)}
      onBlur={() => onPoint(false)}
      aria-label={`${name} · ${t("panel.tracks.row.open")}`}
      title={t("panel.tracks.row.open")}
      className="w-full text-left flex flex-col gap-1 px-4 pt-2.5 pb-2.5 transition-colors enabled:hover:bg-[var(--ow-bg-2)] disabled:cursor-default"
      style={{
        borderTop: "1px solid var(--ow-line)",
        background: active ? "var(--ow-accent-soft)" : "transparent",
      }}
    >
      <span className="flex items-baseline gap-2">
        <Swatch index={index} />
        <span className="w-[62px] shrink-0 text-[12.5px] font-semibold" style={{ color: "var(--ow-fg-0)" }}>
          {name}
        </span>
        <span className="w-[52px] shrink-0 text-base font-bold tabular-nums tracking-tight" style={{ ...MONO, color: "var(--ow-fg-0)" }}>
          {summary ? fmtDurationSafe(summary.durationH) : "—"}
        </span>
        <span className="text-xs tabular-nums" style={{ ...MONO, color: "var(--ow-fg-2)" }}>
          → {summary ? fmtClock(summary.arrival) : "—"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {summary && summary.alerts > 0 && (
            <span
              title={tn("panel.compare.row.alerts", summary.alerts)}
              className="flex items-center gap-0.5 text-[10.5px] font-bold tabular-nums"
              style={{ ...MONO, color: "var(--ow-warn)" }}
            >
              <span className="text-[10px]">⚠</span>{summary.alerts}
            </span>
          )}
          <span style={{ color: "var(--ow-fg-3)" }}><ChevronIcon direction="right" /></span>
        </span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px]" style={{ color: "var(--ow-fg-2)" }}>
        {summary ? (
          <>
            <span className="tabular-nums" style={MONO}>{num1(summary.distanceNm)} nm</span>
            {summary.hsAvgM !== null && summary.hsMaxM !== null && (
              <>
                <Dot />
                <span className="tabular-nums" style={MONO}>
                  {t("panel.tracks.row.sea", { avg: num1(summary.hsAvgM), max: num1(summary.hsMaxM) })}
                </span>
              </>
            )}
            {summary.motorPct !== null && (
              <>
                <Dot />
                <span className="tabular-nums" style={MONO}>{t("panel.compare.row.motor", { pct: summary.motorPct })}</span>
              </>
            )}
          </>
        ) : computing ? (
          <span>{t("panel.tracks.row.computing")}</span>
        ) : track.error ? (
          <span style={{ color: "var(--ow-warn)" }}>{track.error}</span>
        ) : (
          <span>—</span>
        )}
      </span>
    </button>
  );
}

/** The panel while a variant is being drawn on the map. */
function DrawingPanel({ variant, optionNumber }: { variant: [number, number][]; optionNumber: number }) {
  const { t, tn } = useT();
  const { actions } = usePlan();
  const complete = isVariantComplete(variant);
  return (
    <div className="px-4 pt-3 pb-3.5 space-y-3" style={{ borderTop: "1px solid var(--ow-line)" }}>
      <div className="flex items-center gap-2">
        <Swatch index={optionNumber - 1} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--ow-fg-0)" }}>
          {t("panel.tracks.drawing.title", { n: optionNumber })}
        </span>
        <span className="ml-auto text-[11px] tabular-nums" style={{ ...MONO, color: "var(--ow-fg-2)" }}>
          {tn("panel.tracks.drawing.points", variant.length)}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "var(--ow-fg-2)" }}>{t("panel.tracks.drawing.hint")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={actions.cancelVariant}
          className="flex-1 rounded-xl px-3 py-2.5 text-[13px] font-semibold"
          style={{ background: "var(--ow-bg-2)", color: "var(--ow-fg-1)", border: "1px solid var(--ow-line)" }}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={actions.finishVariant}
          disabled={!complete}
          className="flex-[1.4] rounded-xl px-3 py-2.5 text-[13px] font-bold"
          style={{
            background: complete ? "var(--ow-accent)" : "var(--ow-bg-2)",
            color: complete ? "var(--ow-on-accent)" : "var(--ow-fg-3)",
            border: `1px solid ${complete ? "transparent" : "var(--ow-line-2)"}`,
            cursor: complete ? "pointer" : "not-allowed",
          }}
        >
          {t("panel.tracks.drawing.finish")}
        </button>
      </div>
    </div>
  );
}

export function TrackList() {
  const { t, tn } = useT();
  const { state, actions } = usePlan();
  const {
    tracks,
    variant,
    tracksStale,
    trackRequests,
    openedTrackId,
    highlightedTrackId,
    waypoints,
    passage,
    complexity,
    isStale,
  } = state;
  const [sort, setSort] = useState<TrackSort>("order");

  const options: Track[] =
    tracks.length > 0 ? tracks : [planAsTrack(waypoints, isStale ? null : passage, isStale ? null : complexity)];

  if (variant) return <DrawingPanel variant={variant} optionNumber={options.length + 1} />;

  if (tracksStale) {
    return (
      <div>
        <StalePlaceholder>{t("panel.tracks.stale")}</StalePlaceholder>
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={actions.computeTracks}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-bold"
            style={{ background: "var(--ow-accent)", color: "var(--ow-on-accent)" }}
          >
            {t("panel.parts.recompute")}
          </button>
        </div>
      </div>
    );
  }

  const active = highlightedTrackId ?? openedTrackId ?? options[0].id;
  const canDraw = waypoints.length >= 2 && options.length < MAX_TRACKS;
  const sorted = sortTracks(options, sort);

  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 pt-2 pb-2.5" role="group" aria-label={t("panel.compare.sort.label")}>
        <span className="text-[10.5px] mr-0.5" style={{ color: "var(--ow-fg-3)" }}>{t("panel.compare.sort.label")}</span>
        {SORTS.map((s) => {
          const on = s === sort;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => setSort(s)}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
              style={{
                background: on ? "var(--ow-accent-soft)" : "var(--ow-bg-2)",
                color: on ? "var(--ow-accent)" : "var(--ow-fg-2)",
                border: `1px solid ${on ? "var(--ow-accent-line)" : "var(--ow-line)"}`,
              }}
            >
              {t(SORT_KEYS[s])}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] tabular-nums" style={{ ...MONO, color: "var(--ow-fg-3)" }}>
          {tn("panel.compare.tracks", options.length)}
        </span>
      </div>
      <div style={{ borderTop: "1px solid var(--ow-line)" }}>
        {sorted.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            index={options.indexOf(track)}
            active={track.id === active}
            computing={track.id in trackRequests}
            onOpen={() => actions.openTrack(track.id)}
            onPoint={(on) => actions.highlightTrack(on ? track.id : null)}
          />
        ))}
      </div>
      <div className="px-4 pt-2.5 pb-3 space-y-1.5" style={{ borderTop: "1px solid var(--ow-line)" }}>
        <button
          type="button"
          onClick={actions.startVariant}
          disabled={!canDraw}
          className="w-full rounded-lg px-3 py-2.5 text-[12.5px] font-medium transition-colors enabled:hover:bg-[var(--ow-bg-3)]"
          style={{
            background: "var(--ow-bg-2)",
            color: canDraw ? "var(--ow-fg-1)" : "var(--ow-fg-3)",
            border: "1px solid var(--ow-line)",
            cursor: canDraw ? "pointer" : "not-allowed",
          }}
        >
          + {t("panel.compare.tracksDraw")}
        </button>
        {options.length >= MAX_TRACKS && (
          <p className="text-[10.5px] text-center" style={{ color: "var(--ow-fg-3)" }}>{t("panel.tracks.max")}</p>
        )}
      </div>
    </div>
  );
}
