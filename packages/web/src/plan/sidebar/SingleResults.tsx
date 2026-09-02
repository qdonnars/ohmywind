// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import type { ComplexityScore, PassageReport } from "../types";
import { TimeAnchorToggle } from "../ModeToggle";
import { Warn, RecapButton, HeroStats } from "../PlanStates";
import { usePlan } from "../session/planContext";
import { PlanHeaderRow } from "./PlanHeaderRow";
import { DepartureSlider } from "./DepartureSlider";
import { ArchetypeSelector } from "./ArchetypeSelector";
import { LegList } from "./LegList";
import { RecomputeBar, ResultsAnchor, StalePlaceholder } from "./parts";
import { capitalise, fmtClock, fmtDay } from "../../domain/datetime";

/** Single mode with a passage behind it: recap, totals, warnings, legs. */
export function SingleResults({
  passage,
  complexity,
  boatLabel,
}: {
  passage: PassageReport;
  complexity: ComplexityScore;
  boatLabel: string;
}) {
  const { state, actions, compute } = usePlan();
  const { departure, timeAnchor, isStale, forecastUpdatedAt } = state;
  const [isEditingParams, setIsEditingParams] = useState(false);

  // Both lists are guarded rather than read straight: `parse.ts` checks the
  // shape of a live response, but a passage restored from `ow_last_simulation_v1`
  // was written by whatever build the reader had last week.
  const hasWarnings =
    (complexity.warnings?.length ?? 0) > 0 || (passage.warnings?.length ?? 0) > 0;

  return (
    <div className="animate-fade-in">
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--ow-line)" }}>
        <PlanHeaderRow />
      </div>

      <RecomputeBar
        onClick={compute}
        style={{
          background: isStale ? "var(--ow-accent)" : "var(--ow-bg-2)",
          color: isStale ? "#fff" : "var(--ow-fg-1)",
          border: `1px solid ${isStale ? "transparent" : "var(--ow-line)"}`,
        }}
      />

      {/* Récap compact: click to edit departure / archetype inline. */}
      <ResultsAnchor />
      <RecapButton
        primary={`${timeAnchor === "arrival" ? "Arrivée" : "Départ"} : ${capitalise(fmtDay(departure))} · ${fmtClock(departure)}`}
        secondary={boatLabel}
        isOpen={isEditingParams}
        onClick={() => setIsEditingParams((v) => !v)}
      />
      {isEditingParams && (
        <div className="px-4 py-3 space-y-3" style={{ borderBottom: "1px solid var(--ow-line)", background: "var(--ow-bg-2)" }}>
          <TimeAnchorToggle value={timeAnchor} onChange={actions.setTimeAnchor} />
          <DepartureSlider />
          <ArchetypeSelector />
        </div>
      )}

      {/* Total route stats (Distance / Durée / Arrivée + segment bar).
          Desktop only: on mobile the floating overlay (PlanHeroStats) stays
          the single source of truth for these totals, per the b90a5bf
          decision. Hidden entirely when the route was edited without
          recalculating, same rule as the mobile overlay. */}
      {!isStale && (
        <div className="hidden lg:block px-4 py-3.5" style={{ borderBottom: "1px solid var(--ow-line)" }}>
          <HeroStats passage={passage} />
        </div>
      )}

      {hasWarnings && (
        <div className="px-4 py-2.5 space-y-1.5" style={{ borderBottom: "1px solid var(--ow-line)" }}>
          {complexity.warnings?.map((w, i) => <Warn key={i}>{w.message}</Warn>)}
          {passage.warnings?.map((w, i) => <Warn key={`pw-${i}`}>{w}</Warn>)}
        </div>
      )}

      {/* Legs. Click any row to see the build-up.
          Hidden while the plan is stale: re-mapping old segments to a freshly
          edited waypoint list is unsafe (cf. aggregateLegs's index juggling)
          and a silent gray-out could be missed on a quick glance. Showing a
          placeholder is plainer and forces a recompute before the user reads
          numbers that no longer match the route on the map. */}
      {isStale ? (
        <StalePlaceholder>
          Itinéraire modifié. Cliquez sur Recalculer pour mettre à jour les détails.
        </StalePlaceholder>
      ) : (
        <LegList passage={passage} />
      )}

      {forecastUpdatedAt && (
        <p className="px-4 py-2 text-[10px]" style={{ color: "var(--ow-fg-2)", borderTop: "1px solid var(--ow-line)" }}>
          Données fraîches au {fmtClock(forecastUpdatedAt)} · Open-Meteo.com (CC BY 4.0)
        </p>
      )}
    </div>
  );
}
