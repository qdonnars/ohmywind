// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The departure axis: one line per slot, grouped by day.
 *
 * A slot is a line, never a card, and the lines are columns: departure,
 * arrival, duration, point of sail, wind, sea, read from top to bottom with
 * tabular figures, the units said once in the header above them. What only
 * some slots have (alerts, an engine share) goes on a sub-line under the
 * arrival, so the columns stay level. The date moves to a day header instead
 * of being repeated on every row. No ranking and no complexity index: the
 * figures are aligned, and the reader judges.
 *
 * Tapping a line opens that slot in the plan; that is the way back, there is
 * no separate link.
 */

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import type { PassageWindow } from "../types";
import { usePlan } from "../session/planContext";
import { AlertChip } from "../../components/AlertChip";
import { noticeText } from "../notices";
import { StalePlaceholder } from "../sidebar/parts";
import { fmtDurationSafe, numFixed } from "../format";
import { fmtClock, fmtDay } from "../../domain/datetime";
import { beaufortLevel, windSoftVar } from "../../domain/thresholds";
import { useT, type Key } from "../../i18n";
import {
  alertCount,
  groupByDay,
  isPlanDeparture,
  motorShare,
  sortWindows,
  type SlotSort,
} from "./slots";
import { ChevronIcon } from "./icons";
import { ColumnHeader, ColumnLabel, DurationPill } from "./rowParts";

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

/** Departure · arrival · duration · point of sail · wind · sea · chevron.
    The fixed tracks hold their widest value (« 0,4–1,4 », the duration
    pill); the point of sail takes what is left and wraps. */
const SLOT_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "42px 50px 62px minmax(0,1fr) 46px 46px 8px",
  columnGap: 5,
};

/** The sub-line starts under the arrival: the departure column and its gap. */
const SUB_LINE_INDENT = 42 + 5;

/** The plan's own departure: the app's one mark for "selected", a 3 px
    accent rule on the left over the soft accent fill. */
const PLAN_ROW: CSSProperties = {
  background: "var(--ow-accent-soft)",
  boxShadow: "inset 3px 0 0 var(--ow-accent)",
};

// The server's own sail-angle buckets, keyed by the value it sends. A bucket
// we do not know about is shown as the server spelt it.
const SAIL_KEYS: Record<string, Key> = {
  pres: "panel.compare.sailUpwind",
  travers: "panel.compare.sailBeamReach",
  largue: "panel.compare.sailBroadReach",
  portant: "panel.compare.sailDownwind",
};

/** "12–14", "1,1–1,4": a range in the reader's decimals, collapsed when the
    two ends agree, "—" when the server sent neither. */
function fmtRange(min: number | null | undefined, max: number | null | undefined, decimals: number): string {
  if (min == null && max == null) return "—";
  if (min == null) return numFixed(max!, decimals);
  if (max == null) return numFixed(min, decimals);
  const a = numFixed(min, decimals);
  const b = numFixed(max, decimals);
  return a === b ? a : `${a}–${b}`;
}

function fmtTimeSafe(iso: string | null | undefined): string {
  return iso ? fmtClock(iso) : "—";
}

const SORTS: readonly SlotSort[] = ["departure", "duration", "sea"];
const SORT_KEYS: Record<SlotSort, Key> = {
  departure: "panel.compare.sort.departure",
  duration: "panel.compare.sort.duration",
  sea: "panel.compare.sort.sea",
};

/** The sort as chips: replaces the clickable column headers of the table. */
function SortRow({
  value,
  onChange,
  count,
}: {
  value: SlotSort;
  onChange: (s: SlotSort) => void;
  count: string;
}) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-1.5 px-4 pt-2 pb-2.5" role="group" aria-label={t("panel.compare.sort.label")}>
      <span className="text-[10.5px] mr-0.5" style={{ color: "var(--ow-fg-3)" }}>{t("panel.compare.sort.label")}</span>
      {SORTS.map((s) => {
        const on = s === value;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(s)}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={{
              background: on ? "var(--ow-accent-soft)" : "var(--ow-bg-2)",
              color: on ? "var(--ow-accent)" : "var(--ow-fg-2)",
              border: `1px solid ${on ? "var(--ow-accent-line)" : "var(--ow-line)"}`,
            }}
          >
            {t(SORT_KEYS[s])}
            {on && <span className="text-[9px]" style={MONO}>↑</span>}
          </button>
        );
      })}
      <span className="ml-auto text-[10px] tabular-nums" style={{ ...MONO, color: "var(--ow-fg-3)" }}>{count}</span>
    </div>
  );
}

/** The day header, « JEU. 3 SEPT. »: what frees the departure column from
    the date. The capitals are the stylesheet's, so a screen reader hears
    the day as the formatter wrote it. */
function DayHeader({ label, right }: { label: string; right: string }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5"
      style={{ background: "var(--ow-bg-1)", borderTop: "1px solid var(--ow-line)" }}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ow-fg-1)" }}>
        {label}
      </span>
      <span className="ml-auto text-[10px] tabular-nums" style={{ color: "var(--ow-fg-2)" }}>{right}</span>
    </div>
  );
}

/** The column header over every day: the units live here, not in the cells. */
function SlotColumns() {
  const { t } = useT();
  return (
    <ColumnHeader grid={SLOT_GRID} className="px-4 pt-2.5 pb-1.5">
      <ColumnLabel>{t("panel.compare.col.departure")}</ColumnLabel>
      <ColumnLabel>{t("panel.compare.col.arrival")}</ColumnLabel>
      <ColumnLabel>{t("panel.compare.col.duration")}</ColumnLabel>
      <ColumnLabel>{t("panel.compare.col.sail")}</ColumnLabel>
      <ColumnLabel unit="kn">{t("panel.compare.col.wind")}</ColumnLabel>
      <ColumnLabel unit="m">{t("panel.compare.col.sea")}</ColumnLabel>
      <span />
    </ColumnHeader>
  );
}

function SlotRow({
  w,
  active,
  onOpen,
}: {
  w: PassageWindow;
  /** The plan's own departure, already on screen. */
  active: boolean;
  onOpen: () => void;
}) {
  const { t, tn } = useT();
  // Defensive reads: an older deployment may omit fields newer types declare.
  const cs = w.conditions_summary ?? ({} as Partial<PassageWindow["conditions_summary"]>);
  const sail = cs.predominant_sail_angle;
  const sailText = sail ? (SAIL_KEYS[sail] ? t(SAIL_KEYS[sail]) : sail) : "—";
  const motor = motorShare(w.passage);
  // An engine that never ran says nothing a sailing passage does not.
  const motorText = motor !== null && motor > 0 ? t("panel.compare.row.motor", { pct: motor }) : null;
  const alerts = alertCount(w);
  const alertsText = alerts > 0 ? tn("panel.compare.row.alerts", alerts) : null;
  const time = fmtClock(w.departure);
  const arrival = fmtTimeSafe(w.arrival);
  const duration = fmtDurationSafe(w.duration_h);
  const wind = fmtRange(cs.tws_min_kn, cs.tws_max_kn, 0);
  const sea = fmtRange(cs.hs_min_m, cs.hs_max_m, 1);
  // The columns are spans without headers of their own: the name says each
  // figure with its word and its unit, as the old sentence did.
  const label = [
    t("panel.compare.row.aria", { departure: time, arrival, duration }),
    sailText,
    t("panel.compare.row.wind", { range: wind }),
    t("panel.compare.row.sea", { range: sea }),
    alertsText,
    motorText,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}. ${t("panel.compare.row.open")}`}
      aria-current={active ? "true" : undefined}
      title={t("panel.compare.row.open")}
      className="block w-full text-left px-4 py-[9px] transition-colors hover:bg-[var(--ow-bg-2)]"
      style={{ borderTop: "1px solid var(--ow-line)", ...(active ? PLAN_ROW : null) }}
    >
      <span className="items-center" style={SLOT_GRID}>
        <span className="text-[13.5px] font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--ow-fg-0)" }}>
          {time}
        </span>
        <span className="text-xs tabular-nums whitespace-nowrap overflow-hidden" style={{ color: "var(--ow-fg-1)" }}>
          <span className="mr-0.5" style={{ color: "var(--ow-fg-2)" }}>→</span>
          {arrival}
        </span>
        <DurationPill>{duration}</DurationPill>
        <span className="min-w-0 text-xs leading-tight break-words hyphens-auto" style={{ color: "var(--ow-fg-1)" }}>
          {sailText}
        </span>
        <span className="flex items-center gap-[5px] text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--ow-fg-0)" }}>
          {cs.tws_max_kn != null && (
            <span
              aria-hidden="true"
              className="shrink-0 rounded-full"
              style={{ width: 6, height: 6, background: windSoftVar(beaufortLevel(cs.tws_max_kn)) }}
            />
          )}
          {wind}
        </span>
        <span className="text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--ow-fg-0)" }}>
          {sea}
        </span>
        <span className="justify-self-end flex" style={{ color: "var(--ow-fg-3)" }}>
          <ChevronIcon direction="right" size={12} />
        </span>
      </span>
      {(alertsText || motorText) && (
        <span
          className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1"
          style={{ paddingLeft: SUB_LINE_INDENT }}
        >
          {alertsText && <AlertChip size="s">{alertsText}</AlertChip>}
          {motorText && (
            <span className="text-[10.5px] tabular-nums" style={{ color: "var(--ow-fg-2)" }}>{motorText}</span>
          )}
        </span>
      )}
    </button>
  );
}

/** « Recalculer » under a placeholder: the list is gone until the sweep runs
    again on the plan as it stands. */
function RecomputeRow({ children, onClick }: { children: string; onClick: () => void }) {
  const { t } = useT();
  return (
    <div>
      <StalePlaceholder>{children}</StalePlaceholder>
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={onClick}
          className="w-full rounded-xl px-4 py-2.5 text-sm font-bold"
          style={{ background: "var(--ow-accent)", color: "var(--ow-on-accent)" }}
        >
          {t("panel.parts.recompute")}
        </button>
      </div>
    </div>
  );
}

export function SlotList() {
  const { t, tn } = useT();
  const { state, actions, computeWindows } = usePlan();
  const { windows, isStale, metaWarnings, departure } = state;
  const [sort, setSort] = useState<SlotSort>("departure");

  const sorted = useMemo(() => (windows ? sortWindows(windows, sort) : []), [windows, sort]);
  const groups = useMemo(() => groupByDay(sorted), [sorted]);
  // Slots per calendar day, whatever the sort put next to each other.
  const perDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groupByDay(sortWindows(windows ?? [], "departure"))) {
      counts.set(g.key, g.windows.length);
    }
    return counts;
  }, [windows]);

  // The sweep is running: the list, and only the list, waits.
  if (state.pending?.kind === "sweep") {
    return (
      <div className="p-4 space-y-2 animate-fade-in" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
      </div>
    );
  }
  // The route moved since the sweep: the windows describe the old itinerary,
  // and opening one would draw a route that no longer matches the map (#152).
  if (isStale) return <RecomputeRow onClick={computeWindows}>{t("panel.compare.stale")}</RecomputeRow>;
  if (!windows || windows.length === 0) {
    return <RecomputeRow onClick={computeWindows}>{t("panel.compare.empty")}</RecomputeRow>;
  }

  return (
    <div>
      <SortRow value={sort} onChange={setSort} count={tn("panel.compare.slots", windows.length)} />
      {metaWarnings.length > 0 && (
        <div className="px-4 pb-2.5 flex flex-col items-start gap-1.5">
          {metaWarnings.map((n, i) => <AlertChip key={i}>{noticeText(n)}</AlertChip>)}
        </div>
      )}
      <SlotColumns />
      <div>
        {groups.map((g, i) => (
          <Fragment key={`${g.key}-${i}`}>
            <DayHeader
              label={fmtDay(g.sample)}
              right={tn("panel.compare.slots", perDay.get(g.key) ?? g.windows.length)}
            />
            {g.windows.map((w) => (
              <SlotRow
                key={w.departure}
                w={w}
                active={isPlanDeparture(w, departure)}
                onOpen={() => actions.selectWindow(w)}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
