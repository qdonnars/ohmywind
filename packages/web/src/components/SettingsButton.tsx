// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { openSettings } from "../config/openSettings";
import { useT } from "../i18n";

/** Two sliders: two lines, each with its knob. The settings' one glyph,
    on the map and in the header alike. */
function SlidersIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

interface SettingsButtonProps {
  /**
   * "floating": the round glass button at the right end of the bar over the
   * map, as tall as the bar (48 px on a phone, 52 from lg up, through
   * `--ow-chrome-size`). "header": the plain icon of a page that keeps a
   * header (the comparison).
   */
  variant: "floating" | "header";
}

/** Opens the settings over the page (`settings/SettingsSheet.tsx`). */
export function SettingsButton({ variant }: SettingsButtonProps) {
  const { t } = useT();
  const label = t("common.nav.settings");
  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={openSettings}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors cursor-pointer"
        style={{ color: "var(--ow-fg-1)", background: "transparent" }}
      >
        <SlidersIcon size={20} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={openSettings}
      aria-haspopup="dialog"
      aria-label={label}
      title={label}
      className="ow-chrome-glass pointer-events-auto shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95"
      style={{ width: "var(--ow-chrome-size)", height: "var(--ow-chrome-size)", color: "var(--ow-fg-0)" }}
    >
      <SlidersIcon size={22} />
    </button>
  );
}
