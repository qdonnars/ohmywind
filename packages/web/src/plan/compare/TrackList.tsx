// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The track axis: one line per option, in columns like a slot.
 *
 * A track is a line too: the colour swatch and the option's name, then the
 * arrival, the duration, the distance and the highest sea, aligned under a
 * header that says the units once. Two or three options are read in the
 * order they were drawn, so there is no sort here. Tapping the line chooses
 * that option as the plan's route without leaving the comparison, which is
 * also what the departure axis then compares on. Under the figures, a
 * sub-row says the option's alerts on the left and holds its two actions on
 * the right: « Voir sur la carte » opens it in the plan, and every option
 * but the plan's own can be removed. Under the lines, « Tracer une
 * variante » opens the map for a new option between the plan's ends; while
 * one is being drawn, the list gives way to what the drawing needs (how many
 * points, cancel, finish).
 */

import type { CSSProperties } from "react";
import { usePlan } from "../session/planContext";
import { StalePlaceholder } from "../sidebar/parts";
import { AlertChip } from "../../components/AlertChip";
import { fmtDurationSafe, num1 } from "../format";
import { fmtClock } from "../../domain/datetime";
import { useT } from "../../i18n";
import {
  isVariantComplete,
  planAsTrack,
  summariseTrack,
  trackAlerts,
  trackColorToken,
  MAX_TRACKS,
  type Track,
} from "./tracks";
import { waypointsEqual } from "../lastSimulation";
import { ChevronIcon } from "./icons";
import { ColumnHeader, ColumnLabel, DurationPill } from "./rowParts";

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

/** Option · arrival · duration · distance · highest sea. The name takes
    what the figures leave. */
const TRACK_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 48px 62px 40px 56px",
  columnGap: 6,
};

const SWATCH_W = 14;
const SWATCH_GAP = 8;
/** The row's side padding: the sub-row's text lines up under the name. */
const ROW_PAD = 16;

/** The plan's own option: the app's one mark for "selected", a 3 px accent
    rule on the left over the soft accent fill. */
const PLAN_ROW: CSSProperties = {
  background: "var(--ow-accent-soft)",
  boxShadow: "inset 3px 0 0 var(--ow-accent)",
};

/** The option's colour on the map, as a short stroke of the line itself. */
function Swatch({ index }: { index: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 self-center rounded-[2px]"
      style={{ width: SWATCH_W, height: 4, background: `var(${trackColorToken(index)})` }}
    />
  );
}

function TrackColumns() {
  const { t } = useT();
  return (
    <ColumnHeader grid={TRACK_GRID} className="px-4 pt-2 pb-1.5">
      <ColumnLabel>{t("panel.compare.col.option")}</ColumnLabel>
      <ColumnLabel>{t("panel.compare.col.arrival")}</ColumnLabel>
      <ColumnLabel>{t("panel.compare.col.duration")}</ColumnLabel>
      <ColumnLabel unit="nm">{t("panel.compare.col.distance")}</ColumnLabel>
      <ColumnLabel unit="m">{t("panel.compare.col.seaMax")}</ColumnLabel>
    </ColumnHeader>
  );
}

/** A real button of the sub-row: text-sized, but a 32 px target. */
const SUB_BUTTON =
  "shrink-0 inline-flex items-center gap-0.5 min-h-8 px-2 rounded-md text-[11px] transition-colors enabled:hover:bg-[var(--ow-bg-2)] disabled:opacity-40 disabled:cursor-default";

function TrackRow({
  track,
  index,
  selected,
  highlighted,
  computing,
  removable,
  onSelect,
  onOpen,
  onRemove,
  onPoint,
}: {
  track: Track;
  /** Position among the options: names it and colours it. */
  index: number;
  /** The plan's route, hence the one the departure axis is about. */
  selected: boolean;
  /** Pointed at: drawn full on the map. */
  highlighted: boolean;
  computing: boolean;
  removable: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRemove: () => void;
  onPoint: (on: boolean) => void;
}) {
  const { t, tn } = useT();
  const name = t("panel.tracks.option", { n: index + 1 });
  const summary = track.passage ? summariseTrack(track.passage, track.complexity) : null;
  const alerts = track.passage ? trackAlerts(track.passage, track.complexity) : null;
  const usable = summary !== null;
  const inPlan = t("panel.tracks.row.inPlan");
  const arrival = summary ? fmtClock(summary.arrival) : "—";
  const duration = summary ? fmtDurationSafe(summary.durationH) : "—";
  const distance = summary ? num1(summary.distanceNm) : "—";
  const seaMax = summary && summary.hsMaxM !== null ? num1(summary.hsMaxM) : "—";
  // An engine that never ran says nothing a sailing passage does not.
  const motorText =
    summary && summary.motorPct !== null && summary.motorPct > 0
      ? t("panel.compare.row.motor", { pct: summary.motorPct })
      : null;
  const alertsText = summary && summary.alerts > 0 ? tn("panel.compare.row.alerts", summary.alerts) : null;
  const select = t("panel.tracks.row.select", { n: index + 1 });
  // The columns are spans without headers of their own: the name says each
  // figure with its word and its unit.
  const label = summary
    ? [
        t("panel.tracks.row.aria", {
          option: selected ? `${name}, ${inPlan}` : name,
          arrival,
          duration,
          distance,
          sea: seaMax,
        }),
        alertsText,
        motorText,
      ]
        .filter(Boolean)
        .join(", ") + `. ${select}`
    : `${name} · ${select}`;
  const hasStatus =
    (alerts !== null && (alerts.lines.length > 0 || alerts.others.length > 0)) ||
    motorText !== null ||
    (!summary && (computing || track.error !== null));
  return (
    <div
      style={{
        borderTop: "1px solid var(--ow-line)",
        // Pointing at another option draws it full on the map: the row says
        // which, in the hover grey, and the accent stays the plan's.
        ...(selected ? PLAN_ROW : highlighted ? { background: "var(--ow-bg-2)" } : null),
      }}
      onMouseEnter={() => onPoint(true)}
      onMouseLeave={() => onPoint(false)}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!usable}
        aria-pressed={selected}
        aria-label={label}
        title={select}
        onFocus={() => onPoint(true)}
        onBlur={() => onPoint(false)}
        className="block w-full text-left px-4 pt-2.5 pb-1 disabled:cursor-default"
      >
        <span className="items-center" style={TRACK_GRID}>
          <span className="flex items-center min-w-0" style={{ gap: SWATCH_GAP }}>
            <Swatch index={index} />
            <span className="flex flex-col min-w-0">
              <span className="truncate text-[12.5px] font-semibold" style={{ color: "var(--ow-fg-0)" }}>{name}</span>
              {selected && (
                <span className="truncate text-[10px] font-semibold" style={{ color: "var(--ow-accent)" }}>{inPlan}</span>
              )}
            </span>
          </span>
          <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--ow-fg-0)" }}>
            {arrival}
          </span>
          <DurationPill>{duration}</DurationPill>
          <span className="text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--ow-fg-0)" }}>
            {distance}
          </span>
          <span
            className="text-xs font-semibold tabular-nums whitespace-nowrap"
            style={{ color: alerts?.sea ? "var(--ow-warn-ink)" : "var(--ow-fg-0)" }}
          >
            {seaMax}
          </span>
        </span>
      </button>
      {/* Outside the row's button: a button holds no other. The status
          takes the line and pushes the actions under it when both do not
          fit, rather than squeezing an alert into a column of words. */}
      <div
        className="flex flex-wrap items-center gap-x-2.5 pb-1"
        style={{ paddingLeft: ROW_PAD + SWATCH_W + SWATCH_GAP, paddingRight: ROW_PAD - 8 }}
      >
        {hasStatus && (
          <div className="flex-[1_1_160px] min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1">
            {summary && alerts ? (
              <>
                {alerts.lines.map((line, i) => <AlertChip key={i} size="s">{line}</AlertChip>)}
                {alerts.others.length > 0 && (
                  <span className="inline-flex max-w-full" title={alerts.others.join("\n")}>
                    <AlertChip size="s">
                      {alerts.lines.length > 0
                        ? tn("panel.tracks.row.moreAlerts", alerts.others.length)
                        : tn("panel.compare.row.alerts", alerts.others.length)}
                    </AlertChip>
                  </span>
                )}
                {motorText && (
                  <span className="text-[10.5px] tabular-nums" style={{ color: "var(--ow-fg-2)" }}>{motorText}</span>
                )}
              </>
            ) : computing ? (
              <span className="text-[10.5px]" style={{ color: "var(--ow-fg-2)" }}>{t("panel.tracks.row.computing")}</span>
            ) : (
              <span className="text-[10.5px]" style={{ color: "var(--ow-warn-ink)" }}>{track.error}</span>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center">
          {removable && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={t("panel.tracks.row.remove", { n: index + 1 })}
              title={t("panel.tracks.row.remove", { n: index + 1 })}
              className={SUB_BUTTON}
              style={{ color: "var(--ow-fg-2)" }}
            >
              {t("panel.tracks.row.removeShort")}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            disabled={!usable}
            aria-label={`${name} · ${t("panel.tracks.row.open")}`}
            title={t("panel.tracks.row.open")}
            className={`${SUB_BUTTON} font-semibold`}
            style={{ color: "var(--ow-accent)" }}
          >
            {t("panel.tracks.row.openShort")}
            <ChevronIcon direction="right" size={9} />
          </button>
        </div>
      </div>
    </div>
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
  const { t } = useT();
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

  // The option that is the plan's route: what the departure axis compares
  // on, and what « ‹ Plan » returns to.
  const selectedId = options.find((o) => waypointsEqual(o.waypoints, waypoints))?.id ?? null;
  const active = highlightedTrackId ?? openedTrackId ?? selectedId ?? options[0].id;
  const canDraw = waypoints.length >= 2 && options.length < MAX_TRACKS;

  return (
    <div>
      <div style={{ borderTop: "1px solid var(--ow-line)" }}>
        <TrackColumns />
        {options.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            index={options.indexOf(track)}
            selected={track.id === selectedId}
            highlighted={track.id === active}
            computing={track.id in trackRequests}
            removable={track.id !== selectedId && tracks.length > 0}
            onSelect={() => actions.selectTrack(track.id)}
            onOpen={() => actions.openTrack(track.id)}
            onRemove={() => actions.removeTrack(track.id)}
            onPoint={(on) => actions.highlightTrack(on ? track.id : null)}
          />
        ))}
      </div>
      <div className="px-4 pt-2.5 pb-3.5 space-y-1.5" style={{ borderTop: "1px solid var(--ow-line)" }}>
        {/* Dashed: a place for an option that does not exist yet. */}
        <button
          type="button"
          onClick={actions.startVariant}
          disabled={!canDraw}
          className="w-full rounded-lg px-3 py-[9px] text-[12.5px] font-medium transition-colors enabled:hover:bg-[var(--ow-bg-2)]"
          style={{
            color: canDraw ? "var(--ow-fg-1)" : "var(--ow-fg-3)",
            border: "1px dashed var(--ow-line-2)",
            cursor: canDraw ? "pointer" : "not-allowed",
          }}
        >
          + {t("panel.compare.tracksDraw")}
        </button>
        {options.length >= MAX_TRACKS && (
          <p className="text-[10.5px] text-center" style={{ color: "var(--ow-fg-2)" }}>{t("panel.tracks.max")}</p>
        )}
      </div>
    </div>
  );
}
