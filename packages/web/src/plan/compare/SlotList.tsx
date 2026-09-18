// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The departure axis: one line per slot, grouped by day.
 *
 * A slot is a line, never a card: the hour, the duration and the arrival in
 * full figures on the first line, the conditions as a grey sentence on the
 * second, read only on the line one cares about. The date moves to a day
 * header instead of being repeated on every row, and the narrow columns
 * (« Allure », « Vent », « Mer ») that used to cut words and stack figures
 * become that sentence. No ranking and no complexity index: the five
 * figures are aligned, and the reader judges.
 *
 * Tapping a line opens that slot in the plan; that is the way back, there is
 * no separate link.
 */

import { Fragment, useMemo, useState } from "react";
import type { PassageWindow } from "../types";
import { usePlan } from "../session/planContext";
import { Warn } from "../PlanStates";
import { noticeText } from "../notices";
import { StalePlaceholder } from "../sidebar/parts";
import { fmtDurationSafe, numFixed } from "../format";
import { capitalise, fmtClock, fmtDay } from "../../domain/datetime";
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

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

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

/** The day header: what frees the « Départ » column of the table. */
function DayHeader({ label, right }: { label: string; right: string }) {
  return (
    <div
      className="flex items-center gap-2 px-4 pt-2 pb-1.5"
      style={{ background: "var(--ow-bg-1)", borderBottom: "1px solid var(--ow-line)" }}
    >
      <span
        className="text-[9.5px] font-bold uppercase tracking-[0.11em]"
        style={{ ...MONO, color: "var(--ow-fg-2)" }}
      >
        {label}
      </span>
      <span className="ml-auto text-[10px] tabular-nums" style={{ color: "var(--ow-fg-3)" }}>{right}</span>
    </div>
  );
}

function Dot() {
  return <span aria-hidden="true" style={{ color: "var(--ow-fg-3)" }}>·</span>;
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
  const alerts = alertCount(w);
  const time = fmtClock(w.departure);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${time} · ${t("panel.compare.row.open")}`}
      title={t("panel.compare.row.open")}
      className="w-full text-left flex flex-col gap-1 px-4 pt-2.5 pb-2.5 transition-colors hover:bg-[var(--ow-bg-2)]"
      style={{
        borderTop: "1px solid var(--ow-line)",
        background: active ? "var(--ow-accent-soft)" : "transparent",
      }}
    >
      <span className="flex items-baseline gap-2">
        <span className="w-[46px] shrink-0 text-[14px] font-bold tabular-nums" style={{ ...MONO, color: "var(--ow-fg-0)" }}>
          {time}
        </span>
        <span className="w-[52px] shrink-0 text-base font-bold tabular-nums tracking-tight" style={{ ...MONO, color: "var(--ow-fg-0)" }}>
          {fmtDurationSafe(w.duration_h)}
        </span>
        <span className="text-xs tabular-nums" style={{ ...MONO, color: "var(--ow-fg-2)" }}>
          → {fmtTimeSafe(w.arrival)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {active && (
            <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "var(--ow-accent)" }}>
              {t("panel.compare.row.fromPlan")}
            </span>
          )}
          {alerts > 0 && (
            <span
              title={tn("panel.compare.row.alerts", alerts)}
              className="flex items-center gap-0.5 text-[10.5px] font-bold tabular-nums"
              style={{ ...MONO, color: "var(--ow-warn)" }}
            >
              <span className="text-[10px]">⚠</span>{alerts}
            </span>
          )}
          <span style={{ color: "var(--ow-fg-3)" }}><ChevronIcon direction="right" /></span>
        </span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px]" style={{ color: "var(--ow-fg-2)" }}>
        <span className="capitalize">{sailText}</span>
        <Dot />
        <span className="tabular-nums" style={MONO}>
          {t("panel.compare.row.wind", { range: fmtRange(cs.tws_min_kn, cs.tws_max_kn, 0) })}
        </span>
        <Dot />
        <span className="tabular-nums" style={MONO}>
          {t("panel.compare.row.sea", { range: fmtRange(cs.hs_min_m, cs.hs_max_m, 1) })}
        </span>
        {motor !== null && (
          <>
            <Dot />
            <span className="tabular-nums" style={MONO}>{t("panel.compare.row.motor", { pct: motor })}</span>
          </>
        )}
      </span>
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
        <div className="px-4 pb-2.5 space-y-1.5">
          {metaWarnings.map((n, i) => <Warn key={i}>{noticeText(n)}</Warn>)}
        </div>
      )}
      <div style={{ borderTop: "1px solid var(--ow-line)" }}>
        {groups.map((g, i) => (
          <Fragment key={`${g.key}-${i}`}>
            <DayHeader
              label={capitalise(fmtDay(g.sample))}
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
