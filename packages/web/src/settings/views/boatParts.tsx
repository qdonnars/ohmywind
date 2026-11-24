// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { Choice } from "../parts";
import "./boat.css";

/**
 * The controls the Bateau views need beyond the shared rows of `../parts`:
 * a row that opens a view and may be unavailable, a choice spanning the
 * whole width whose labels may wrap, a − / + stepper and the row of wind
 * curves. Same surfaces and tokens as the shared rows (`boat.css`).
 */

const Chevron = (
  <svg className="ow-settings-chevron" width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.5 1.5 6.5 6.5 1.5 11.5" />
  </svg>
);

/** A row that opens another view, its value allowed to shrink (a long boat
    name never pushes the label out), and unavailable when `disabled`. */
export function BoatLinkRow({ label, subtitle, value, onOpen, disabled = false, describedBy }: {
  label: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  onOpen: () => void;
  disabled?: boolean;
  /** Id of a note saying why the row is unavailable. */
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      className="ow-settings-row ow-boat-link"
      onClick={onOpen}
      disabled={disabled}
      aria-describedby={describedBy}
    >
      <span className="ow-settings-row-text">
        <span className="block">{label}</span>
        {subtitle != null && <span className="ow-settings-row-sub is-truncated">{subtitle}</span>}
      </span>
      {value != null && <span className="ow-boat-link-value">{value}</span>}
      {Chevron}
    </button>
  );
}

/**
 * Arrow keys move the choice and the focus with it, one tab stop for the
 * group (WAI-ARIA radio group pattern).
 */
function useRoving(count: number, current: number, select: (index: number) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + count) % count;
    select(next);
    refs.current[next]?.focus();
  };
  const tabIndex = (index: number) => (index === (current >= 0 ? current : 0) ? 0 : -1);
  return { refs, onKeyDown, tabIndex };
}

/** Two or three choices across the whole width, each label free to wrap
    onto a second line rather than be cut in a long language. */
export function BoatSegmented<T extends string>({ label, choices, value, onChange, disabled = false }: {
  label: string;
  choices: readonly Choice<T>[];
  /** Null when no choice applies (a locked control shows none chosen). */
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const current = choices.findIndex((c) => c.value === value);
  const { refs, onKeyDown, tabIndex } = useRoving(choices.length, current, (i) => onChange(choices[i].value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className="ow-boat-segment"
      style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
    >
      {choices.map((c, i) => (
        <button
          key={c.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={c.value === value}
          tabIndex={tabIndex(i)}
          disabled={disabled}
          className="ow-boat-segment-btn"
          onClick={() => onChange(c.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

/** − and + around nothing: the value is shown by the row holding it. Each
    button is a 44 px target named for what it does. */
export function BoatStepper({ minusLabel, plusLabel, onMinus, onPlus, canMinus, canPlus }: {
  minusLabel: string;
  plusLabel: string;
  onMinus: () => void;
  onPlus: () => void;
  canMinus: boolean;
  canPlus: boolean;
}) {
  return (
    <span className="ow-boat-stepper">
      <button type="button" aria-label={minusLabel} disabled={!canMinus} onClick={onMinus}>
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M2 7h10" />
        </svg>
      </button>
      <span className="ow-boat-stepper-sep" aria-hidden="true" />
      <button type="button" aria-label={plusLabel} disabled={!canPlus} onClick={onPlus}>
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M2 7h10M7 2v10" />
        </svg>
      </button>
    </span>
  );
}

/** Which wind curve of a polar is drawn or edited: one chip per wind speed,
    a 44 px target around each. */
export function CurveChips({ label, twsKn, selected, onSelect }: {
  label: string;
  twsKn: number[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const active = Math.min(selected, twsKn.length - 1);
  const { refs, onKeyDown, tabIndex } = useRoving(twsKn.length, active, onSelect);
  return (
    <div className="ow-boat-curves">
      <span className="ow-boat-curves-label" aria-hidden="true">
        {label}
      </span>
      <div role="radiogroup" aria-label={label} className="ow-boat-curves-list">
        {twsKn.map((tws, i) => (
          <button
            key={tws}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={i === active}
            tabIndex={tabIndex(i)}
            className="ow-boat-chip"
            onClick={() => onSelect(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span>{tws} kn</span>
          </button>
        ))}
      </div>
    </div>
  );
}
