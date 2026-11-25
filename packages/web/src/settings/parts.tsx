// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * The building blocks of every settings view: grouped rows on a raised
 * surface, a title above the group and a note under it, the way the system
 * settings of a phone read. The views compose these and nothing else, so the
 * look stays one across the views the later lots add.
 */

export function SettingsGroupTitle({ children }: { children: ReactNode }) {
  return <h3 className="ow-settings-group-title">{children}</h3>;
}

/** A group of rows. A list of choices is `SettingsRadioList` instead. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="ow-settings-group">{children}</div>;
}

/** The note under a group, or at the foot of a view (`footnote`). */
export function SettingsNote({ children, footnote = false }: { children: ReactNode; footnote?: boolean }) {
  return <p className={`ow-settings-note${footnote ? " ow-settings-footnote" : ""}`}>{children}</p>;
}

function RowText({ label, subtitle, labelId, subtitleId, truncate }: {
  label: ReactNode;
  subtitle?: ReactNode;
  labelId?: string;
  subtitleId?: string;
  truncate?: boolean;
}) {
  return (
    <span className="ow-settings-row-text">
      <span id={labelId} className="block">{label}</span>
      {subtitle != null && (
        <span id={subtitleId} className={`ow-settings-row-sub${truncate ? " is-truncated" : ""}`}>
          {subtitle}
        </span>
      )}
    </span>
  );
}

const Chevron = (
  <svg className="ow-settings-chevron" width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.5 1.5 6.5 6.5 1.5 11.5" />
  </svg>
);

const Check = (
  <svg className="ow-settings-check" width="17" height="13" viewBox="0 0 17 13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.5 7 6 11.5 15.5 1.5" />
  </svg>
);

/** A row holding a control of its own on the right (a segmented choice). */
export function SettingsRow({ label, subtitle, labelId, children }: {
  label: ReactNode;
  subtitle?: ReactNode;
  labelId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="ow-settings-row">
      <RowText label={label} subtitle={subtitle} labelId={labelId} />
      {children}
    </div>
  );
}

/** A row that opens another view: label, optional subtitle and value, ›. */
export function SettingsLinkRow({ label, subtitle, value, onOpen }: {
  label: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="ow-settings-row" onClick={onOpen}>
      <RowText label={label} subtitle={subtitle} truncate />
      {value != null && <span className="ow-settings-row-value">{value}</span>}
      {Chevron}
    </button>
  );
}

/** An on/off setting. The whole row is the switch, a 52 px target. */
export function SettingsSwitchRow({ label, subtitle, checked, onChange }: {
  label: ReactNode;
  subtitle?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-l`}
      aria-describedby={subtitle != null ? `${id}-s` : undefined}
      className="ow-settings-row"
      onClick={() => onChange(!checked)}
    >
      <RowText label={label} subtitle={subtitle} labelId={`${id}-l`} subtitleId={`${id}-s`} />
      <span className="ow-settings-switch" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** `lang` of the label, for a choice written in its own language. */
  lang?: string;
}

/**
 * Arrow keys move the choice within a radio group and the focus with it,
 * one tab stop for the whole group (WAI-ARIA radio group pattern).
 */
function useRovingRadios<T extends string>(choices: readonly Choice<T>[], value: T, onChange: (v: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + choices.length) % choices.length;
    onChange(choices[next].value);
    refs.current[next]?.focus();
  };
  const tabIndex = (v: T) => (v === value || (!choices.some((c) => c.value === value) && v === choices[0].value) ? 0 : -1);
  return { refs, onKeyDown, tabIndex };
}

/** Two or three short choices side by side, inside a row. Its columns are
    as wide as the longest choice, so no translation is ever cut. */
export function SettingsSegmented<T extends string>({ label, choices, value, onChange, minWidth }: {
  /** Accessible name of the group: the label of the row it sits in. */
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Smallest width of the control in px; the row's label takes the rest. */
  minWidth: number;
}) {
  const { refs, onKeyDown, tabIndex } = useRovingRadios(choices, value, onChange);
  return (
    <div role="radiogroup" aria-label={label} className="ow-settings-segment" style={{ minWidth }}>
      <span className="ow-settings-segment-track" aria-hidden="true" />
      {choices.map((c, i) => (
        <button
          key={c.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={c.value === value}
          tabIndex={tabIndex(c.value)}
          lang={c.lang}
          className="ow-settings-segment-btn"
          onClick={() => onChange(c.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A list of choices, one per row, the chosen one ticked. */
export function SettingsRadioList<T extends string>({ label, choices, value, onChange }: {
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { refs, onKeyDown, tabIndex } = useRovingRadios(choices, value, onChange);
  return (
    <div role="radiogroup" aria-label={label} className="ow-settings-group">
      {choices.map((c, i) => (
        <button
          key={c.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={c.value === value}
          tabIndex={tabIndex(c.value)}
          lang={c.lang}
          className="ow-settings-row"
          onClick={() => onChange(c.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          <span className="ow-settings-row-text">{c.label}</span>
          {c.value === value && Check}
        </button>
      ))}
    </div>
  );
}
