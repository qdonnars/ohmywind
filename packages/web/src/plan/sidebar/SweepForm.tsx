// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo } from "react";
import { toNaiveLocal } from "../session/initial";
import { DepartureRangeSlider } from "./DepartureRangeSlider";
import { usePlan } from "../session/planContext";
import { validateSweep } from "../validateSweep";

// ── SweepForm ─────────────────────────────────────────────────────────────────

const SWEEP_INTERVALS: { value: number; label: string }[] = [
  { value: 1, label: "Toutes les heures" },
  { value: 3, label: "Toutes les 3h" },
  { value: 6, label: "Toutes les 6h" },
];

export function SweepForm() {
  const { state, actions } = usePlan();
  const { sweepEarliest: earliest, sweepLatest: latest, sweepIntervalHours: intervalHours } = state;
  const onEarliestChange = actions.setSweepEarliest;
  const onLatestChange = actions.setSweepLatest;
  const onIntervalChange = actions.setSweepInterval;
  // Convert ISO local strings <-> hours-from-now so the slider can drive them.
  const anchor = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  }, []);
  function isoToHours(iso: string): number {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.round((t - anchor.getTime()) / 3_600_000);
  }
  function hoursToIso(h: number): string {
    return toNaiveLocal(new Date(anchor.getTime() + h * 3_600_000));
  }

  const earliestHours = Math.max(0, isoToHours(earliest));
  const latestHours = Math.max(earliestHours + 1, isoToHours(latest));

  const validation = validateSweep(earliest, latest, intervalHours);

  return (
    <div className="space-y-3">
      <DepartureRangeSlider
        earliestHours={earliestHours}
        latestHours={latestHours}
        onChange={(e, l) => {
          onEarliestChange(hoursToIso(e));
          onLatestChange(hoursToIso(l));
        }}
      />
      {!validation.ok && validation.message && (
        <p className="text-[11px]" style={{ color: "var(--ow-warn)" }}>
          {validation.message}
        </p>
      )}

      <div>
        <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--ow-fg-2)" }}>
          Pas d'échantillonnage
        </label>
        <div className="flex gap-1.5">
          {SWEEP_INTERVALS.map(({ value, label }) => {
            const active = intervalHours === value;
            return (
              <button
                key={value}
                onClick={() => onIntervalChange(value)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: active ? "var(--ow-accent-soft)" : "var(--ow-bg-2)",
                  color: active ? "var(--ow-accent)" : "var(--ow-fg-1)",
                  border: `1px solid ${active ? "var(--ow-accent)" : "var(--ow-line-2)"}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
