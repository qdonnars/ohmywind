// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The pieces both lists of « Comparer ce trajet » share, so a departure and
 * an option read with the same marks: the column header that carries the
 * units, and the duration in its pill.
 */

import type { CSSProperties, ReactNode } from "react";
import { ClockIcon } from "./icons";

/** One header cell: the label, then its unit at 3 px, said once here and
    never in the cells. The unit keeps its case under the capitals. */
export function ColumnLabel({ children, unit }: { children: ReactNode; unit?: string }) {
  return (
    <span className="min-w-0">
      {children}
      {/* A break opportunity without a space: « VIENTO kn » stacks in its
          46 px rather than running into the next column. */}
      {unit && <wbr />}
      {unit && <span className="ml-[3px] normal-case tracking-normal font-medium">{unit}</span>}
    </span>
  );
}

/** The header row itself: small capitals in the read grey, on the grid of
    the rows under it. Cells may wrap (a long label stacks over its unit)
    and sit on their last line, so a short label stays level with them. */
export function ColumnHeader({ grid, className, children }: { grid: CSSProperties; className: string; children: ReactNode }) {
  return (
    <div
      className={`items-end text-[9px] font-semibold uppercase tracking-[0.04em] leading-tight ${className}`}
      style={{ ...grid, color: "var(--ow-fg-2)" }}
    >
      {children}
    </div>
  );
}

/** A duration in a bordered pill with a clock: what tells « 13h55 » of
    travel from « 13:55 » on the clock in the next column. */
export function DurationPill({ children }: { children: string }) {
  return (
    <span
      className="justify-self-start max-w-full inline-flex items-center gap-[3px] rounded-md px-[5px] py-px text-xs font-semibold tabular-nums whitespace-nowrap"
      style={{ border: "1px solid var(--ow-line-2)", color: "var(--ow-fg-0)" }}
    >
      <span className="inline-flex shrink-0" style={{ color: "var(--ow-fg-1)" }}>
        <ClockIcon size={10} />
      </span>
      {children}
    </span>
  );
}
