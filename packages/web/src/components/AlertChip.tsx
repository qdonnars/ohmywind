// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The one way the app says "watch out".
 *
 * There were five: a boxed row in the plan, grey text in the sea column of a
 * leg, « ⚠ Mer Formée » in mono on the leg card, « ⚠1 » on a compared
 * departure, a magenta corner on a compared spot. A reader who had learnt
 * one did not recognise the next. The chip always says what, how much and
 * where (« Mer formée · 1,1–1,4 m »), in the warning ink on the soft warning
 * fill, and it wraps rather than cutting: the German for a following chop
 * is twice the French.
 *
 * The styles are classes (`index.css`, « Alert chip ») and not inline,
 * because the map draws the same chip from an HTML string Leaflet owns.
 */

import type { ReactNode } from "react";

/** The warning triangle, in the current colour. */
export function AlertIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2 14 13H2z" />
      <path d="M8 7v3" />
      <circle cx="8" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function AlertChip({
  children,
  size = "m",
}: {
  children: ReactNode;
  /** `m` is the boxed alert of an unfolded list; `s` sits under a row, or
      counts (« 2 alertes »). */
  size?: "m" | "s";
}) {
  return (
    <span className={`ow-alert-chip${size === "s" ? " ow-alert-chip--s" : ""}`}>
      <span className="ow-alert-chip__icon">
        <AlertIcon />
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/**
 * The alert of a coloured cell: a round marker on its corner, never one more
 * tint in the scale the cell is already painted with. The parent is the
 * positioned box; `label` is what a screen reader hears.
 */
export function CellAlert({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label} title={label} className="ow-cell-alert">
      <AlertIcon />
    </span>
  );
}
