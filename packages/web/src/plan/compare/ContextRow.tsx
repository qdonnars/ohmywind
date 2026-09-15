// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ReactNode } from "react";
import { ChevronIcon } from "./icons";

/**
 * A pinned row of the comparison: an icon, a label, the value in mono, and
 * the one thing that can be done about it flush right. The same row says
 * what the current axis keeps frozen (« Tracé figé · 5 tronçons · 27,4 nm »)
 * and what the settings are (« Fenêtre · Les prochaines 48 h · 17
 * créneaux »), so the reader learns one shape.
 *
 * Written once: the row is the summary and the button. The settings used to
 * be spelt twice, in a summary row and again in the panel under it.
 */
export function ContextRow({
  icon,
  label,
  value,
  action,
  chevron = "right",
  open,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  action: string;
  /** "down" for a row that unfolds a panel, "right" for one that goes somewhere. */
  chevron?: "right" | "down";
  /** Unfolded, for a row that can be. */
  open?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={chevron === "down" ? !!open : undefined}
      className="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors"
      style={{
        background: open ? "var(--ow-bg-1)" : "var(--ow-bg-2)",
        borderTop: "1px solid var(--ow-line)",
      }}
    >
      <span className="shrink-0 flex" style={{ color: "var(--ow-accent)" }}>{icon}</span>
      <span className="min-w-0 flex-1 flex items-baseline gap-1.5 text-[11.5px]">
        <span className="shrink-0" style={{ color: "var(--ow-fg-3)" }}>{label}</span>
        <span
          className="truncate font-semibold tabular-nums"
          style={{ color: "var(--ow-fg-0)", fontFamily: "var(--ow-font-mono)" }}
        >
          {value}
        </span>
      </span>
      <span
        className="shrink-0 flex items-center gap-1 text-[10.5px] font-semibold"
        style={{ color: "var(--ow-fg-1)" }}
      >
        {action}
        <ChevronIcon direction={chevron === "down" && open ? "down" : chevron === "down" ? "right" : "right"} size={9} />
      </span>
    </button>
  );
}
