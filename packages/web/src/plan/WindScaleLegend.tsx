// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The scale of the passage's track: the softened Beaufort tints with the
 * knots each starts at, and nothing else. No title and no sentence: the
 * track beside it is the caption. It stops at the seventh tint, 23 kn and
 * above, where a planner's passage stops too.
 */

import { beaufortLowerBoundKn, windSoftVar } from "../domain/thresholds";
import { useT } from "../i18n";

const LEVELS = [0, 1, 2, 3, 4, 5, 6];

export function WindScaleLegend({ className = "" }: { className?: string }) {
  const { t } = useT();
  return (
    <div
      role="img"
      aria-label={t("plan.map.windScale", {
        bounds: LEVELS.map(beaufortLowerBoundKn).join(" · "),
      })}
      className={`absolute z-[400] flex rounded-[10px] px-3 py-2.5 pointer-events-none ${className}`}
      style={{
        background: "var(--ow-surface-pop)",
        border: "1px solid var(--ow-line-2)",
        boxShadow: "var(--ow-shadow-2)",
        backdropFilter: "blur(8px)",
      }}
    >
      {LEVELS.map((level, i) => (
        <div key={level} style={{ width: 28 }}>
          <div
            style={{
              height: 8,
              background: windSoftVar(level),
              borderRadius: i === 0 ? "4px 0 0 4px" : i === LEVELS.length - 1 ? "0 4px 4px 0" : 0,
            }}
          />
          <div className="mt-[3px] text-[10.5px] tabular-nums leading-none" style={{ color: "var(--ow-fg-1)" }}>
            {beaufortLowerBoundKn(level)}
          </div>
        </div>
      ))}
    </div>
  );
}
