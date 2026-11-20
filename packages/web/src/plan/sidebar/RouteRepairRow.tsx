// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "../session/planContext";
import { noticeText } from "../notices";
import { useT } from "../../i18n";

/**
 * The server repaired the route before computing it: the route drawn ran
 * over land, so an end was moved to the water or a leg retraced at sea. The
 * route on the map is the repaired one. Said here with what changed, with a
 * reminder that an automatic trace knows the land and nothing else, and with
 * the way back to the route as drawn. Nothing at all when the route was
 * computed as drawn, and gone as soon as the reader edits the route.
 */
export function RouteRepairRow() {
  const { t } = useT();
  const { state, actions } = usePlan();
  const repair = state.routeRepair;
  if (!repair) return null;
  return (
    <div
      data-testid="route-repair"
      className="px-4 py-2.5 space-y-1.5"
      style={{ background: "var(--ow-accent-soft)", borderBottom: "1px solid var(--ow-line)" }}
    >
      <p className="text-[12px] font-semibold" style={{ color: "var(--ow-fg-0)" }}>
        {t("panel.routeRepair.lead")}
      </p>
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
  );
}
