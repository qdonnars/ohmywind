// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { Spot } from "../types";
import { SpotSearch } from "./SpotSearch";
import { NavMenu, type NavDestination } from "./NavMenu";
import { OfflineToast } from "./OfflineToast";
import { SettingsButton } from "./SettingsButton";
import { LG_MEDIA_QUERY, useMediaQuery } from "../hooks/useMediaQuery";


interface HeaderProps {
  onSelectSpot: (spot: Spot) => void;
  /** Reference point for the search proximity bias. Passed as primitives so
      a fresh object each render cannot retrigger the search. */
  nearLat?: number | null;
  nearLon?: number | null;
  savedSpots?: Spot[];
  /** The page this header sits on: the navigation menu marks it. */
  current: NavDestination;
  /** Camera hand-over for the menu's map links ("?center=…&zoom=…"). */
  mapQuery?: string;
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

export function Header({ onSelectSpot, nearLat, nearLon, savedSpots, current, mapQuery }: HeaderProps) {
  // Same breakpoint as the pages: the menu is mounted once, here on a phone
  // and on the map on a wide screen, never both (one control for assistive
  // technology, one ref for the onboarding card to point at).
  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-lg app-header"
      style={{ background: 'var(--ow-surface-glass)', borderBottom: '1px solid var(--ow-accent-line)' }}
    >
      <div className="flex items-center gap-3 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2 shrink-0">
          {/* On a phone the menu takes the logo's place: its badge already
              carries the wind mark, and the search field needs the width. */}
          {isDesktop ? (
            <WindIcon />
          ) : (
            <NavMenu variant="header" current={current} mapQuery={mapQuery} />
          )}
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
        {/* The settings only: the theme is one of them, and « À propos »
            (with the release log and its dot) is in the menu's drawer. */}
        <SettingsButton variant="header" />
      </div>
      {/* Pendu sous l'en-tete, par-dessus le contenu : rien ne bouge quand il
          parait. Une seule instance par page : les pages sans en-tete (carte
          plein ecran) le montent sous leur recherche flottante (MapTopBar). */}
      <OfflineToast />
    </header>
  );
}
