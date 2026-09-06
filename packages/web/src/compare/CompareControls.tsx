// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useEffect, useState } from "react";
import { useBackDismiss } from "../hooks/useBackDismiss";
import { useT } from "../i18n";
import {
  clampWindow,
  MIN_WINDOW_H,
  RESOLUTIONS,
  WINDOW_PRESETS,
  type HourWindow,
  type Resolution,
} from "./data";

// The settings row of the comparison page, in the design's words: the step
// is a segmented control, the sea is a switch and not a tab, the window is a
// chip that opens presets and two sliders, the spots chip opens the list.

const CHIP =
  "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap border cursor-pointer transition-colors";

function chipPadding(small: boolean): string {
  return small ? "px-2.5 py-[5px] text-[11px]" : "px-3 py-1.5 text-[12.5px]";
}

// ── Step ─────────────────────────────────────────────────────────────────────

interface StepProps {
  value: Resolution;
  onChange: (res: Resolution) => void;
  small: boolean;
}

export function StepSegment({ value, onChange, small }: StepProps) {
  const { t } = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("compare.controls.resLabel")}
      className="inline-flex gap-0.5 p-0.5 rounded-full border"
      style={{ background: "var(--ow-bg-2)", borderColor: "var(--ow-line)" }}
    >
      {RESOLUTIONS.map((res) => {
        const on = res === value;
        return (
          <button
            key={res}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(res)}
            className={`rounded-full whitespace-nowrap cursor-pointer transition-colors ${
              small ? "px-2.5 py-1 text-[11px]" : "px-[13px] py-1.5 text-[12.5px]"
            } ${on ? "font-semibold" : "font-medium"}`}
            style={{
              background: on ? "var(--ow-accent-strong)" : "transparent",
              color: on ? "var(--ow-on-accent)" : "var(--ow-fg-1)",
            }}
          >
            {t("compare.controls.res", { hours: res })}
          </button>
        );
      })}
    </div>
  );
}

// ── Sea band switch ──────────────────────────────────────────────────────────

interface WaveChipProps {
  on: boolean;
  onChange: (on: boolean) => void;
  small: boolean;
}

export function WaveChip({ on, onChange, small }: WaveChipProps) {
  const { t } = useT();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`${CHIP} ${chipPadding(small)} ${on ? "font-semibold" : "font-medium"}`}
      style={{
        background: on ? "var(--ow-accent-soft)" : "transparent",
        color: on ? "var(--ow-accent)" : "var(--ow-fg-2)",
        borderColor: on ? "var(--ow-accent-line)" : "var(--ow-line-2)",
      }}
    >
      <span aria-hidden="true" className="leading-none" style={{ fontSize: small ? 12 : 13 }}>
        {on ? "−" : "+"}
      </span>
      {t("compare.controls.waves")}
    </button>
  );
}

// ── Hour window ──────────────────────────────────────────────────────────────

function ChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

interface WindowChipProps {
  win: HourWindow;
  onChange: (win: HourWindow) => void;
  small: boolean;
}

export function WindowChip({ win, onChange, small }: WindowChipProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useBackDismiss(open, close);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const label = t("compare.window.chip", { start: win[0], end: win[1] });
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t("compare.window.label")}: ${label}`}
        onClick={() => setOpen((v) => !v)}
        className={`${CHIP} ${chipPadding(small)} tabular-nums`}
        style={{
          fontFamily: "var(--ow-font-mono)",
          background: "transparent",
          color: "var(--ow-fg-1)",
          borderColor: "var(--ow-line-2)",
        }}
      >
        {label}
        <span style={{ color: "var(--ow-fg-2)" }}>
          <ChevronDown />
        </span>
      </button>
      {open && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-[30]" onClick={close} />
          <div
            role="dialog"
            aria-label={t("compare.window.label")}
            className="absolute right-0 z-[40] flex flex-col gap-2 p-2.5 rounded-lg"
            style={{
              top: "100%",
              marginTop: 5,
              width: 232,
              background: "var(--ow-bg-1)",
              border: "1px solid var(--ow-line-2)",
              boxShadow: "var(--ow-shadow-2)",
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              {WINDOW_PRESETS.map((preset) => {
                const on = preset[0] === win[0] && preset[1] === win[1];
                return (
                  <button
                    key={preset.join("-")}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange(preset)}
                    className="rounded-full px-[9px] py-1 text-[10.5px] font-semibold border cursor-pointer tabular-nums"
                    style={{
                      fontFamily: "var(--ow-font-mono)",
                      background: on ? "var(--ow-accent-strong)" : "transparent",
                      color: on ? "var(--ow-on-accent)" : "var(--ow-fg-1)",
                      borderColor: on ? "transparent" : "var(--ow-line-2)",
                    }}
                  >
                    {t("compare.window.chip", { start: preset[0], end: preset[1] })}
                  </button>
                );
              })}
            </div>
            <Slider
              label={t("compare.window.start")}
              min={0}
              max={24 - MIN_WINDOW_H}
              value={win[0]}
              onChange={(v) => onChange(clampWindow([v, Math.max(win[1], v + MIN_WINDOW_H)]))}
              text={t("compare.window.hour", { hour: win[0] })}
            />
            <Slider
              label={t("compare.window.end")}
              min={MIN_WINDOW_H}
              max={24}
              value={win[1]}
              onChange={(v) => onChange(clampWindow([Math.min(win[0], v - MIN_WINDOW_H), v]))}
              text={t("compare.window.hour", { hour: win[1] })}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
  text,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  text: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span
        className="text-[9px] font-semibold uppercase shrink-0"
        style={{ width: 34, letterSpacing: "0.08em", color: "var(--ow-fg-2)" }}
      >
        {label}
      </span>
      <input
        className="ow-range flex-1"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span
        className="text-[11px] text-right tabular-nums shrink-0"
        style={{ width: 26, fontFamily: "var(--ow-font-mono)" }}
      >
        {text}
      </span>
    </label>
  );
}

// ── Spots chip (phone) ───────────────────────────────────────────────────────

function MenuIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function TargetIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface SpotsChipProps {
  picked: number;
  total: number;
  open: boolean;
  onClick: () => void;
  small: boolean;
}

/** Changes glyph and shows the count as soon as a spot is left out. */
export function SpotsChip({ picked, total, open, onClick, small }: SpotsChipProps) {
  const { t } = useT();
  const filtered = picked < total;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={t("compare.spots.title")}
      onClick={onClick}
      className={`${CHIP} ${chipPadding(small)} gap-[5px]`}
      style={{
        background: filtered ? "var(--ow-accent-soft)" : "transparent",
        color: filtered ? "var(--ow-accent)" : "var(--ow-fg-2)",
        borderColor: filtered ? "var(--ow-accent-line)" : "var(--ow-line-2)",
      }}
    >
      {filtered ? <TargetIcon /> : <MenuIcon />}
      {filtered ? t("compare.spots.chipCount", { picked, total }) : t("compare.spots.chip")}
    </button>
  );
}

export { TargetIcon };
