// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import { Warn } from "../PlanStates";
import { ChevronIcon } from "../compare/icons";
import { useT, type Key } from "../../i18n";
import type { Alert, AlertKind } from "./alerts";

const KIND_ORDER: readonly AlertKind[] = ["wind", "sea", "current", "other"];
const KIND_KEYS: Record<AlertKind, Key> = {
  wind: "panel.results.alertKind.wind",
  sea: "panel.results.alertKind.sea",
  current: "panel.results.alertKind.current",
  other: "panel.results.alertKind.other",
};

/**
 * The alerts of a computed passage, folded into one line that says how
 * many and about what (« 2 alertes · vent, mer »), unfolded on a tap.
 * Three of them open took a third of the panel before the first leg.
 */
export function Warnings({ alerts }: { alerts: Alert[] }) {
  const { t, tn } = useT();
  const [open, setOpen] = useState(false);
  if (alerts.length === 0) return null;
  const kinds = KIND_ORDER.filter((k) => alerts.some((a) => a.kind === k));
  return (
    <div style={{ borderBottom: "1px solid var(--ow-line)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-2 text-left"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--ow-warn)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
          <path d="M8 2 14 13H2z" />
          <path d="M8 7v3" />
          <circle cx="8" cy="12" r="0.5" fill="var(--ow-warn)" />
        </svg>
        <span className="min-w-0 truncate text-[11px]" style={{ color: "var(--ow-fg-1)" }}>
          <span className="font-semibold">{tn("panel.compare.row.alerts", alerts.length)}</span>
          <span style={{ color: "var(--ow-fg-3)" }}> · </span>
          <span>{kinds.map((k) => t(KIND_KEYS[k])).join(", ")}</span>
        </span>
        <span className="ml-auto flex" style={{ color: "var(--ow-fg-3)" }}>
          <ChevronIcon direction={open ? "down" : "right"} size={10} />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-2.5 space-y-1.5">
          {alerts.map((a, i) => <Warn key={i}>{a.message}</Warn>)}
        </div>
      )}
    </div>
  );
}
