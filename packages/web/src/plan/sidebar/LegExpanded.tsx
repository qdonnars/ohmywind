// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * What an open leg shows under its row: every step side by side in a table,
 * and the card, under the table or beside it on a wide panel, on the whole
 * leg by default and on one step when the reader picks a column. The card is
 * compact there: what the table says, it does not repeat.
 *
 * The average is a distance-weighted mean of the steps, and it used to be the
 * only thing on screen. A row saying "6–9 kn" over a dial drawing one arrow
 * at 7 kn left the reader guessing where the 9 came from and why the current
 * counted against when half the steps had it along. The steps are the
 * answer, so they are there from the start, above the average they make up.
 * There was a toggle between the two views; it asked for a choice before
 * showing anything, and the table needs none.
 *
 * A leg with a single step has nothing to average and no table: the card
 * shows the step itself, every row of it.
 *
 * Which step is open lives in the session (`selectedStepIdx`), because the
 * map draws it too.
 */

import { useEffect, useMemo, useRef } from "react";
import type { AggregatedLeg } from "../aggregateLegs";
import { aggregateSteps, buildLegSummaryCells, legDurationLabel, legSpread } from "../aggregateLegs";
import { LegDetailCard, type LegDetailHeader, type LegDetailNote } from "../LegDetailCard";
import { StepTable } from "../StepTable";
import { stepTableWidthPx } from "../stepTableLayout";
import { num1 } from "../format";
import { fmtClock } from "../../domain/datetime";
import type { SegmentReport } from "../types";
import { usePlan } from "../session/planContext";
import { t, tn, useT } from "../../i18n";

/** The flags of one step, with the colour of the force behind each. */
function stepFlags(step: AggregatedLeg): LegDetailNote[] {
  const flags: LegDetailNote[] = [];
  const flag = buildLegSummaryCells(step).flag;
  if (flag === t("panel.legs.seaFlag.windAgainstCurrent")) {
    flags.push({ text: flag, tone: "current" });
  } else if (flag) flags.push({ text: flag, tone: "waves" });
  if (step.motor_used) flags.push({ text: t("panel.legs.pointOfSail.motor"), tone: "muted" });
  return flags;
}

function stepNotes(step: AggregatedLeg): LegDetailNote[] {
  return stepFlags(step).map((f) =>
    f.text === t("panel.legs.pointOfSail.motor")
      ? { ...f, text: t("panel.legDetail.noteMotorOnStep") }
      : f,
  );
}

/** Under the table, the card keeps only the note the table cannot say:
    the engine. The sea and the current are flagged in the table and in the
    leg's row already. */
function compactNotes(steps: AggregatedLeg[]): LegDetailNote[] {
  return steps.some((s) => s.motor_used)
    ? [{ text: t("panel.legDetail.noteMotorOnStep"), tone: "muted" }]
    : [];
}

/** Most steps a leg may have and still set its card beside the table. */
const SIDE_BY_SIDE_MAX_STEPS = 5;

export function LegExpanded({
  leg,
  segments,
  minUpwindDeg,
}: {
  leg: AggregatedLeg;
  /** The whole passage's segments; the leg knows its own range in them. */
  segments: SegmentReport[];
  minUpwindDeg: number;
}) {
  const { lang } = useT();
  const { state, actions } = usePlan();

  // Opened from the bar under the totals, the leg may sit below the fold of
  // the panel: bring it into view, moving as little as possible. `nearest`
  // leaves a leg that is already visible where it is. Guarded because jsdom
  // has no scrollIntoView.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const steps = useMemo(() => {
    // `aggregateSteps` labels each step through `t()`, which reads the
    // language from the store, not from a parameter. Naming `lang` here is
    // what ties the memo to it, so a language switch rebuilds the labels.
    void lang;
    return aggregateSteps(segments, leg.segment_range, leg.efficiency, minUpwindDeg);
  }, [segments, leg.segment_range, leg.efficiency, minUpwindDeg, lang]);
  const spread = useMemo(() => legSpread(steps), [steps]);
  const n = steps.length;

  // A stale index (fewer steps than before) falls back to the average rather
  // than to a step that is not there.
  const raw = state.selectedStepIdx;
  const selected = raw != null && raw >= 0 && raw < n ? raw : null;
  const select = actions.selectStep;

  let view: AggregatedLeg = leg;
  let header: LegDetailHeader;
  let notes: LegDetailNote[];

  if (n <= 1) {
    header = {
      title: `${fmtClock(leg.start_time)} → ${fmtClock(leg.end_time)}`,
      sub: `${legDurationLabel(leg)} · ${num1(leg.distance_nm)} nm`,
    };
    notes = stepNotes(leg);
  } else if (selected == null) {
    header = {
      title: `${t("plan.steps.wholeLeg")} · ${legDurationLabel(leg)}`,
      sub: tn("panel.legDetail.noteAverage", n),
    };
    notes = compactNotes(steps);
  } else {
    const step = steps[selected];
    view = step;
    header = {
      title: `${fmtClock(step.start_time)} → ${fmtClock(step.end_time)}`,
      sub: `${legDurationLabel(step)} · ${num1(step.distance_nm)} nm`,
    };
    notes = compactNotes([step]);
  }

  const card = (
    <LegDetailCard
      view={view}
      spread={n > 1 && selected == null ? spread : null}
      header={header}
      notes={notes}
      compact={n > 1}
    />
  );
  if (n <= 1) return <div ref={rootRef}>{card}</div>;

  // A leg of a few steps beside its card when the panel is wide enough for
  // both (a widened desktop sidebar), stacked otherwise. Past five steps the
  // table scrolls and needs the whole width, so it always stacks.
  const side = n <= SIDE_BY_SIDE_MAX_STEPS;
  return (
    <div ref={rootRef} className="@container">
      <div
        className={`flex flex-col gap-2.5 ${side ? "@min-[620px]:flex-row @min-[620px]:items-center @min-[620px]:gap-4" : ""}`}
      >
        <div
          className={side ? "@min-[620px]:shrink-0" : undefined}
          style={side ? ({ "--steps-w": `${stepTableWidthPx(n)}px` } as React.CSSProperties) : undefined}
        >
          <div className={side ? "@min-[620px]:w-[var(--steps-w)]" : undefined}>
            <StepTable steps={steps} selected={selected} onSelect={select} />
          </div>
        </div>
        <div className="min-w-0 flex-1">{card}</div>
      </div>
    </div>
  );
}
