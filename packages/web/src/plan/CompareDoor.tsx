// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "./session/planContext";
import { ChevronIcon, LayersIcon } from "./compare/icons";
import { useT } from "../i18n";

/**
 * The one door into « Comparer ce trajet », pinned at the bottom of the
 * plan's results: the plan keeps the lead, and the comparison is the last
 * thing one reads, after the figures and the legs, rather than a mode to
 * choose before seeing anything.
 */
export function CompareDoor() {
  const { t } = useT();
  const { actions } = usePlan();
  return (
    <div
      className="shrink-0 px-4 pt-2.5 pb-3.5"
      style={{ background: "var(--ow-bg-1)", borderTop: "1px solid var(--ow-line)" }}
    >
      <button
        type="button"
        onClick={() => actions.openCompare("slots")}
        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--ow-bg-3)]"
        style={{ background: "var(--ow-bg-2)", border: "1px solid var(--ow-line)" }}
      >
        <span className="shrink-0 flex" style={{ color: "var(--ow-accent)" }}><LayersIcon /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold leading-tight" style={{ color: "var(--ow-fg-0)" }}>
            {t("panel.door.title")}
          </span>
          <span className="block text-[10.5px] font-medium mt-0.5" style={{ color: "var(--ow-fg-3)" }}>
            {t("panel.door.sub")}
          </span>
        </span>
        <span className="shrink-0 flex" style={{ color: "var(--ow-fg-2)" }}><ChevronIcon direction="right" size={11} /></span>
      </button>
    </div>
  );
}
