// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The one arrow of the tables: thin and filled, pointing where the flow
 * goes. Wind and sea are named by where they come from, the current by
 * where it sets, so the caller turns a « from » into a « to » (+180°) and
 * the arrow itself knows one convention only. Decorative: the figure beside
 * it, or the cell's label, carries the information for a screen reader.
 */
export function FlowArrow({
  toDeg,
  size = 12,
  color = "var(--ow-fg-1)",
}: {
  /** True bearing the arrow points to, in degrees. */
  toDeg: number;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="shrink-0"
      style={{ transform: `rotate(${toDeg}deg)` }}
    >
      <path d="M8 1.5 13 14.5 8 10.8 3 14.5Z" fill={color} />
    </svg>
  );
}
