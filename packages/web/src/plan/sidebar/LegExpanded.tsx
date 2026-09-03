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
 * A leg with a single step has nothing to average and nothing to walk: the
 * card shows the step itself, with no strip and no arrows.
 *
 * Which step is open lives in the session (`selectedStepIdx`), because the
 * map draws it too.
 */

import { useEffect, useMemo, useRef } from "react";
import type { AggregatedLeg } from "../aggregateLegs";
import { aggregateSteps, buildLegSummaryCells, legDurationLabel, legSpread } from "../aggregateLegs";
import { LegDetailCard, type LegDetailHeader, type LegDetailNote } from "../LegDetailCard";
import { StepStrip } from "../StepStrip";
import { fr1 } from "../format";
import { fmtClock } from "../../domain/datetime";
import type { SegmentReport } from "../types";
import { usePlan } from "../session/planContext";

/** The flags of one step, with the colour of the force behind each. */
function stepFlags(step: AggregatedLeg): LegDetailNote[] {
  const flags: LegDetailNote[] = [];
  const flag = buildLegSummaryCells(step).flag;
  if (flag === "Vent Contre Courant") flags.push({ text: flag, tone: "current" });
  else if (flag) flags.push({ text: flag, tone: "waves" });
  if (step.motor_used) flags.push({ text: "Moteur", tone: "muted" });
  return flags;
}

function stepNotes(step: AggregatedLeg): LegDetailNote[] {
  return stepFlags(step).map((f) =>
    f.text === "Moteur" ? { ...f, text: "au moteur sur ce pas" } : f,
  );
}

/** The flags of the steps, counted, so a formed sea or a wind against the
    current on two steps out of five still shows on the average, where the
    mean alone would have smoothed it away. */
function averageNotes(steps: AggregatedLeg[]): LegDetailNote[] {
  const n = steps.length;
  const counts = new Map<string, { count: number; tone: LegDetailNote["tone"] }>();
  for (const step of steps) {
    for (const flag of stepFlags(step)) {
      const seen = counts.get(flag.text);
      if (seen) seen.count += 1;
      else counts.set(flag.text, { count: 1, tone: flag.tone });
    }
  }
  const notes: LegDetailNote[] = [...counts].map(([text, { count, tone }]) => ({
    text: count === n ? `${text} sur tous les pas` : `${text} sur ${count} pas`,
    tone,
  }));
  notes.push({ text: `moyenne de ${n} pas, la décomposition se lit sur chaque pas`, tone: "muted" });
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

  // Opened from the bar under the totals, the leg may sit below the fold of
  // the panel: bring it into view, moving as little as possible. `nearest`
  // leaves a leg that is already visible where it is. Guarded because jsdom
  // has no scrollIntoView.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

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

  if (n <= 1) {
    header = {
      title: `${fmtClock(leg.start_time)} → ${fmtClock(leg.end_time)}`,
      sub: `${legDurationLabel(leg)} · ${fr1(leg.distance_nm)} nm`,
    };
    notes = stepNotes(leg);
    onPrev = null;
    onNext = null;
  } else if (selected == null) {
    header = {
      title: `Moyenne · ${legDurationLabel(leg)}`,
      hint: "touchez un pas",
    };
    notes = averageNotes(steps);
    onPrev = null;
    onNext = () => select(0);
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
    <div ref={rootRef} className="space-y-2.5">
      {n > 1 && <StepStrip steps={steps} selected={selected} onSelect={select} />}
      <LegDetailCard
        view={view}
        spread={n > 1 && selected == null ? spread : null}
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
