// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The widths of the table of an open leg's steps, apart from the component
 * so the layout around it can size itself on them (the card beside the
 * table on a wide panel).
 */

/** Width of a step's column. Five of them and the labels fit the panel;
    past that the table scrolls sideways under its sticky labels. */
export const COL_PX = 56;

/** Narrowest label column; the widest label sets it in practice. */
export const LABEL_MIN_PX = 52;

/** Width the table takes without scrolling, its labels' slack included. */
export function stepTableWidthPx(n: number): number {
  return LABEL_MIN_PX + 8 + n * COL_PX;
}
