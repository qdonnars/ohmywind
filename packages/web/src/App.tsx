// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState, useEffect, useRef, useCallback } from "react";
import { nowParisHourPrefix } from "./utils/format";
import type { Spot, ModelForecast, MarineHourly, MetricView } from "./types";
import { fetchAllModels } from "./api/openmeteo";
import {
  fetchMarine,
  isCurrentsRelevant,
  isTidesRelevant,
  isWavesRelevant,
} from "./api/marine";
import { useCustomSpots } from "./hooks/useCustomSpots";
import { Header } from "./components/Header";
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
import { useMapView } from "./hooks/useMapView";
import { parseMapView, mapViewQuery } from "./utils/mapViewParams";
import { hasDeclinedGeolocation } from "./config/geolocPreference";
import { loadLastSpot, saveLastSpot } from "./config/lastSpot";

const DEFAULT_MAP_CENTER: { lat: number; lon: number } = { lat: 43.3, lon: 5.35 };

function EmptyState() {
  return (
    <div className="flex items-end justify-center pb-6 px-4">
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
          <span className="lg:hidden">Touchez la carte pour la météo, appui long pour enregistrer un spot</span>
          <span className="hidden lg:inline">Cliquez la carte pour la météo, clic droit pour enregistrer un spot</span>
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
  const { enabled: seamarks, toggle: toggleSeamarks } = useSeamarks("explore");
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
  // Which spot the forecasts in state belong to. The loading flag is derived
  // from it at render time rather than set in the fetch effect: deriving
  // makes the skeleton part of the very commit that selects a spot, so the
  // data panel already has its full height when SpotMap's camera effects
  // measure it to centre the point in the visible strip (issue #218).
  const [loadedSpotKey, setLoadedSpotKey] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const [view, setView] = useState<MetricView>("wind");
  const activeSpotKey = spot ? `${spot.latitude},${spot.longitude}` : null;
  const isLoading = activeSpotKey != null && loadedSpotKey !== activeSpotKey;
  useEffect(() => {
    if (!spot) return;
    let cancelled = false;
    Promise.all([
      fetchAllModels(spot.latitude, spot.longitude),
      fetchMarine(spot.latitude, spot.longitude),
    ]).then(([data, marineData]) => {
      if (!cancelled) {
        setForecasts(data);
        setMarine(marineData);
        setLoadedSpotKey(`${spot.latitude},${spot.longitude}`);
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
  }, [spot]);

  // Tap or left click on the map: show the forecast there without saving.
  // Named by its coordinates rather than reverse-geocoded: the lookup is
  // instant and offline, and a position is meaningful information at sea.
  // Creating a spot stays a deliberate act (long press, or right click).
  const handlePreviewSpot = useCallback((lat: number, lon: number) => {
    setSpot({
      name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
      latitude: lat,
      longitude: lon,
    });
  }, []);

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
        handlePreviewSpot(fix.lat, fix.lon);
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

  // If the active view's data becomes irrelevant for the new spot (e.g. moving
  // from Atlantic to Med drops Tides/Currents below threshold), fall back to Wind.
  const showWaves = isWavesRelevant(marine);
  const showTides = isTidesRelevant(marine);
  const showCurrents = isCurrentsRelevant(marine);
  useEffect(() => {
    if (view === "waves" && !showWaves) setView("wind");
    if (view === "tides" && !showTides) setView("wind");
    if (view === "currents" && !showCurrents) setView("wind");
  }, [view, showWaves, showTides, showCurrents]);

  const fabRef = useRef<HTMLAnchorElement>(null);
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
      {/* Search proximity reference: the granted position first, else where
          the map is currently looking, else the active spot. The viewport
          matters because without it a search for "Brest" from a phone with
          no position granted ranks Brest in Belarus and Brest in Croatia
          alongside the Finistère one. */}
      <Header
        onSelectSpot={setSpot}
        nearLat={userPosition?.lat ?? mapView?.lat ?? spot?.latitude ?? null}
        nearLon={userPosition?.lon ?? mapView?.lon ?? spot?.longitude ?? null}
        savedSpots={customSpots}
      />

      {/* Map fills the entire space; pills + table are an overlay floating
          above its bottom edge so the map keeps showing through the gaps
          around the data cells. */}
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
          onSelectSpot={setSpot}
          onPreviewSpot={handlePreviewSpot}
          onAddSpot={(s) => { addSpot(s); setSpot(s); }}
          onRemoveSpot={(s) => { removeSpot(s); if (spot?.latitude === s.latitude && spot?.longitude === s.longitude) { setSpot(null); setForecasts([]); setLoadedSpotKey(null); setSelectedHour(null); } }}
          onRenameSpot={(s, name) => { renameSpot(s, name); if (spot?.latitude === s.latitude && spot?.longitude === s.longitude) setSpot({ ...s, name }); }}
          forecasts={forecasts}
          marine={marine}
          metric={view}
          selectedHour={selectedHour}
          showSeamarks={seamarks}
        />
        {/* Marine-chart toggle — top right, the corner a layer control
            conventionally lives in, and the one free corner here: the plan
            FAB owns the top left and the data overlay owns the bottom. */}
        <SeamarkButton enabled={seamarks} onToggle={toggleSeamarks} className="top-3 right-3" />
        {/* Plan FAB — after SpotMap so it renders on top.
            When a spot is active, propagate its lat/lon to /plan via `?center`
            so the planner map opens centered on the spot the user was just
            looking at, rather than a hardcoded default region. */}
        <a
          ref={fabRef}
          href={`/plan${mapViewQuery(mapView)}`}
          className="absolute top-3 left-3 z-[400] w-[58px] h-[58px] sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{ background: "var(--ow-accent)", color: "#fff" }}
          title="Planifier un passage"
        >
          <img src="/compass.png" alt="" className="select-none w-[64px] h-[64px] sm:w-[88px] sm:h-[88px]" draggable={false} />
        </a>

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
          <LocateButton status={geolocStatus} attempt={geolocAttempt} onClick={handleLocate} className="-top-4 right-3" />
          {spot ? (
            <>
              <div className="shrink-0">
                <MetricPills
                  view={view}
                  onSelect={setView}
                  showWaves={showWaves}
                  showTides={showTides}
                  showCurrents={showCurrents}
                />
              </div>
              <div ref={dataPanelRef} className="flex-1 min-h-0 overflow-hidden">
                {view === "wind" || !marine ? (
                  <WindTable
                    forecasts={forecasts}
                    isLoading={isLoading}
                    selectedHour={selectedHour}
                    onSelectHour={setSelectedHour}
                  />
                ) : view === "tides" ? (
                  <TideChart
                    marine={marine}
                    forecasts={forecasts}
                    selectedHour={selectedHour}
                    onSelectHour={setSelectedHour}
                  />
                ) : (
                  <MarineTable
                    metric={view}
                    marine={marine}
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

      <Onboarding fabRef={fabRef} />
    </div>
  );
}

export default App;
