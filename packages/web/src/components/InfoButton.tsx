// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { rememberAboutReturnPath } from "../config/returnPath";
import { useWhatsNewDot } from "../config/whatsNewSeen";
import { useT } from "../i18n";

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="12" y1="7" x2="12.01" y2="7" />
    </svg>
  );
}

/**
 * The « i » of the header: the way to /a-propos, a page with its back link at
 * the top left like the settings, never a window to close. The page it was
 * tapped from is remembered for that back link.
 */
export function InfoButton() {
  const { t } = useT();
  // A release this browser has not looked at yet: a dot on the « i » and on
  // the "Quoi de neuf" entry at the top of the page, until the log is opened.
  const whatsNewDot = useWhatsNewDot();
  return (
    <a
      href="/a-propos"
      onClick={rememberAboutReturnPath}
      aria-label={whatsNewDot ? `${t("explore.infoPanel.title")}, ${t("common.nav.whatsNew.unseen")}` : t("explore.infoPanel.title")}
      title={t("explore.infoButton.title")}
      className="relative shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors"
      style={{ color: "var(--ow-fg-1)", background: "transparent" }}
    >
      <InfoIcon />
      {whatsNewDot && (
        <span
          aria-hidden="true"
          data-testid="whats-new-dot"
          className="absolute rounded-full"
          style={{
            top: 5,
            right: 5,
            width: 10,
            height: 10,
            background: "var(--ow-accent)",
            border: "2px solid var(--ow-bg-1)",
          }}
        />
      )}
    </a>
  );
}
