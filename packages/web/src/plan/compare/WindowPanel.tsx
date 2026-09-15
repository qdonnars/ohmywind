// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The settings of the departure axis: the window the departures are taken
 * from, and how many of them.
 *
 * One pinned row is the summary and the button (« Fenêtre · Les prochaines
 * 48 h · 17 créneaux · Régler »). Unfolded, the panel shows the two bounds
 * as values one taps, spans as chips (« je veux partir dans les deux
 * jours »), and the step already chosen from the span, with a « Changer »
 * for whoever cares. The panel edits a copy: « Annuler » drops it, and
 * « Appliquer » sets the sweep and recomputes in one go.
 *
 * The dual-thumb slider that used to ask for the bounds was imprecise under
 * a finger and unreadable over two weeks; the step buttons asked a question
 * the reader had no way to answer.
 */

import { useCallback, useMemo, useState } from "react";
import { usePlan } from "../session/planContext";
import { useBackDismiss } from "../../hooks/useBackDismiss";
import { validateSweep, SWEEP_HORIZON_DAYS } from "../validateSweep";
import {
  autoStepHours,
  matchPreset,
  presetLatest,
  spanHours,
  spanLabel,
  windowCount,
  STEP_CHOICES_H,
  WINDOW_PRESETS_H,
  type SweepParams,
} from "./slots";
import { ContextRow } from "./ContextRow";
import { ChevronIcon, ClockIcon } from "./icons";
import { capitalise, fmtClock, fmtDay, toNaiveLocal } from "../../domain/datetime";
import { rich, useT } from "../../i18n";

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

/** The pinned row, and the panel it unfolds. */
export function WindowSettings() {
  const { t, tn } = useT();
  const { state, actions } = usePlan();
  const { sweepEarliest, sweepLatest, sweepIntervalHours, windows, isStale, departure } = state;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // Android's back closes the panel rather than the comparison (issue #300).
  useBackDismiss(open, close);

  const span = spanHours(sweepEarliest, sweepLatest);
  const preset = matchPreset(sweepEarliest, sweepLatest);
  // The windows on screen, or what the settings would produce.
  const count =
    !isStale && windows && windows.length > 0 ? windows.length : windowCount(span, sweepIntervalHours);
  const when =
    preset !== null && sweepEarliest === departure
      ? t("panel.window.next", { span: spanLabel(preset) })
      : `${capitalise(fmtDay(sweepEarliest))} ${fmtClock(sweepEarliest)} → ${capitalise(fmtDay(sweepLatest))} ${fmtClock(sweepLatest)}`;

  return (
    <>
      {open && (
        <WindowPanel
          initial={{ earliest: sweepEarliest, latest: sweepLatest, intervalHours: sweepIntervalHours }}
          departure={departure}
          onCancel={close}
          onApply={(sweep) => {
            actions.applySweep(sweep);
            close();
          }}
        />
      )}
      <ContextRow
        icon={<ClockIcon />}
        label={t("panel.window.label")}
        value={`${when} · ${tn("panel.compare.slots", count)}`}
        action={open ? t("common.close") : t("panel.window.set")}
        chevron="down"
        open={open}
        onClick={() => setOpen((v) => !v)}
      />
    </>
  );
}

function Chip({
  label,
  active,
  onClick,
  sub,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full text-[11.5px] font-semibold whitespace-nowrap transition-colors"
      style={{
        padding: sub ? "6px 0" : "6px 11px",
        flex: sub ? 1 : undefined,
        borderRadius: sub ? 9 : 999,
        background: active ? "var(--ow-accent-soft)" : "var(--ow-bg-2)",
        color: active ? "var(--ow-accent)" : "var(--ow-fg-1)",
        border: `1px solid ${active ? "var(--ow-accent-line)" : "var(--ow-line)"}`,
      }}
    >
      <span className="block tabular-nums" style={MONO}>{label}</span>
      {sub && (
        <span className="block text-[9.5px] mt-0.5 tabular-nums" style={{ ...MONO, color: "var(--ow-fg-2)" }}>
          {sub}
        </span>
      )}
    </button>
  );
}

/** One bound of the window: a value one taps, with the native picker
    behind it. The input covers the card unseen; `showPicker` opens it on
    the click for the browsers that would only focus a field. */
export function BoundField({
  label,
  value,
  hint,
  min,
  max,
  ariaLabel,
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  min: string;
  max: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className="relative flex-1 min-w-0 rounded-[10px] px-2.5 py-2 cursor-pointer"
      style={{ background: "var(--ow-bg-2)", border: "1px solid var(--ow-line)" }}
    >
      <span className="block text-[10px] mb-0.5" style={{ color: "var(--ow-fg-3)" }}>{label}</span>
      <span className="block text-[13px] font-bold tabular-nums" style={{ ...MONO, color: "var(--ow-fg-0)" }}>
        {capitalise(fmtDay(value))}
      </span>
      <span className="block text-[13px] font-bold tabular-nums" style={{ ...MONO, color: "var(--ow-fg-0)" }}>
        {fmtClock(value)}
      </span>
      {hint && <span className="block text-[10px] mt-0.5" style={{ color: "var(--ow-fg-3)" }}>{hint}</span>}
      <input
        type="datetime-local"
        value={value}
        min={min}
        max={max}
        step={900}
        aria-label={ariaLabel}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        onClick={(e) => {
          try {
            (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
          } catch {
            // Not allowed here: the field still takes a typed value.
          }
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </label>
  );
}

export function WindowPanel({
  initial,
  departure,
  onCancel,
  onApply,
}: {
  initial: SweepParams;
  /** The plan's departure, which the first bound is expected to be. */
  departure: string;
  onCancel: () => void;
  onApply: (sweep: SweepParams) => void;
}) {
  const { t, tn } = useT();
  const [earliest, setEarliest] = useState(initial.earliest);
  const [latest, setLatest] = useState(initial.latest);
  const [manualStep, setManualStep] = useState<number | null>(() => {
    const auto = autoStepHours(spanHours(initial.earliest, initial.latest));
    return initial.intervalHours === auto ? null : initial.intervalHours;
  });
  const [stepOpen, setStepOpen] = useState(manualStep !== null);

  const span = spanHours(earliest, latest);
  const step = manualStep ?? autoStepHours(span);
  const count = windowCount(span, step);
  const preset = matchPreset(earliest, latest);
  const validation = validateSweep(earliest, latest, step);
  const daysOut = Math.round(span / 24);

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
      className="px-4 pt-3 pb-3.5 space-y-3.5"
      style={{ background: "var(--ow-bg-1)", borderTop: "1px solid var(--ow-line)" }}
    >
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[9px] uppercase tracking-widest font-bold" style={{ ...MONO, color: "var(--ow-fg-3)" }}>
            {t("panel.window.title")}
          </span>
          <span className="ml-auto text-[10.5px] font-semibold tabular-nums" style={{ ...MONO, color: "var(--ow-accent)" }}>
            {spanLabel(span)}
          </span>
        </div>
        <div className="flex gap-2 mb-2">
          <BoundField
            label={t("panel.window.from")}
            value={earliest}
            hint={earliest === departure ? t("panel.window.fromHint") : undefined}
            min={min}
            max={max}
            ariaLabel={t("panel.window.fromAria")}
            onChange={setEarliest}
          />
          <BoundField
            label={t("panel.window.to")}
            value={latest}
            hint={t("panel.departure.dayPlus", { count: daysOut })}
            min={min}
            max={max}
            ariaLabel={t("panel.window.toAria")}
            onChange={setLatest}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11.5px] font-semibold mr-0.5" style={{ color: "var(--ow-fg-1)" }}>
            {t("panel.window.lead")}
          </span>
          {WINDOW_PRESETS_H.map((h) => (
            <Chip
              key={h}
              label={spanLabel(h)}
              active={preset === h}
              onClick={() => setLatest(presetLatest(earliest, h, Date.now()))}
            />
          ))}
        </div>
        {!validation.ok && validation.message && (
          <p className="text-[11px] mt-2" style={{ color: "var(--ow-warn)" }}>{validation.message}</p>
        )}
      </div>

      {/* The step, with its cost: the one setting that decides the computing
          time. Proposed from the span, changeable for whoever wants to. */}
      <div className="rounded-[10px]" style={{ background: "var(--ow-bg-2)", border: "1px solid var(--ow-line)" }}>
        <div className="flex items-center gap-2 px-2.5 py-2">
          <span className="shrink-0 flex" style={{ color: "var(--ow-accent)" }}><ClockIcon size={14} /></span>
          <span className="min-w-0 text-[11.5px] leading-snug" style={{ color: "var(--ow-fg-1)" }}>
            {rich(
              t("panel.window.step", { slots: tn("panel.compare.slots", count), step: spanLabel(step) }),
              { b: (c) => <b className="tabular-nums" style={{ ...MONO, color: "var(--ow-fg-0)" }}>{c}</b> },
            )}
          </span>
          <button
            type="button"
            onClick={() => setStepOpen((v) => !v)}
            aria-expanded={stepOpen}
            className="ml-auto shrink-0 flex items-center gap-1 text-[11.5px] font-semibold whitespace-nowrap"
            style={{ color: "var(--ow-accent)" }}
          >
            {t("panel.window.change")}
            <ChevronIcon direction={stepOpen ? "down" : "right"} size={9} />
          </button>
        </div>
        {stepOpen && (
          <div className="px-2.5 pb-2.5">
            <div className="flex gap-1.5">
              {STEP_CHOICES_H.map((h) => (
                <Chip
                  key={h}
                  label={spanLabel(h)}
                  sub={String(windowCount(span, h))}
                  active={step === h}
                  onClick={() => setManualStep(h === autoStepHours(span) ? null : h)}
                />
              ))}
            </div>
            <p className="text-[10.5px] mt-2 leading-snug" style={{ color: "var(--ow-fg-2)" }}>
              {t("panel.window.cost", { count: windowCount(span, 1) })}
            </p>
          </div>
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
