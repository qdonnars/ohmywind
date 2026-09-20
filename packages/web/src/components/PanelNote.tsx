// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ReactNode } from "react";

/**
 * One line of small print under a data panel: which zero the tide heights
 * count from, which source the currents come from.
 *
 * Sits outside the horizontal scroller so it stays put while the timeline
 * scrolls, and is painted like the rows because the whole panel floats over
 * the map. No bottom safe-area inset, by the same decision as the tables
 * (#382): the home indicator overlays the panel like it does in any app.
 */
export function PanelNote({ children, variant = "note" }: { children: ReactNode; variant?: "note" | "warning" }) {
  // Centred, with more room at the sides than the rows: on a phone the
  // rounded corners of the screen clip the first and last characters of a
  // line that starts at the edge. The warning variant is the one line the
  // sailor must not skim past: larger, and in the warning colour rather
  // than the small-print grey.
  const warning = variant === "warning";
  return (
    <p
      className={`shrink-0 m-0 px-5 py-[3px] text-center leading-tight border-t ${warning ? "text-[11px] font-medium" : "text-[9px]"}`}
      style={{
        background: warning ? "var(--ow-warn-soft)" : "var(--ow-bg-1)",
        borderColor: warning ? "var(--ow-warn-line)" : "var(--ow-line-2)",
        color: warning ? "var(--ow-warn)" : "var(--ow-fg-2)",
      }}
    >
      {children}
    </p>
  );
}
