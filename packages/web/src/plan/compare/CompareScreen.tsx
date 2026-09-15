// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * « Comparer ce trajet »: one screen, one control.
 *
 * A trip is one track times one departure. Comparing is freezing one and
 * varying the other: the axis toggle is the only control of the screen, and
 * the same line, the same five figures and the same rule (nothing is
 * elected) hold on both sides. Each axis says what is frozen (the pinned
 * row at the bottom, see `CompareFoot`) and what varies (the list, and the
 * action under it).
 */

import { usePlan } from "../session/planContext";
import { ResultsAnchor } from "../sidebar/parts";
import { SlotList } from "./SlotList";
import { spanHours, windowCount, type CompareAxis } from "./slots";
import { ChevronIcon } from "./icons";
import { useT } from "../../i18n";

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

/** « ‹ Plan · Comparer ce trajet · 17 créneaux ». The way back is here and
    on every line; there is no other. */
export function CompareHead() {
  const { t, tn } = useT();
  const { state, actions } = usePlan();
  const { compareAxis, windows, isStale, sweepEarliest, sweepLatest, sweepIntervalHours } = state;
  const count =
    compareAxis === "slots"
      ? tn(
          "panel.compare.slots",
          !isStale && windows ? windows.length : windowCount(spanHours(sweepEarliest, sweepLatest), sweepIntervalHours),
        )
      : tn("panel.compare.tracks", 1);
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
      <button
        type="button"
        onClick={actions.closeCompare}
        aria-label={t("panel.compare.backAria")}
        className="flex items-center gap-0.5 text-xs font-semibold"
        style={{ color: "var(--ow-fg-1)" }}
      >
        <ChevronIcon direction="left" size={12} />
        {t("panel.compare.back")}
      </button>
      <span className="text-[13px] font-semibold" style={{ color: "var(--ow-fg-0)" }}>
        {t("panel.compare.title")}
      </span>
      <span className="ml-auto text-[11px] tabular-nums" style={{ ...MONO, color: "var(--ow-fg-2)" }}>
        {count}
      </span>
    </div>
  );
}

const AXES: readonly CompareAxis[] = ["slots", "tracks"];

export function AxisToggle() {
  const { t } = useT();
  const { state, actions } = usePlan();
  return (
    <div className="px-4 pt-2 pb-2.5">
      <div
        className="flex gap-[3px] p-[3px] rounded-full"
        style={{ background: "var(--ow-bg-2)", border: "1px solid var(--ow-line)" }}
        role="tablist"
        aria-label={t("panel.compare.axis.label")}
      >
        {AXES.map((axis) => {
          const on = axis === state.compareAxis;
          return (
            <button
              key={axis}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => actions.setCompareAxis(axis)}
              className="flex-1 rounded-full py-[7px] text-xs font-semibold transition-colors"
              style={{
                background: on ? "var(--ow-bg-1)" : "transparent",
                color: on ? "var(--ow-fg-0)" : "var(--ow-fg-2)",
                boxShadow: on ? "var(--ow-shadow-sm)" : "none",
              }}
            >
              {t(axis === "slots" ? "panel.compare.axis.slots" : "panel.compare.axis.tracks")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The track axis, before any variant exists. */
function TrackList() {
  const { t } = useT();
  return (
    <div className="px-4 py-4 space-y-3" style={{ borderTop: "1px solid var(--ow-line)" }}>
      <p className="text-xs leading-relaxed" style={{ color: "var(--ow-fg-2)" }}>{t("panel.compare.tracksEmpty")}</p>
      <button
        type="button"
        disabled
        className="w-full rounded-lg px-3 py-2.5 text-[12.5px] font-medium"
        style={{ background: "var(--ow-bg-2)", color: "var(--ow-fg-3)", border: "1px solid var(--ow-line)", cursor: "not-allowed" }}
      >
        + {t("panel.compare.tracksDraw")}
      </button>
    </div>
  );
}

export function CompareScreen() {
  const { state } = usePlan();
  return (
    <div className="animate-fade-in">
      <ResultsAnchor />
      <CompareHead />
      <AxisToggle />
      {state.compareAxis === "slots" ? <SlotList /> : <TrackList />}
    </div>
  );
}
