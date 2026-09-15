// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * What stays pinned under the list while the comparison is open: the
 * settings of the axis, what the axis keeps frozen, and the note under it.
 * The list is the only thing that scrolls.
 */

import { usePlan } from "../session/planContext";
import { ContextRow } from "./ContextRow";
import { WindowSettings } from "./WindowPanel";
import { DepartureSettings } from "./DeparturePanel";
import { RouteIcon } from "./icons";
import { routeLengthNm } from "../../utils/geo";
import { num1 } from "../format";
import { fmtClock } from "../../domain/datetime";
import { useT } from "../../i18n";

export function CompareFoot() {
  const { t, tn } = useT();
  const { state, actions } = usePlan();
  const { compareAxis, waypoints, forecastUpdatedAt } = state;
  const slots = compareAxis === "slots";
  return (
    <div className="shrink-0" style={{ background: "var(--ow-bg-1)" }}>
      {slots && <WindowSettings />}
      {slots ? (
        <ContextRow
          icon={<RouteIcon />}
          label={t("panel.compare.frozen.track")}
          value={`${tn("panel.route.legs", Math.max(0, waypoints.length - 1))} · ${num1(routeLengthNm(waypoints))} nm`}
          action={t("panel.compare.frozen.edit")}
          onClick={actions.closeCompare}
        />
      ) : (
        <DepartureSettings />
      )}
      <p
        className="px-4 pt-2 pb-2.5 text-[10px] leading-snug"
        style={{ color: "var(--ow-fg-3)", borderTop: "1px solid var(--ow-line)" }}
      >
        {t(slots ? "panel.compare.foot.slots" : "panel.compare.foot.tracks")}
        {forecastUpdatedAt && (
          <>
            <br />
            {t("panel.results.forecastUpdated", { time: fmtClock(forecastUpdatedAt) })}
          </>
        )}
      </p>
    </div>
  );
}
