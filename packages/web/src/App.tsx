// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { nowParisHourPrefix } from "./domain/datetime";
import { useT } from "./i18n";
import type { Spot, ModelForecast, MarineHourly, MetricView } from "./types";
import {
  isCurrentsRelevant,
  isTidesRelevant,
  isWavesRelevant,
} from "./api/marine";
import { fetchIsLand, withoutSea } from "./api/land";
import { useCustomSpots } from "./hooks/useCustomSpots";
import { MapTopBar } from "./components/MapTopBar";
import { WindTable } from "./components/WindTable";
import { MarineTable } from "./components/MarineTable";
import { MetricPills } from "./components/MetricPills";
import { TideChart } from "./components/TideChart";
import { SpotMap } from "./components/SpotMap";
import { Onboarding } from "./components/Onboarding";
import { LocateButton } from "./components/LocateButton";
import { SeamarkButton } from "./components/SeamarkButton";
import { useSeamarks } from "./hooks/useSeamarks";
import { useGeolocation } from "./hooks/useGeolocation";
import { useBackDismiss } from "./hooks/useBackDismiss";
import { useMapView } from "./hooks/useMapView";
import { LG_MEDIA_QUERY, useMediaQuery } from "./hooks/useMediaQuery";
import { parseMapView, mapViewQuery } from "./utils/mapViewParams";
import { hasDeclinedGeolocation } from "./config/geolocPreference";
import { loadLastSpot, saveLastSpot } from "./config/lastSpot";
import { useOnline } from "./hooks/useOnline";
import { loadSpotForecast } from "./offline/spotForecast";
import { ForecastStamp } from "./components/ForecastStamp";
import { usePointerWording } from "./hooks/usePointerWording";
import { useAppliedModelOrder } from "./settings/useAppliedModelOrder";

const DEFAULT_MAP_CENTER: { lat: number; lon: number } = { lat: 43.3, lon: 5.35 };

/** A spot the user is only looking at. Named by its coordinates rather than
    reverse-geocoded: the lookup is instant and offline, and a position is
    meaningful information at sea. */
function previewSpot(lat: number, lon: number): Spot {
  return {
    name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    latitude: lat,
    longitude: lon,
  };
}

function EmptyState() {
  const { t } = useT();
  // Touch or mouse wording from the pointer, not the width: an iPad in
  // landscape gets the wide layout and was told to right-click.
  const pointer = usePointerWording();
  return (
    // Centred in the width the locate button leaves (12 or 18 px from the
    // edge, 48 px wide, see .ow-chrome-right): in German at 360 px the
    // bubble ran under it.
    <div className="flex items-end justify-center pb-6 pl-4 pr-[68px] lg:pr-[74px]">
      <div
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full shadow-lg"
        style={{
          background: 'var(--ow-surface-pop)',
          border: '1px solid var(--ow-accent-line)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-1.5 rounded-full animate-empty-pulse"
          style={{ background: 'var(--ow-accent)' }}
        />
        <span className="text-[12px] font-medium" style={{ color: 'var(--ow-fg-0)' }}>
          {t(`explore.emptyState.${pointer}`)}
        </span>
      </div>
    </div>
  );
}


function App() {
  const { customSpots, addSpot, removeSpot, renameSpot } = useCustomSpots();
  // New users (no saved spots, nothing consulted yet) land with no active
  // spot — no auto-loaded forecasts, no wind arrows on the map. The
  // onboarding tour invites them to drop their first one. Returning users
  // resume on the last spot they looked at (issue #301), falling back to
  // their first favorite if nothing was recorded yet (e.g. cleared storage).
  const [spot, setSpot] = useState<Spot | null>(() => loadLastSpot() ?? customSpots[0] ?? null);
  // Persist every spot the user looks at (saved or previewed) so the next
  // visit can resume there. Skipped on null: losing the active spot (e.g.
  // deleting the current favorite) should not erase the last useful memory.
  useEffect(() => {
    if (spot) saveLastSpot(spot);
  }, [spot]);
  const { position: userPosition, status: geolocStatus, attempt: geolocAttempt, locate } = useGeolocation();
  const { view: mapView, onViewChange } = useMapView();
  const { enabled: seamarks, toggle: toggleSeamarks } = useSeamarks();
  // Camera handed over by /plan. Read once: later navigations remount.
  const [initialView] = useState(() => parseMapView(window.location.search));
  // Which fix the map is allowed to fly to. Set only on an explicit request
  // (first visit, or a tap on the locate button) so an incoming fix never
  // steals the viewport on its own.
  const [flyToStamp, setFlyToStamp] = useState<number | null>(null);
  // Read inside the mount-time geolocation callback, which must not re-run
  // when the spot changes.
  const spotRef = useRef<Spot | null>(spot);
  useEffect(() => {
    spotRef.current = spot;
  }, [spot]);
  const [forecasts, setForecasts] = useState<ModelForecast[]>([]);
  const [marine, setMarine] = useState<MarineHourly | null>(null);
  // The spot the server's land mask put on land, if it is the current one.
  // Kept apart from `marine` so the answer can land before or after the
  // forecast, or never, without either waiting on the other (#480).
  const [landSpotKey, setLandSpotKey] = useState<string | null>(null);
  // Which spot the forecasts in state belong to. The loading flag is derived
  // from it at render time rather than set in the fetch effect: deriving
  // makes the skeleton part of the very commit that selects a spot, so the
  // data panel already has its full height when SpotMap's camera effects
  // measure it to centre the point in the visible strip (issue #218).
  const [loadedSpotKey, setLoadedSpotKey] = useState<string | null>(null);
  // When the forecasts on screen were read from the device rather than just
  // fetched (offline, issue #537): the epoch ms of their fetch, which the
  // panel shows. Null for a forecast fresh from the network.
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  // Read in the fetch effect, which must not re-run when the panel loads.
  const loadedSpotKeyRef = useRef<string | null>(null);
  const savedSpotsRef = useRef(customSpots);
  useEffect(() => {
    loadedSpotKeyRef.current = loadedSpotKey;
    savedSpotsRef.current = customSpots;
  }, [loadedSpotKey, customSpots]);
  const online = useOnline();
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const [view, setView] = useState<MetricView>("wind");
  // Whether the forecast panel counts as a layer the back button should
  // close. Only a deliberate pick does: a spot restored from the last visit
  // (issue #301) or previewed from the first-visit fix is this session's
  // starting point, and back must leave the app from there rather than
  // stopping on an empty map (issue #300).
  const [spotIsLayer, setSpotIsLayer] = useState(false);
  const selectSpot = useCallback((next: Spot) => {
    setSpot(next);
    setSpotIsLayer(true);
  }, []);
  const clearSpot = useCallback(() => {
    setSpot(null);
    setSpotIsLayer(false);
    setForecasts([]);
    setMarine(null);
    setLoadedSpotKey(null);
    setCachedAt(null);
    setSelectedHour(null);
  }, []);
  useBackDismiss(spotIsLayer, clearSpot);
  const activeSpotKey = spot ? `${spot.latitude},${spot.longitude}` : null;
  // Open-Meteo answers from the nearest sea cell however far inland the
  // spot is: on land the card keeps the wind and drops the rest.
  const onLand = activeSpotKey != null && landSpotKey === activeSpotKey;
  const shownMarine = useMemo(
    () => (onLand && marine ? withoutSea(marine) : marine),
    [onLand, marine],
  );
  const isLoading = activeSpotKey != null && loadedSpotKey !== activeSpotKey;
  // Re-run when the network comes back, so a forecast read from the device
  // is refreshed in the background and its date goes. Losing the network
  // re-runs it too, and the forecast already on screen then stays as it is.
  // And when the reader reorders the models in the settings, opened over
  // this page: the fetch reads the stored order itself, the value here only
  // says when (once the settings close, see useAppliedModelOrder).
  const modelOrder = useAppliedModelOrder();
  useEffect(() => {
    if (!spot) return;
    const key = `${spot.latitude},${spot.longitude}`;
    if (!online && loadedSpotKeyRef.current === key) return;
    let cancelled = false;
    loadSpotForecast(spot, { online, savedSpots: savedSpotsRef.current }).then(({ models: data, marine: marineData, cachedAt: at }) => {
      if (!cancelled) {
        // A refresh that got nothing back must not empty a panel that the
        // device had filled: keep what is shown, with its date.
        if (data.length === 0 && loadedSpotKeyRef.current === key) return;
        setForecasts(data);
        setMarine(marineData);
        setCachedAt(at);
        setLoadedSpotKey(key);
        // Preserve the previously-selected hour across spot changes so users
        // don't have to scroll the timeline back to e.g. "tomorrow 14h" every
        // time they switch favourites. Fall back to "now" only when:
        //   - nothing has been selected yet (first load), or
        //   - the previously-selected hour is missing from the new timeline
        //     (e.g. it slid into the past after a long session).
        const timeline = data[0]?.hourly.time ?? [];
        const nowHour = nowParisHourPrefix();
        setSelectedHour((prev) => {
          if (prev && timeline.includes(prev) && prev.slice(0, 13) >= nowHour) {
            return prev;
          }
          return (
            timeline.find((t) => t.startsWith(nowHour)) ??
            timeline.find((t) => t > nowHour) ??
            null
          );
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [spot, online, modelOrder]);
  useEffect(() => {
    if (!spot) return;
    let cancelled = false;
    const key = `${spot.latitude},${spot.longitude}`;
    fetchIsLand(spot.latitude, spot.longitude).then((land) => {
      if (!cancelled && land) setLandSpotKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, [spot]);

  // Tap or left click on the map: show the forecast there without saving.
  // Creating a spot stays a deliberate act (long press, or right click).
  const handlePreviewSpot = useCallback((lat: number, lon: number) => {
    selectSpot(previewSpot(lat, lon));
  }, [selectSpot]);

  // First-visit geolocation: if the user has no saved spots, ask the browser
  // for their position, fly the map there and show the wind at that point
  // right away, as a preview spot (issue #218). A first visit that lands on
  // an empty canvas hides what the app can do; the forecast at one's own
  // position is the fastest proof. Preview only: nothing is saved without a
  // deliberate act (long press, or right click).
  // Denied / error → silent, the SpotMap falls back to its default center.
  // High accuracy is off here: framing a region needs a city-level fix, and
  // waking the GPS unprompted on a first visit is a poor trade.
  useEffect(() => {
    if (customSpots.length > 0) return;
    // A restored last-consulted spot (issue #301) already gives this visit a
    // focus, saved or not — asking for location on top of it would just be
    // an unprompted permission popup for a returning user.
    if (spotRef.current) return;
    // Arriving with a camera handed over by /plan: honour it. Flying to the
    // user would defeat the point of carrying the view across.
    if (initialView) return;
    // Someone who already refused should not be asked again, nor shown the
    // same error bubble on every visit. The locate button still retries on
    // demand, so changing one's mind in the browser settings is enough.
    if (hasDeclinedGeolocation()) return;
    // silent: an automatic request the user never made must not surface an
    // error bubble when it fails; only the locate button reports failures.
    locate({ enableHighAccuracy: false, maximumAge: 5 * 60 * 1000 }, { silent: true }).then((fix) => {
      // A spot picked while the fix was in flight means the user already
      // chose their focus — leave the viewport and their selection alone.
      if (fix && !spotRef.current) {
        setFlyToStamp(fix.stamp);
        // Not selectSpot: nobody asked for this spot, so back must not have
        // to dismiss it before leaving the app.
        setSpot(previewSpot(fix.lat, fix.lon));
      }
    });
  // Run once on mount; the customSpots check covers the returning-user case.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Explicit "centre sur moi": always honor it, spot selected or not.
  const handleLocate = useCallback(() => {
    locate().then((fix) => {
      if (fix) setFlyToStamp(fix.stamp);
    });
  }, [locate]);

  // If the picked view's data becomes irrelevant for the new spot (e.g. moving
  // from Atlantic to Med drops Tides/Currents below threshold), fall back to
  // Wind. Derived during render rather than pushed back into `view` by an
  // effect: the fallback is a function of the spot's marine data, so storing
  // it meant a second render showing the irrelevant table, and the user's own
  // pick was overwritten instead of merely overridden. `view` stays what they
  // chose, so moving back to a spot with tides restores their tab.
  const showWaves = isWavesRelevant(shownMarine);
  const showTides = isTidesRelevant(shownMarine);
  const showCurrents = isCurrentsRelevant(shownMarine);
  const relevant: Record<MetricView, boolean> = {
    wind: true,
    waves: showWaves,
    tides: showTides,
    currents: showCurrents,
  };
  const effectiveView: MetricView = relevant[view] ? view : "wind";

  // The navigation menu's trigger, for the onboarding card to point at.
  // Mounted once, in the bar over the map (MapTopBar).
  const navRef = useRef<HTMLButtonElement>(null);
  // The bar itself, which covers the top of the map: a point the camera
  // centres lands in the middle of what the bar and the tables leave.
  const topBarRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  // Handed to SpotMap so camera moves can centre a point in the strip of map
  // the OPAQUE data tables leave visible, instead of the full (half-covered)
  // container. Attached to the tables area, not the whole overlay: the pills
  // float transparently over a still-readable map, so they count as map
  // (user call on issue #218).
  const dataPanelRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={{ background: 'var(--ow-bg-0)', color: 'var(--ow-fg-0)' }}
    >
      {/* No header: the map fills the whole screen, under the status bar in
          the apps, and the menu, the search and the settings float over its
          top (MapTopBar). Pills + table are an overlay floating above its
          bottom edge so the map keeps showing through the gaps around the
          data cells. */}
      <div className="flex-1 min-h-0 relative">
        <SpotMap
          current={spot}
          customSpots={customSpots}
          userPosition={userPosition}
          flyToStamp={flyToStamp}
          onViewChange={onViewChange}
          initialView={initialView}
          defaultCenter={DEFAULT_MAP_CENTER}
          bottomInsetRef={dataPanelRef}
          topInsetRef={topBarRef}
          onSelectSpot={selectSpot}
          onPreviewSpot={handlePreviewSpot}
          onAddSpot={(s) => { addSpot(s); selectSpot(s); }}
          onRemoveSpot={(s) => { removeSpot(s); if (spot?.latitude === s.latitude && spot?.longitude === s.longitude) clearSpot(); }}
          onRenameSpot={(s, name) => { renameSpot(s, name); if (spot?.latitude === s.latitude && spot?.longitude === s.longitude) setSpot({ ...s, name }); }}
          forecasts={forecasts}
          marine={shownMarine}
          metric={effectiveView}
          selectedHour={selectedHour}
          showSeamarks={seamarks}
          // In the column of controls along the right edge, under the bar
          // over the map and, from lg up, under the chart toggle (#470).
          // Mouse and trackpad only.
          zoomButtons={{
            className: `ow-chrome-right ${isDesktop ? "ow-chrome-slot-2" : "ow-chrome-slot-1"}`,
          }}
        />
        {/* Marine-chart toggle — from lg up only, right under the settings
            button, at the top of the column of controls along the right
            edge. On a phone the bar is all the top of the map can carry:
            the sea marks are a setting (Réglages > Carte), the same one
            this button flips. */}
        {isDesktop && (
          <SeamarkButton enabled={seamarks} onToggle={toggleSeamarks} className="ow-chrome-right ow-chrome-slot-1" />
        )}
        {/* Menu, search and settings — after SpotMap so they render on top.
            Search proximity reference: the granted position first, else
            where the map is currently looking, else the active spot. The
            viewport matters because without it a search for "Brest" from a
            phone with no position granted ranks Brest in Belarus and Brest
            in Croatia alongside the Finistère one. The camera travels with
            the menu's links (`?center`, `?zoom`) so the planner opens on the
            region the reader was just looking at. */}
        <MapTopBar
          current="explore"
          mapQuery={mapViewQuery(mapView)}
          navRef={navRef}
          barRef={topBarRef}
          onSelectSpot={selectSpot}
          nearLat={userPosition?.lat ?? mapView?.lat ?? spot?.latitude ?? null}
          nearLon={userPosition?.lon ?? mapView?.lon ?? spot?.longitude ?? null}
          savedSpots={customSpots}
        />

        {/* Bottom overlay: pills (fixed at top of overlay) + scrollable table
            below. Pills sit in a ``shrink-0`` band so vertical scroll inside
            the data area never sweeps them away. The data area provides a
            bounded height; each child table owns its own vertical scroll so
            ``thead.sticky top-0`` collides with the same container that
            scrolls (otherwise the hour row drifts away when the user scrolls
            down through GFS/ECMWF rows). */}
        <div className="absolute left-0 right-0 bottom-0 max-h-[44vh] md:max-h-[46vh] z-[400] flex flex-col">
          {/* Locate FAB — anchored to the overlay rather than to the map, so
              it rides up and down as the data panel grows and shrinks
              instead of ending up buried under it. The 16 px offset is
              measured from the solid table below, not from the pills band,
              which is transparent over the map: the button straddles the
              pills and keeps the same gap to the panel as on /plan. Out of
              flow, so it does not push the pills around. */}
          <LocateButton status={geolocStatus} attempt={geolocAttempt} onClick={handleLocate} className="-top-4 ow-chrome-right" />
          {spot ? (
            <>
              {/* The right padding keeps the scrolling row clear of the
                  locate button above (12 px + 48 on a phone, 18 + 48 from
                  lg up, see .ow-chrome-right): with four pills on a phone
                  the last one slid under it and could not be read or tapped
                  (#387). The row scrolls to it instead. */}
              <div className="shrink-0 pr-16 lg:pr-[72px]">
                <MetricPills
                  view={effectiveView}
                  onSelect={setView}
                  showWaves={showWaves}
                  showTides={showTides}
                  showCurrents={showCurrents}
                  onLand={onLand}
                />
              </div>
              {/* Colonne flex, pour que la table qui depasse se comprime au
                  lieu d'etre rognee. La hauteur du panneau est bornee par un
                  max-h en vh : une hauteur en pourcentage ne s'y resout pas,
                  donc h-full sur l'enfant ne bornait rien et la note de
                  convention sortait par le bas quand la table du vent
                  affichait quatre modeles. */}
              <div ref={dataPanelRef} className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {cachedAt != null && !isLoading && <ForecastStamp key={cachedAt} fetchedAt={cachedAt} />}
                {effectiveView === "wind" || !shownMarine ? (
                  <WindTable
                    forecasts={forecasts}
                    isLoading={isLoading}
                    selectedHour={selectedHour}
                    onSelectHour={setSelectedHour}
                  />
                ) : effectiveView === "tides" ? (
                  <TideChart
                    marine={shownMarine}
                    forecasts={forecasts}
                    selectedHour={selectedHour}
                    onSelectHour={setSelectedHour}
                  />
                ) : (
                  <MarineTable
                    metric={effectiveView}
                    marine={shownMarine}
                    forecasts={forecasts}
                    selectedHour={selectedHour}
                    onSelectHour={setSelectedHour}
                  />
                )}
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      <Onboarding fabRef={navRef} />
    </div>
  );
}

export default App;
