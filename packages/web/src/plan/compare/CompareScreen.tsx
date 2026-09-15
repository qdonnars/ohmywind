// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * « Comparer ce trajet »: one screen, one control.
 *
 * A trip is one track times one departure. Comparing is freezing one and
 * varying the other. Each axis is entered from its own door in the plan
 * and left through « ‹ Plan »: there is no switch between the two here, so
 * the same choice is not offered at the bottom of one screen and at the
 * top of the next. The settings of the axis come first, and the same line,
 * the same five figures and the same rule (nothing is elected) hold on
 * both sides.
 */

import { usePlan } from "../session/planContext";
import { ResultsAnchor } from "../sidebar/parts";
import { SlotList } from "./SlotList";
import { TrackList } from "./TrackList";
import { CompareSettings } from "./CompareSettings";
import { spanHours, windowCount } from "./slots";
import { ChevronIcon } from "./icons";
import { useT } from "../../i18n";

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

/** « ‹ Plan · D'autres départs · 17 créneaux ». The way back is here and
    on every line; there is no other. */
export function CompareHead() {
  const { t, tn } = useT();
  const { state, actions } = usePlan();
  const { compareAxis, windows, isStale, sweepEarliest, sweepLatest, sweepIntervalHours, tracks } = state;
  const count =
    compareAxis === "slots"
      ? tn(
          "panel.compare.slots",
          !isStale && windows ? windows.length : windowCount(spanHours(sweepEarliest, sweepLatest), sweepIntervalHours),
        )
      : tn("panel.compare.tracks", Math.max(1, tracks.length));
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
        {t(compareAxis === "slots" ? "panel.door.slots" : "panel.door.tracks")}
      </span>
      <span className="ml-auto text-[11px] tabular-nums" style={{ ...MONO, color: "var(--ow-fg-2)" }}>
        {count}
      </span>
    </div>
  );
}

export function CompareScreen() {
  const { state } = usePlan();
  return (
    <div className="animate-fade-in">
      <ResultsAnchor />
      <CompareHead />
      {/* No settings while a variant is being drawn: the map is the form. */}
      {state.variant === null && <CompareSettings />}
      {state.compareAxis === "slots" ? <SlotList /> : <TrackList />}
    </div>
  );
}
