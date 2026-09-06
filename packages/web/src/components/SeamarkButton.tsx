// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useT } from "../i18n";

interface SeamarkButtonProps {
  enabled: boolean;
  onToggle: () => void;
  /** Positioning is left to the host map, like the locate control, so each
      page can dodge its own overlays. */
  className?: string;
}

/**
 * Toggles the OpenSeaMap aids-to-navigation overlay, on both the explore
 * map and the planner map.
 *
 * The glyph is a cardinal beacon rather than the usual stack-of-layers
 * icon: there is only one overlay to offer, so naming it is more useful
 * than implying a layer picker that does not exist.
 */
export function SeamarkButton({ enabled, onToggle, className = "" }: SeamarkButtonProps) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={t("explore.seamarks.show")}
      title={enabled ? t("explore.seamarks.hide") : t("explore.seamarks.show")}
      className={`absolute z-[400] w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 ${className}`}
      style={{
        background: enabled ? "var(--ow-accent)" : "var(--ow-surface-glass)",
        backdropFilter: "blur(8px)",
        border: enabled ? "1px solid var(--ow-accent)" : "1px solid var(--ow-line-2)",
        color: enabled ? "var(--ow-on-accent)" : "var(--ow-fg-1)",
      }}
    >
      {/* East cardinal beacon: two cones base to base on a staff, standing
          on a waterline. Reads as "chart mark" at 20 px far better than a
          lighthouse, whose beam and gallery turn to mush at this size. */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.5 9 8h6z" fill="currentColor" stroke="none" />
        <path d="M9 12.5 12 8l3 4.5z" fill="currentColor" stroke="none" />
        <path d="M12 12.5v6" />
        <path d="M3.5 19.5c1.4 0 1.4 1.2 2.8 1.2s1.4-1.2 2.8-1.2 1.4 1.2 2.8 1.2 1.4-1.2 2.8-1.2 1.4 1.2 2.8 1.2 1.4-1.2 2.8-1.2" />
      </svg>
    </button>
  );
}
