// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import { Warn } from "../PlanStates";
import { LG_MEDIA_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import { ChevronIcon } from "../compare/icons";
import { useT } from "../../i18n";

/**
 * The alerts of a computed passage. Three of them took a third of a phone's
 * drawer before the first leg: folded there into one line, « 3 alertes »,
 * that unfolds on a tap. A wide screen has the room and shows them open.
 */
export function Warnings({ messages }: { messages: string[] }) {
  const { tn } = useT();
  const wide = useMediaQuery(LG_MEDIA_QUERY);
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? wide;
  if (messages.length === 0) return null;
  return (
    <div style={{ borderBottom: "1px solid var(--ow-line)" }}>
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-4 py-2 text-left"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--ow-warn)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
          <path d="M8 2 14 13H2z" />
          <path d="M8 7v3" />
          <circle cx="8" cy="12" r="0.5" fill="var(--ow-warn)" />
        </svg>
        <span className="text-[11px] font-semibold" style={{ color: "var(--ow-fg-1)" }}>
          {tn("panel.compare.row.alerts", messages.length)}
        </span>
        <span className="ml-auto flex" style={{ color: "var(--ow-fg-3)" }}>
          <ChevronIcon direction={expanded ? "down" : "right"} size={10} />
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-2.5 space-y-1.5">
          {messages.map((m, i) => <Warn key={i}>{m}</Warn>)}
        </div>
      )}
    </div>
  );
}
