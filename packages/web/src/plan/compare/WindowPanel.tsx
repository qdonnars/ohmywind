// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The settings of the departure axis: the window the departures are taken
 * from, and how often.
 *
 * One row is the summary and the button (« Fenêtre · Les prochaines 48 h ·
 * toutes les 3 h · Régler »). Unfolded, the panel asks the two things one
 * actually thinks in, each as a row of buttons: « les prochaines 24 h /
 * 48 h / 3 j / 7 j / 12 j » from the plan's departure, and « toutes les
 * 1 h / 3 h / 6 h / 12 h », proposed from the span and one tap away from
 * another value. The exact dates are an adjustment kept under a link, as
 * two plain date-time fields. No count of slots: the head says it once
 * the sweep has run. The panel edits a copy: « Annuler » drops it, and
 * « Appliquer » sets the sweep and recomputes in one go.
 *
 * Pinned under the list on a wide screen, the panel unfolds above the row;
 * in the flow of a phone's list, below it.
 */

import { useCallback, useMemo, useState } from "react";
import { usePlan } from "../session/planContext";
import { useBackDismiss } from "../../hooks/useBackDismiss";
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
  type SweepParams,
} from "./slots";
import { ContextRow } from "./ContextRow";
import { ChevronIcon, ClockIcon } from "./icons";
import { capitalise, fmtClock, fmtDay, toNaiveLocal } from "../../domain/datetime";
import { useT } from "../../i18n";

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

/** The row, and the panel it unfolds. */
export function WindowSettings({ placement = "above" }: { placement?: "above" | "below" }) {
  const { t } = useT();
  const { state, actions } = usePlan();
  const { sweepEarliest, sweepLatest, sweepIntervalHours, departure } = state;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // Android's back closes the panel rather than the comparison (issue #300).
  useBackDismiss(open, close);

  const preset = matchPreset(sweepEarliest, sweepLatest);
  const when =
    preset !== null && sweepEarliest === departure
      ? t("panel.window.next", { span: spanLabel(preset) })
      : `${capitalise(fmtDay(sweepEarliest))} ${fmtClock(sweepEarliest)} → ${capitalise(fmtDay(sweepLatest))} ${fmtClock(sweepLatest)}`;

  const panel = open && (
    <WindowPanel
      initial={{ earliest: sweepEarliest, latest: sweepLatest, intervalHours: sweepIntervalHours }}
      onCancel={close}
      onApply={(sweep) => {
        actions.applySweep(sweep);
        close();
      }}
    />
  );
  return (
    <>
      {placement === "above" && panel}
      <ContextRow
        icon={<ClockIcon />}
        label={t("panel.window.label")}
        value={`${when} · ${t("panel.window.everyValue", { step: spanLabel(sweepIntervalHours) })}`}
        action={open ? t("common.close") : t("panel.window.set")}
        chevron="down"
        open={open}
        onClick={() => setOpen((v) => !v)}
      />
      {placement === "below" && panel}
    </>
  );
}

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

/** A row of the panel: a lead word, then the choices as chips. */
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

export function WindowPanel({
  initial,
  onCancel,
  onApply,
}: {
  initial: SweepParams;
  onCancel: () => void;
  onApply: (sweep: SweepParams) => void;
}) {
  const { t } = useT();
  const [earliest, setEarliest] = useState(initial.earliest);
  const [latest, setLatest] = useState(initial.latest);
  const [manualStep, setManualStep] = useState<number | null>(() => {
    const auto = autoStepHours(spanHours(initial.earliest, initial.latest));
    return initial.intervalHours === auto ? null : initial.intervalHours;
  });
  const [datesOpen, setDatesOpen] = useState(false);

  const span = spanHours(earliest, latest);
  const step = manualStep ?? autoStepHours(span);
  const preset = matchPreset(earliest, latest);
  const validation = validateSweep(earliest, latest, step);

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

  return (
    <div
      className="px-4 pt-3 pb-3.5 space-y-3"
      style={{ background: "var(--ow-bg-1)", borderTop: "1px solid var(--ow-line)" }}
    >
      <div className="text-[9px] uppercase tracking-widest font-bold" style={{ ...MONO, color: "var(--ow-fg-3)" }}>
        {t("panel.window.title")}
      </div>

      <ChoiceRow lead={t("panel.window.lead")}>
        {WINDOW_PRESETS_H.map((h) => (
          <Chip
            key={h}
            label={spanLabel(h)}
            active={preset === h}
            onClick={() => {
              setLatest(presetLatest(earliest, h, Date.now()));
              // A new span proposes its own step again.
              setManualStep(null);
            }}
          />
        ))}
      </ChoiceRow>

      <ChoiceRow lead={t("panel.window.every")}>
        {STEP_CHOICES_H.map((h) => (
          <Chip
            key={h}
            label={spanLabel(h)}
            active={step === h}
            onClick={() => setManualStep(h === autoStepHours(span) ? null : h)}
          />
        ))}
      </ChoiceRow>

      <div>
        <button
          type="button"
          onClick={() => setDatesOpen((v) => !v)}
          aria-expanded={datesOpen}
          className="flex items-center gap-1 text-[11px] font-semibold underline underline-offset-2"
          style={{ color: "var(--ow-fg-2)" }}
        >
          {t("panel.window.adjustDates")}
          <ChevronIcon direction={datesOpen ? "down" : "right"} size={9} />
        </button>
        {datesOpen && (
          <div className="flex gap-2 mt-2">
            <DateField id="ow-window-from" label={t("panel.window.from")} value={earliest} min={min} max={max} onChange={setEarliest} />
            <DateField id="ow-window-to" label={t("panel.window.to")} value={latest} min={min} max={max} onChange={setLatest} />
          </div>
        )}
        {!validation.ok && validation.message && (
          <p className="text-[11px] mt-2" style={{ color: "var(--ow-warn)" }}>{validation.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="flex-1 text-[10.5px] leading-snug" style={{ color: "var(--ow-fg-3)" }}>
          {t("panel.window.note")}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3.5 py-2 text-xs font-semibold"
          style={{ background: "var(--ow-bg-2)", color: "var(--ow-fg-1)", border: "1px solid var(--ow-line)" }}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onApply({ earliest, latest, intervalHours: step })}
          disabled={!validation.ok}
          className="rounded-lg px-4 py-2 text-xs font-bold"
          style={{
            background: validation.ok ? "var(--ow-accent)" : "var(--ow-bg-2)",
            color: validation.ok ? "var(--ow-on-accent)" : "var(--ow-fg-3)",
            border: `1px solid ${validation.ok ? "transparent" : "var(--ow-line-2)"}`,
            cursor: validation.ok ? "pointer" : "not-allowed",
          }}
        >
          {t("panel.window.apply")}
        </button>
      </div>
    </div>
  );
}
