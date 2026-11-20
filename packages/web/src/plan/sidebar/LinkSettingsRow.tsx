// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePlan } from "../session/planContext";
import { numFixed } from "../format";
import { useT } from "../../i18n";

/** Knots as the link wrote them, in the active language: 4 → "4", 5.5 → "5,5". */
function kn(value: number): string {
  return numFixed(value, Number.isInteger(value) ? 0 : 1);
}

/**
 * The plan runs on the settings its link carries (#534), not on /config's:
 * said once, with the link's values and nothing else, and the way back to
 * the reader's own settings beside it. Nothing at all when the link carries
 * none.
 *
 * `band` is the full-width row under the recap of a result; `card` sits in
 * the form, inside its frame.
 */
export function LinkSettingsRow({ variant = "band" }: { variant?: "band" | "card" }) {
  const { t } = useT();
  const { state, actions } = usePlan();
  const { link } = state;
  if (!link) return null;
  const parts: string[] = [];
  if (link.motor) {
    parts.push(
      t("panel.link.motor", { speed: kn(link.motor.speedKn), threshold: kn(link.motor.thresholdKn) }),
    );
  }
  if (link.efficiency !== null) {
    parts.push(t("panel.link.efficiency", { percent: Math.round(link.efficiency * 100) }));
  }
  const frame =
    variant === "band"
      ? "px-4 py-2"
      : "rounded-lg px-3 py-2";
  return (
    <div
      data-testid="link-settings"
      className={`flex items-center gap-3 ${frame}`}
      style={
        variant === "band"
          ? { background: "var(--ow-accent-soft)", borderBottom: "1px solid var(--ow-line)" }
          : { background: "var(--ow-accent-soft)" }
      }
    >
      <p className="flex-1 min-w-0 text-[11px] leading-snug" style={{ color: "var(--ow-fg-1)" }}>
        <span className="font-semibold" style={{ color: "var(--ow-fg-0)" }}>
          {t("panel.link.lead")}
        </span>
        <span className="mx-1.5" style={{ color: "var(--ow-fg-3)" }}>·</span>
        {parts.join(" · ")}
      </p>
      <button
        type="button"
        onClick={actions.clearLinkSettings}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
        style={{
          background: "var(--ow-bg-1)",
          border: "1px solid var(--ow-line)",
          color: "var(--ow-fg-0)",
        }}
      >
        {t("panel.link.useMine")}
      </button>
    </div>
  );
}
