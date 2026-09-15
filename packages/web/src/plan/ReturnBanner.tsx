// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "./session/planContext";
import { ChevronIcon } from "./compare/icons";
import { useT } from "../i18n";

/**
 * Over the map while a comparison is open behind the plan: on the left the
 * way back up to it, on the right « Garder », which keeps the option on
 * screen as the plan and closes the comparison. The only thing that tells
 * this plan from an ordinary one.
 */
export function ReturnBanner() {
  const { t, tn } = useT();
  const { state, actions } = usePlan();
  const { mode, returnTo, windows } = state;
  if (mode !== "single" || returnTo === null) return null;
  const label =
    returnTo === "slots"
      ? t("panel.return.slots", { slots: tn("panel.compare.slots", windows?.length ?? 0) })
      : t("panel.return.tracks", { tracks: tn("panel.compare.tracks", 1) });
  const glass = {
    background: "var(--ow-surface-pop)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid var(--ow-line-2)",
    boxShadow: "var(--ow-shadow-1)",
  } as const;
  return (
    <div
      role="status"
      // Clear of the chart toggle on the right and, on a wide screen, of the
      // menu on the left: both keep their corners.
      className="absolute top-3 left-3 right-[68px] lg:left-[76px] z-[500] flex items-center gap-2 pointer-events-none"
    >
      <button
        type="button"
        onClick={() => actions.openCompare(returnTo)}
        aria-label={t("panel.return.back")}
        className="pointer-events-auto flex-1 min-w-0 h-[38px] rounded-full flex items-center gap-1.5 px-3 text-[12.5px] font-semibold"
        style={{ ...glass, color: "var(--ow-fg-0)" }}
      >
        <span className="shrink-0 flex" style={{ color: "var(--ow-fg-1)" }}><ChevronIcon direction="left" size={13} /></span>
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={actions.keepPlan}
        className="pointer-events-auto shrink-0 h-[38px] rounded-full flex items-center gap-1.5 px-3.5 text-[12.5px] font-semibold"
        style={{ background: "var(--ow-accent-strong)", color: "var(--ow-on-accent)", boxShadow: "var(--ow-shadow-1)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 13 4 4 10-10" />
        </svg>
        {t("panel.return.keep")}
      </button>
    </div>
  );
}
