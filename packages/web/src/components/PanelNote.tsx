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
export function PanelNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="shrink-0 m-0 px-2 py-[3px] text-[9px] leading-tight border-t"
      style={{
        background: "var(--ow-bg-1)",
        borderColor: "var(--ow-line-2)",
        color: "var(--ow-fg-2)",
      }}
    >
      {children}
    </p>
  );
}
