import { useState, useEffect, useRef } from "react";
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
import { RebrandBanner } from "./components/RebrandBanner";
import { WindTable } from "./components/WindTable";
import { MarineTable } from "./components/MarineTable";
import { MetricPills } from "./components/MetricPills";
import { TideChart } from "./components/TideChart";
import { SpotMap } from "./components/SpotMap";
import { Onboarding } from "./components/Onboarding";

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
          <span className="lg:hidden">Appui long pour placer votre premier spot</span>
          <span className="hidden lg:inline">Clic droit pour placer votre premier spot</span>
        </span>
      </div>
    </div>
  );
}


function App() {
  const { customSpots, addSpot, removeSpot, renameSpot } = useCustomSpots();
  // New users (no saved spots) land with no active spot — no auto-loaded
  // forecasts, no wind arrows on the map. The onboarding tour invites them
  // to drop their first one. Returning users with saved spots resume on
  // their first favorite.
  const [spot, setSpot] = useState<Spot | null>(() => customSpots[0] ?? null);
  const [geolocCenter, setGeolocCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [forecasts, setForecasts] = useState<ModelForecast[]>([]);
  const [marine, setMarine] = useState<MarineHourly | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const [view, setView] = useState<MetricView>("wind");
  useEffect(() => {
    if (!spot) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      fetchAllModels(spot.latitude, spot.longitude),
      fetchMarine(spot.latitude, spot.longitude),
    ]).then(([data, marineData]) => {
      if (!cancelled) {
        setForecasts(data);
        setMarine(marineData);
        setIsLoading(false);
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

  // First-visit geolocation: if the user has no saved spots, ask the browser
  // for their position and recenter the MAP — without auto-picking it as a
  // spot. That way the canvas frames their region but stays empty (no
  // arrows, no forecasts) until they actively drop their first spot.
  // Denied / error → silent, the SpotMap falls back to its default center.
  useEffect(() => {
    if (customSpots.length > 0) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeolocCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        /* permission denied or unavailable — keep SpotMap default center */
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  // Run once on mount; the customSpots check covers the returning-user case.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--ow-bg-0)', color: 'var(--ow-fg-0)' }}
    >
      <Header onSelectSpot={setSpot} />
      <RebrandBanner />

      {/* Map fills the entire space; pills + table are an overlay floating
          above its bottom edge so the map keeps showing through the gaps
          around the data cells. */}
      <div className="flex-1 min-h-0 relative">
        <SpotMap
          current={spot}
          customSpots={customSpots}
          geolocCenter={geolocCenter}
          defaultCenter={DEFAULT_MAP_CENTER}
          onSelectSpot={setSpot}
          onAddSpot={(s) => { addSpot(s); setSpot(s); }}
          onRemoveSpot={(s) => { removeSpot(s); if (spot?.latitude === s.latitude && spot?.longitude === s.longitude) { setSpot(null); setForecasts([]); setSelectedHour(null); } }}
          onRenameSpot={(s, name) => { renameSpot(s, name); if (spot?.latitude === s.latitude && spot?.longitude === s.longitude) setSpot({ ...s, name }); }}
          forecasts={forecasts}
          marine={marine}
          metric={view}
          selectedHour={selectedHour}
        />
        {/* Plan FAB — after SpotMap so it renders on top.
            When a spot is active, propagate its lat/lon to /plan via `?center`
            so the planner map opens centered on the spot the user was just
            looking at, rather than a hardcoded default region. */}
        <a
          ref={fabRef}
          href={spot ? `/plan?center=${spot.latitude.toFixed(5)},${spot.longitude.toFixed(5)}` : "/plan"}
          className="absolute top-3 left-3 z-[400] w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{ background: "var(--ow-accent)", color: "#fff" }}
          title="Planifier un passage"
        >
          <img src="/compass.png" alt="" width="88" height="88" className="select-none" draggable={false} />
        </a>

        {/* Bottom overlay: pills (fixed at top of overlay) + scrollable table
            below. Pills sit in a ``shrink-0`` band so vertical scroll inside
            the data area never sweeps them away. The data area provides a
            bounded height; each child table owns its own vertical scroll so
            ``thead.sticky top-0`` collides with the same container that
            scrolls (otherwise the hour row drifts away when the user scrolls
            down through GFS/ECMWF rows). */}
        <div className="absolute left-0 right-0 bottom-0 max-h-[44vh] md:max-h-[46vh] z-[400] flex flex-col">
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
              <div className="flex-1 min-h-0 overflow-hidden">
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
