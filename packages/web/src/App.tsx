import { useState, useEffect } from "react";
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

const RADE_MARSEILLE: Spot = { name: "Rade de Marseille", latitude: 43.3, longitude: 5.35 };

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full px-6">
      <div className="text-center py-10 max-w-xs mx-auto">
        <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-500/10 animate-empty-pulse">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400">
            <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
            <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
            <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
          </svg>
        </div>
        <p className="text-base font-semibold mb-1.5" style={{ color: 'var(--ow-fg-0)' }}>
          Add a spot
        </p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ow-fg-1)' }}>
          <span className="lg:hidden">Long press on the map to place a wind spot</span>
          <span className="hidden lg:inline">Right-click on the map to place a wind spot</span>
        </p>
      </div>
    </div>
  );
}


function App() {
  const { customSpots, addSpot, removeSpot, renameSpot, isCustom } = useCustomSpots();
  const [spot, setSpot] = useState<Spot | null>(() => customSpots[0] ?? RADE_MARSEILLE);
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
        // Auto-select current hour so wind arrows show by default
        const nowHour = nowParisHourPrefix();
        const timeline = data[0]?.hourly.time ?? [];
        const match = timeline.find((t) => t.startsWith(nowHour)) ?? timeline.find((t) => t > nowHour) ?? null;
        setSelectedHour(match);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [spot]);

  // First-visit geolocation: if the user has no saved spots and we landed on
  // the Marseille fallback, ask the browser for their position. Granted →
  // center on them and load forecasts there. Denied / error → silent, keep
  // the default. Returning users with custom spots keep their chosen spot.
  useEffect(() => {
    if (customSpots.length > 0) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSpot({
          name: "Ma position",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        // Permission denied or unavailable — keep RADE_MARSEILLE.
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

  const isDefault = spot != null && spot.latitude === RADE_MARSEILLE.latitude && spot.longitude === RADE_MARSEILLE.longitude && !isCustom(spot);
  const canSave = spot != null && !isCustom(spot) && !isDefault;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--ow-bg-0)', color: 'var(--ow-fg-0)' }}
    >
      <Header
        onSelectSpot={setSpot}
        canSave={canSave}
        onSave={() => spot && addSpot(spot)}
      />

      {/* Map fills the entire space; pills + table are an overlay floating
          above its bottom edge so the map keeps showing through the gaps
          around the data cells. */}
      <div className="flex-1 min-h-0 relative">
        <SpotMap
          current={spot}
          customSpots={customSpots}
          onSelectSpot={setSpot}
          onAddSpot={(s) => { addSpot(s); setSpot(s); }}
          onRemoveSpot={(s) => { removeSpot(s); if (spot?.latitude === s.latitude && spot?.longitude === s.longitude) { setSpot(null); setForecasts([]); setSelectedHour(null); } }}
          onRenameSpot={(s, name) => { renameSpot(s, name); if (spot?.latitude === s.latitude && spot?.longitude === s.longitude) setSpot({ ...s, name }); }}
          forecasts={forecasts}
          marine={marine}
          metric={view}
          selectedHour={selectedHour}
        />
        {/* Plan FAB — after SpotMap so it renders on top */}
        <a
          href="/plan"
          className="absolute top-3 left-3 z-[400] w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{ background: "var(--ow-accent)", color: "#fff" }}
          title="Planifier un passage"
        >
          <img src="/compass.png" alt="" width="88" height="88" className="select-none" draggable={false} />
        </a>

        {/* Bottom overlay: pills (fixed at top of overlay) + scrollable table
            below. Pills sit in a ``shrink-0`` band so vertical scroll inside
            the data area never sweeps them away. The data area owns its own
            ``overflow-y-auto`` and clips horizontal so the inner table-scroll
            fully owns horizontal swipes. */}
        <div
          className="absolute left-0 right-0 bottom-0 max-h-[44vh] md:max-h-[46vh] z-[400] flex flex-col"
        >
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
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
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
    </div>
  );
}

export default App;
