// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The settings of the departure axis, at the top of its list and always
 * on screen: « les prochaines 24 h / 48 h / 3 j / 7 j / 12 j » from the
 * plan's departure, and « toutes les 1 h / 3 h / 6 h / 12 h ». A tap on a
 * chip sets the sweep and recomputes at once; a span proposes its own
 * step again. The exact dates stay an adjustment under a link, as two
 * plain date-time fields applied with a button. No count of slots: the
 * head says it once the sweep has run.
 */

import { useMemo, useState } from "react";
import { usePlan } from "../session/planContext";
import { useTheme } from "../../design/useTheme";
import { validateSweep, SWEEP_HORIZON_DAYS } from "../validateSweep";
import {
  autoStepHours,
  matchPreset,
  presetLatest,
  spanHours,
  spanLabel,
  STEP_CHOICES_H,
  WINDOW_PRESETS_H,
} from "./slots";
import { ChevronIcon } from "./icons";
import { toNaiveLocal } from "../../domain/datetime";
import { useT } from "../../i18n";

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums whitespace-nowrap transition-colors"
      style={{
        ...MONO,
        background: active ? "var(--ow-accent-soft)" : "var(--ow-bg-2)",
        color: active ? "var(--ow-accent)" : "var(--ow-fg-1)",
        border: `1px solid ${active ? "var(--ow-accent-line)" : "var(--ow-line)"}`,
      }}
    >
      {label}
    </button>
  );
}

/** A row of the settings: a lead word, then the choices as chips. */
function ChoiceRow({ lead, children }: { lead: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs font-semibold mr-0.5" style={{ color: "var(--ow-fg-1)" }}>{lead}</span>
      {children}
    </div>
  );
}

/** One bound as a plain date-time field, the way the plan's own « Ajuster »
    shows one: labelled, visible, and the browser's picker behind it. */
function DateField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="block text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--ow-fg-2)" }}>
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        min={min}
        max={max}
        step={900}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="ow-datetime-input w-full rounded-lg px-2.5 py-2 text-sm font-semibold tabular-nums"
        style={{
          ...MONO,
          background: "var(--ow-bg-2)",
          color: "var(--ow-fg-0)",
          border: "1px solid var(--ow-line)",
          colorScheme: resolvedTheme === "light" ? "light" : "dark",
        }}
      />
    </div>
  );
}

/** The exact bounds, edited on a copy and applied with a button. */
function AdjustDates() {
  const { t } = useT();
  const { state, actions } = usePlan();
  const { sweepEarliest, sweepLatest, sweepIntervalHours } = state;
  const [open, setOpen] = useState(false);
  const [earliest, setEarliest] = useState(sweepEarliest);
  const [latest, setLatest] = useState(sweepLatest);
  // The bounds a picker may land on: from this hour to the end of the
  // forecast.
  const { min, max } = useMemo(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return {
      min: toNaiveLocal(now),
      max: toNaiveLocal(new Date(now.getTime() + SWEEP_HORIZON_DAYS * 86_400_000)),
    };
  }, []);
  const validation = validateSweep(earliest, latest, sweepIntervalHours);
  const changed = earliest !== sweepEarliest || latest !== sweepLatest;
  const canApply = validation.ok && changed;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          // Opening starts from the sweep as it stands.
          setEarliest(sweepEarliest);
          setLatest(sweepLatest);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex items-center gap-1 text-[11px] font-semibold underline underline-offset-2"
        style={{ color: "var(--ow-fg-2)" }}
      >
        {t("panel.window.adjustDates")}
        <ChevronIcon direction={open ? "down" : "right"} size={9} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <DateField id="ow-window-from" label={t("panel.window.from")} value={earliest} min={min} max={max} onChange={setEarliest} />
            <DateField id="ow-window-to" label={t("panel.window.to")} value={latest} min={min} max={max} onChange={setLatest} />
          </div>
          {!validation.ok && validation.message && (
            <p className="text-[11px]" style={{ color: "var(--ow-warn)" }}>{validation.message}</p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                actions.applySweep({ earliest, latest, intervalHours: sweepIntervalHours });
                setOpen(false);
              }}
              disabled={!canApply}
              className="rounded-lg px-4 py-2 text-xs font-bold"
              style={{
                background: canApply ? "var(--ow-accent)" : "var(--ow-bg-2)",
                color: canApply ? "var(--ow-on-accent)" : "var(--ow-fg-3)",
                border: `1px solid ${canApply ? "transparent" : "var(--ow-line-2)"}`,
                cursor: canApply ? "pointer" : "not-allowed",
              }}
            >
              {t("panel.window.apply")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WindowChips() {
  const { t } = useT();
  const { state, actions } = usePlan();
  const { sweepEarliest, sweepLatest, sweepIntervalHours, departure } = state;
  const preset = matchPreset(sweepEarliest, sweepLatest);
  return (
    <div className="px-4 pt-1 pb-2.5 space-y-2" style={{ borderBottom: "1px solid var(--ow-line)" }}>
      <ChoiceRow lead={t("panel.window.lead")}>
        {WINDOW_PRESETS_H.map((h) => (
          <Chip
            key={h}
            label={spanLabel(h)}
            active={preset === h}
            onClick={() => {
              // From the plan's departure, at the step the span proposes.
              const latest = presetLatest(departure, h, Date.now());
              actions.applySweep({
                earliest: departure,
                latest,
                intervalHours: autoStepHours(spanHours(departure, latest)),
              });
            }}
          />
        ))}
      </ChoiceRow>
      <ChoiceRow lead={t("panel.window.every")}>
        {STEP_CHOICES_H.map((h) => (
          <Chip
            key={h}
            label={spanLabel(h)}
            active={sweepIntervalHours === h}
            onClick={() =>
              actions.applySweep({ earliest: sweepEarliest, latest: sweepLatest, intervalHours: h })
            }
          />
        ))}
      </ChoiceRow>
      <AdjustDates />
    </div>
  );
}
