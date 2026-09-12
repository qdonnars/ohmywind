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

/** The recompute control of a filled view: an icon button flush right of
    the mode pills (PlanHeaderRow `action`), the width of the trash it
    replaces there. The caller colours it: filled in the mode's accent when
    a recompute is due, muted otherwise, so a fresh result does not invite a
    needless call. It used to be a full-width strip of its own; the row it
    took is the design's "rangée des modes compacte". */
export function RecomputeButton({
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={t("panel.parts.recompute")}
      aria-label={t("panel.parts.recompute")}
      className="shrink-0 flex items-center justify-center rounded-lg transition-all"
      style={{ width: 38, ...style }}
    >
      <RefreshIcon size={13} />
    </button>
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
