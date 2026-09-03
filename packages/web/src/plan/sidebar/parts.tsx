// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** Small pieces the three filled views of the panel share. */

import type { CSSProperties } from "react";
import { useT } from "../../i18n";

/** Circular-arrow glyph of the recompute controls. */
export function RefreshIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 2.5A7 7 0 1 0 14.5 9" /><path d="M14 1v4h-4" />
    </svg>
  );
}

/** The compact recompute strip above the results of a filled view. */
export function RecomputeBar({
  onClick,
  disabled,
  style,
}: {
  onClick: () => void;
  disabled?: boolean;
  style: CSSProperties;
}) {
  const { t } = useT();
  return (
    <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--ow-line)" }}>
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-semibold transition-all"
        style={style}
      >
        <RefreshIcon size={11} />
        {t("panel.parts.recompute")}
      </button>
    </div>
  );
}

/** "The route moved, the numbers did not." Same shape in both modes. */
export function StalePlaceholder({ children }: { children: string }) {
  return (
    <div
      className="px-4 py-6 text-center text-xs"
      style={{ color: "var(--ow-fg-2)", borderBottom: "1px solid var(--ow-line)" }}
    >
      {children}
    </div>
  );
}

/** Zero-height marker the mobile drawer scrolls to when results land, so the
    recap and the results open the view and the pills plus the Recalculer bar
    stay one scroll-up away. */
export function ResultsAnchor() {
  return <div data-results-anchor />;
}
