// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useRef, useState } from "react";
import { isWavesRelevant } from "../api/marine";
import { Header } from "../components/Header";
import { LocateButton } from "../components/LocateButton";
import { MetricPills } from "../components/MetricPills";
import { NavMenu } from "../components/NavMenu";
import { SeamarkButton } from "../components/SeamarkButton";
import { SpotMap } from "../components/SpotMap";
import { CompareTable } from "../compare/CompareTable";
import { compareTimeline, resolveHour, rowKey, sameSpot, type CompareMetric } from "../compare/data";
import { useCompareData } from "../compare/useCompareData";
import { saveLastSpot } from "../config/lastSpot";
import { nowParisHourPrefix } from "../domain/datetime";
import { useCustomSpots } from "../hooks/useCustomSpots";
import { useGeolocation } from "../hooks/useGeolocation";
import { useMapView } from "../hooks/useMapView";
import { LG_MEDIA_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { useSeamarks } from "../hooks/useSeamarks";
import { useT } from "../i18n";
import { navigate } from "../navigation";
import type { MetricView, Spot } from "../types";

const DEFAULT_MAP_CENTER: { lat: number; lon: number } = { lat: 43.3, lon: 5.35 };

/** Nothing to compare yet: say where spots come from, and offer the way. */
function EmptyCompare() {
  const { t } = useT();
  return (
    <div className="flex items-end justify-center pb-6 px-4">
      <div
        className="max-w-sm px-4 py-3 rounded-2xl shadow-lg"
        style={{
          background: "var(--ow-surface-pop)",
          border: "1px solid var(--ow-accent-line)",
          backdropFilter: "blur(8px)",
        }}
      >
        <h2 className="text-sm font-bold tracking-tight mb-1" style={{ color: "var(--ow-fg-0)" }}>
          {t("compare.empty.title")}
        </h2>
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--ow-fg-1)" }}>
          {t("compare.empty.body")}
        </p>
        <a
          href="/"
          className="inline-block text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: "var(--ow-accent)", background: "var(--ow-accent-soft)" }}
        >
          {t("compare.empty.cta")}
        </a>
      </div>
    </div>
  );
}

/**
 * `/comparer`: the saved spots side by side.
 *
 * Same frame as the explore page, the map above and the data over its
 * bottom edge, so the reader is on familiar ground. The map shows every
 * favourite; the table has one row per favourite on the hourly axis of the
 * wind table. Picking a spot on either side brings it forward on the other.
 */
export function ComparePage() {
  const { customSpots, addSpot, removeSpot, renameSpot } = useCustomSpots();
  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  const { position: userPosition, status: geolocStatus, attempt: geolocAttempt, locate } = useGeolocation();
  const { view: mapView, onViewChange } = useMapView();
  // The explore map's preference: this is the same kind of map, spots over a
  // coastline, so it opens the way the reader set that one.
  const { enabled: seamarks, toggle: toggleSeamarks } = useSeamarks("explore");
  const [flyToStamp, setFlyToStamp] = useState<number | null>(null);
  const { rows, isLoading } = useCompareData(customSpots);
  const [metric, setMetric] = useState<CompareMetric>("wind");
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  // The spot the map is centred on and the table highlights. Nothing is
  // fetched for it that the table does not already hold: it only decides
  // which spot's arrows the map draws for the hour being read.
  const [focused, setFocused] = useState<Spot | null>(null);
  // The favourites the map frames, fixed at mount: a spot added later is
  // not a reason to move the camera under the reader. Handed over only
  // once the table has landed, so the frame is measured against the
  // table's real height and not the skeleton's (see SpotMap.fitSpots).
  const [initialSpots] = useState<Spot[]>(() => customSpots);

  // The sea is offered when any favourite has waves; the pick falls back to
  // wind otherwise, without being forgotten (a spot with waves may be added).
  const showWaves = rows.some((row) => isWavesRelevant(row.marine));
  const effectiveMetric: CompareMetric = showWaves ? metric : "wind";
  const effectiveHour = resolveHour(selectedHour, compareTimeline(rows), nowParisHourPrefix());

  const focusedRow = focused ? rows.find((row) => sameSpot(row.spot, focused)) : undefined;
  const fitSpots = isLoading ? undefined : initialSpots;

  const handleLocate = useCallback(() => {
    locate().then((fix) => {
      if (fix) setFlyToStamp(fix.stamp);
    });
  }, [locate]);

  // Searching from here: a favourite is brought forward, anything else is
  // opened on the explore page, which resumes on the last spot looked at.
  const handleSearchSelect = useCallback(
    (spot: Spot) => {
      const saved = customSpots.find((s) => sameSpot(s, spot));
      if (saved) {
        setFocused(saved);
        return;
      }
      saveLastSpot(spot);
      navigate("/");
    },
    [customSpots],
  );

  const handleRemoveSpot = useCallback(
    (spot: Spot) => {
      removeSpot(spot);
      setFocused((prev) => (sameSpot(prev, spot) ? null : prev));
    },
    [removeSpot],
  );
  const handleRenameSpot = useCallback(
    (spot: Spot, name: string) => {
      renameSpot(spot, name);
      setFocused((prev) => (sameSpot(prev, spot) ? { ...spot, name } : prev));
    },
    [renameSpot],
  );

  // Handed to SpotMap so camera moves aim for the strip above the table.
  const dataPanelRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}
    >
      <Header
        onSelectSpot={handleSearchSelect}
        nearLat={userPosition?.lat ?? mapView?.lat ?? customSpots[0]?.latitude ?? null}
        nearLon={userPosition?.lon ?? mapView?.lon ?? customSpots[0]?.longitude ?? null}
        savedSpots={customSpots}
        current="compare"
        mapQuery=""
      />

      <div className="flex-1 min-h-0 relative">
        <SpotMap
          current={focused}
          customSpots={customSpots}
          fitSpots={fitSpots}
          userPosition={userPosition}
          flyToStamp={flyToStamp}
          onViewChange={onViewChange}
          defaultCenter={DEFAULT_MAP_CENTER}
          bottomInsetRef={dataPanelRef}
          onSelectSpot={setFocused}
          onAddSpot={addSpot}
          onRemoveSpot={handleRemoveSpot}
          onRenameSpot={handleRenameSpot}
          forecasts={focusedRow?.forecast ? [focusedRow.forecast] : []}
          marine={focusedRow?.marine ?? null}
          metric={effectiveMetric}
          selectedHour={effectiveHour}
          showSeamarks={seamarks}
        />
        <SeamarkButton enabled={seamarks} onToggle={toggleSeamarks} className="top-3 right-3" />
        {isDesktop && (
          <NavMenu variant="map" current="compare" className="top-3 left-3" />
        )}

        <div className="absolute left-0 right-0 bottom-0 max-h-[44vh] md:max-h-[46vh] z-[400] flex flex-col safe-bottom">
          <LocateButton status={geolocStatus} attempt={geolocAttempt} onClick={handleLocate} className="-top-4 right-3" />
          {customSpots.length > 0 ? (
            <>
              <div className="shrink-0">
                <MetricPills
                  view={effectiveMetric}
                  onSelect={(view: MetricView) => setMetric(view === "waves" ? "waves" : "wind")}
                  showWaves={showWaves}
                  showTides={false}
                  showCurrents={false}
                />
              </div>
              <div ref={dataPanelRef} className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <CompareTable
                  rows={rows}
                  isLoading={isLoading}
                  metric={effectiveMetric}
                  selectedHour={effectiveHour}
                  onSelectHour={setSelectedHour}
                  focusedKey={focused ? rowKey(focused) : null}
                  onFocusSpot={setFocused}
                />
              </div>
            </>
          ) : (
            <EmptyCompare />
          )}
        </div>
      </div>
    </div>
  );
}
