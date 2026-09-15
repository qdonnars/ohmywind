// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "./session/planContext";
import { ClockIcon, RouteIcon } from "./compare/icons";
import { useT } from "../i18n";

/**
 * The two doors into « Comparer ce trajet », pinned at the bottom of the
 * plan's results: other departures on this track, or another track on this
 * departure. Each lands on its axis; the second starts drawing a variant
 * at once when there is none yet, since that is what one came for. The plan
 * keeps the lead, and the comparison is the last thing one reads, after
 * the figures and the legs.
 */
export function CompareDoor() {
  const { t } = useT();
  const { state, actions } = usePlan();
  const door = {
    background: "var(--ow-bg-2)",
    border: "1px solid var(--ow-line)",
  } as const;
  return (
    <div
      className="shrink-0 px-4 pt-2 pb-3"
      style={{ background: "var(--ow-bg-1)", borderTop: "1px solid var(--ow-line)" }}
    >
      <div
        className="text-[9.5px] uppercase tracking-widest font-bold mb-1.5"
        style={{ color: "var(--ow-fg-3)", fontFamily: "var(--ow-font-mono)" }}
      >
        {t("panel.door.title")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => actions.openCompare("slots")}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--ow-bg-3)]"
          style={door}
        >
          <span className="shrink-0 flex" style={{ color: "var(--ow-accent)" }}><ClockIcon size={15} /></span>
          <span className="min-w-0 text-[12.5px] font-semibold leading-tight" style={{ color: "var(--ow-fg-0)" }}>
            {t("panel.door.slots")}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            actions.openCompare("tracks");
            if (state.tracks.length === 0) actions.startVariant();
          }}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--ow-bg-3)]"
          style={door}
        >
          <span className="shrink-0 flex" style={{ color: "var(--ow-accent)" }}><RouteIcon size={15} /></span>
          <span className="min-w-0 text-[12.5px] font-semibold leading-tight" style={{ color: "var(--ow-fg-0)" }}>
            {t("panel.door.tracks")}
          </span>
        </button>
      </div>
    </div>
  );
}
