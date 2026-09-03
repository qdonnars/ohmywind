// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useT } from "../i18n";
import type { Spot } from "../types";
import { SpotSearch } from "./SpotSearch";
import { ThemeToggle } from "../design/theme";
import { InfoButton } from "./InfoButton";
import { rememberReturnPath } from "../config/returnPath";
import { OfflineBanner } from "./OfflineBanner";


interface HeaderProps {
  onSelectSpot: (spot: Spot) => void;
  /** Reference point for the search proximity bias. Passed as primitives so
      a fresh object each render cannot retrigger the search. */
  nearLat?: number | null;
  nearLon?: number | null;
  savedSpots?: Spot[];
}

function WindIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ow-accent)' }}>
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SettingsButton() {
  const { t } = useT();
  return (
    <a
      href="/config"
      onClick={rememberReturnPath}
      aria-label={t("explore.header.settings")}
      title={t("explore.header.settings")}
      className="shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors"
      style={{ color: 'var(--ow-fg-1)', background: 'transparent' }}
    >
      <SettingsIcon />
    </a>
  );
}

export function Header({ onSelectSpot, nearLat, nearLon, savedSpots }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-lg px-3 py-2 lg:px-6"
      style={{ background: 'var(--ow-surface-glass)', borderBottom: '1px solid var(--ow-accent-line)' }}
    >
      <div className="flex items-center gap-3 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2 shrink-0">
          <WindIcon />
          <h1 className="hidden sm:block text-xl font-extrabold tracking-tight">
            <span style={{ color: 'var(--ow-fg-0)' }}>OhMy</span>
            <span style={{ color: 'var(--ow-accent)' }}>Wind</span>
          </h1>
        </div>
        <div className="flex-1 flex justify-center">
          <SpotSearch
            onSelect={onSelectSpot}
            nearLat={nearLat}
            nearLon={nearLon}
            savedSpots={savedSpots}
          />
        </div>
        <InfoButton />
        <SettingsButton />
        <ThemeToggle />
      </div>
      {/* Sous la barre plutot qu'au-dessus : la ligne du logo et de la
          recherche ne bouge pas quand le reseau tombe. Rendu ici parce que
          l'explorateur et le planificateur montent tous deux ce header, donc
          une seule instance couvre les deux ecrans. */}
      <OfflineBanner />
    </header>
  );
}
