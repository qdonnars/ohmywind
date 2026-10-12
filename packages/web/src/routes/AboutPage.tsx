// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import { InfoPanel } from "../components/InfoPanel";
import { aboutReturnPath } from "../config/returnPath";
import { useWhatsNewDot } from "../config/whatsNewSeen";
import { useT } from "../i18n";

/**
 * /a-propos: what the « i » of the header opens. A page of its own rather
 * than a window over the map with a ✕, the way back at the top left as on
 * every other page of the app, and leading to the page whose « i » was
 * tapped. Its sub-page, the release log, comes back here.
 */
export function AboutPage() {
  const { t } = useT();
  const [back] = useState(aboutReturnPath);
  const whatsNewDot = useWhatsNewDot();
  return (
    <div className="min-h-screen" style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}>
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{
          // iPhone: the status bar area, see .safe-top in index.css.
          paddingTop: "env(safe-area-inset-top, 0px)",
          background: "color-mix(in srgb, var(--ow-bg-0) 75%, transparent)",
          borderColor: "var(--ow-line-2)",
        }}
      >
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href={back} className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OhMyWind
          </a>
          <span className="text-xs opacity-60">{t("explore.infoButton.title")}</span>
        </div>
      </header>
      <main>
        <InfoPanel whatsNewUnseen={whatsNewDot} />
      </main>
    </div>
  );
}
