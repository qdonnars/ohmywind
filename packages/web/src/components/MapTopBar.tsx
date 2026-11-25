// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ReactNode, RefObject } from "react";
import type { Spot } from "../types";
import { LG_MEDIA_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { NavMenu, type NavDestination } from "./NavMenu";
import { OfflineToast } from "./OfflineToast";
import { SettingsButton } from "./SettingsButton";
import { SpotSearch } from "./SpotSearch";

interface MapTopBarProps {
  /** The page the bar sits on: the navigation menu marks it. */
  current: NavDestination;
  /** Camera hand-over for the menu's map links ("?center=…&zoom=…"). */
  mapQuery: string;
  /** The menu trigger, for the onboarding card that points at it. */
  navRef?: RefObject<HTMLButtonElement | null>;
  /** The search field's box, for the map to know how much of its top the
      bar covers when it centres a point (`SpotMap` `topInsetRef`). */
  barRef?: RefObject<HTMLDivElement | null>;
  onSelectSpot: (spot: Spot) => void;
  /** Reference point for the search proximity bias, as primitives. */
  nearLat?: number | null;
  nearLon?: number | null;
  savedSpots?: Spot[];
  /** What the page hangs under the bar, in the middle (on the planner: the
      way back to a comparison, the undo of a removed waypoint), above the
      offline toast. It keeps out of the column of controls on the right. */
  under?: ReactNode;
}

/**
 * What a page with a full-screen map (the explorer, the planner, the
 * comparison) floats over the top of it, in place of a header: the menu,
 * the search and the settings.
 *
 * Mounted inside the map's positioned box, after the map so it paints over
 * it. The map runs to the top edge of the screen, under the status bar in
 * the apps; the bar keeps below it, by the safe-area insets (`--ow-chrome-*`
 * in index.css), and a veil the height of the status bar keeps the clock
 * readable over the chart.
 *
 * - On a phone (below lg), one row under the status bar: the menu, round,
 *   48 px; the search field, which opens the search over the whole screen;
 *   the settings, round, 48 px.
 * - From lg up, apart: the menu with its badge in the top left corner
 *   (52 px), the search centred (480 px at most, 52 px tall, with its
 *   suggestions under it), the settings in the top right corner.
 *
 * The offline toast hangs under the search, after what the page puts there
 * (`under`), so the two stack rather than overlap. Every box of the bar lets the
 * map take the taps around its controls (`pointer-events`). The bar carries
 * `data-ow-chrome`, which the smoke test of the apps measures against the
 * status bar (packages/mobile/smoke/probe.js).
 */
export function MapTopBar({
  current,
  mapQuery,
  navRef,
  barRef,
  onSelectSpot,
  nearLat,
  nearLon,
  savedSpots,
  under,
}: MapTopBarProps) {
  // The menu and the search are mounted once, in one layout or the other:
  // one control for assistive technology, one ref for the onboarding card.
  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  const search = (
    <SpotSearch
      onSelect={onSelectSpot}
      nearLat={nearLat}
      nearLon={nearLon}
      savedSpots={savedSpots}
      fullscreen={!isDesktop}
    />
  );

  return (
    <>
      <div aria-hidden="true" className="ow-statusbar-veil absolute inset-x-0 top-0 z-[400] pointer-events-none" />
      {isDesktop ? (
        <>
          <NavMenu variant="map" current={current} mapQuery={mapQuery} className="ow-chrome-left" triggerRef={navRef} />
          <div ref={barRef} data-ow-chrome="" className="ow-chrome-search absolute z-[400] pointer-events-none">
            {search}
          </div>
          <div className="ow-chrome-end absolute z-[400]">
            <SettingsButton />
          </div>
        </>
      ) : (
        <div ref={barRef} data-ow-chrome="" className="ow-chrome-bar absolute z-[400] flex items-center gap-2 pointer-events-none">
          <NavMenu variant="floating" current={current} mapQuery={mapQuery} triggerRef={navRef} />
          <div className="flex-1 min-w-0">{search}</div>
          <SettingsButton />
        </div>
      )}
      <div className="ow-chrome-under absolute z-[400] flex flex-col items-center gap-2 pointer-events-none">
        {under}
        <OfflineToast />
      </div>
    </>
  );
}
