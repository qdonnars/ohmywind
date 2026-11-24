// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import { ChevronIcon } from "../compare/icons";
import { usePlan } from "../session/planContext";
import { noticeText } from "../notices";
import { useT } from "../../i18n";

/** The « i » in a circle, in the current colour. */
function InfoIcon({ size = 12 }: { size?: number }) {
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
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7.5v3.5" />
      <circle cx="8" cy="5" r="0.5" fill="currentColor" />
    </svg>
  );
}

/**
 * The server repaired the route before computing it: the route drawn ran
 * over land, so an end was moved to the water or a leg retraced at sea. The
 * route on the map is the repaired one.
 *
 * Folded into one line behind an « i », like the alerts under it: open, the
 * block took a quarter of a phone's drawer before the first leg. A tap
 * unfolds what changed, the reminder that an automatic trace knows the land
 * and nothing else, and the way back to the route as drawn. Nothing at all
 * when the route was computed as drawn, and gone as soon as the reader edits
 * the route.
 */
export function RouteRepairRow() {
  const { t } = useT();
  const { state, actions } = usePlan();
  const [open, setOpen] = useState(false);
  const repair = state.routeRepair;
  if (!repair) return null;
  return (
    <div data-testid="route-repair" style={{ borderBottom: "1px solid var(--ow-line)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-2 text-left"
      >
        <span className="shrink-0 flex" style={{ color: "var(--ow-accent)" }}>
          <InfoIcon />
        </span>
        <span className="min-w-0 truncate text-[11px] font-semibold" style={{ color: "var(--ow-fg-1)" }}>
          {t("panel.routeRepair.lead")}
        </span>
        <span className="ml-auto flex" style={{ color: "var(--ow-fg-3)" }}>
          <ChevronIcon direction={open ? "down" : "right"} size={10} />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-2.5 space-y-1.5">
          <ul className="space-y-0.5 text-[11px] leading-snug" style={{ color: "var(--ow-fg-1)" }}>
            {repair.changes.map((change, i) => (
              <li key={i}>{noticeText(change)}</li>
            ))}
          </ul>
          <p className="text-[11px] leading-snug" style={{ color: "var(--ow-fg-1)" }}>
            {t("panel.routeRepair.check")}
          </p>
          <button
            type="button"
            onClick={actions.revertRouteRepair}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
            style={{
              background: "var(--ow-bg-1)",
              border: "1px solid var(--ow-line)",
              color: "var(--ow-fg-0)",
            }}
          >
            {t("panel.routeRepair.revert")}
          </button>
        </div>
      )}
    </div>
  );
}
