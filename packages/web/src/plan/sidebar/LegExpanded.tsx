// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * What an open leg shows under its row: the strip of its steps, then the
 * card, on the average by default and on one step when the reader picks one.
 *
 * The average is a distance-weighted mean of the steps, and it used to be the
 * only thing on screen. A row saying "6–9 kn" over a dial drawing one arrow
 * at 7 kn left the reader guessing where the 9 came from and why the current
 * counted against when half the steps had it along. The steps are the
 * answer, and the arrows walk them in order: average, then step 1 to N.
 *
 * Which step is open lives in the session (`selectedStepIdx`), because the
 * map draws it too.
 */

import { useMemo } from "react";
import type { AggregatedLeg } from "../aggregateLegs";
import { aggregateSteps, buildLegSummaryCells, legDurationLabel, legSpread } from "../aggregateLegs";
import { LegDetailCard, type LegDetailHeader, type LegDetailNote } from "../LegDetailCard";
import { StepStrip } from "../StepStrip";
import { fr1 } from "../format";
import { fmtClock } from "../../domain/datetime";
import type { SegmentReport } from "../types";
import { usePlan } from "../session/planContext";

/** The flags of one step, with the colour of the force behind each. */
function stepNotes(step: AggregatedLeg): LegDetailNote[] {
  const notes: LegDetailNote[] = [];
  const flag = buildLegSummaryCells(step).flag;
  if (flag === "Vent Contre Courant") notes.push({ text: flag, tone: "current" });
  else if (flag) notes.push({ text: flag, tone: "waves" });
  if (step.motor_used) notes.push({ text: "au moteur sur ce pas", tone: "muted" });
  return notes;
}

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
  const { state, actions } = usePlan();
  const steps = useMemo(
    () => aggregateSteps(segments, leg.segment_range, leg.efficiency, minUpwindDeg),
    [segments, leg.segment_range, leg.efficiency, minUpwindDeg],
  );
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
  let onPrev: (() => void) | null;
  let onNext: (() => void) | null;

  if (selected == null) {
    header = {
      title: `Moyenne · ${legDurationLabel(leg)}`,
      hint: n > 1 ? "touchez un pas" : undefined,
    };
    notes = [{ text: n > 1 ? `moyenne de ${n} pas` : "un seul pas de calcul", tone: "muted" }];
    onPrev = null;
    onNext = n > 1 ? () => select(0) : null;
  } else {
    const step = steps[selected];
    view = step;
    header = {
      title: `${fmtClock(step.start_time)} → ${fmtClock(step.end_time)}`,
      sub: `${legDurationLabel(step)} · ${fr1(step.distance_nm)} nm · ${selected + 1}/${n}`,
    };
    notes = stepNotes(step);
    onPrev = () => select(selected === 0 ? null : selected - 1);
    onNext = selected < n - 1 ? () => select(selected + 1) : null;
  }

  return (
    <div className="space-y-2.5">
      <StepStrip steps={steps} selected={selected} onSelect={select} />
      <LegDetailCard
        view={view}
        spread={selected == null ? spread : null}
        header={header}
        onPrev={onPrev}
        onNext={onNext}
        notes={notes}
      />
      {/* Which way to read the dial (issue #269). Wind and waves sit on the
          side they come FROM, the current arrows point where the water sets
          TO: each is the convention of its own data. */}
      <p className="text-center text-[10px] leading-snug" style={{ color: "var(--ow-fg-2)" }}>
        Vent et vagues sont placés du côté d'où ils viennent. La flèche de
        courant montre où il porte.
      </p>
    </div>
  );
}
