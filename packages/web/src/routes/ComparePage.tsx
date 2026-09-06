// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { isWavesRelevant } from "../api/marine";
import { Header } from "../components/Header";
import { NavMenu } from "../components/NavMenu";
import { SpotMap } from "../components/SpotMap";
import {
  SpotsChip,
  StepSegment,
  TargetIcon,
  WaveChip,
  WindowChip,
  WindPlusLabel,
} from "../compare/CompareControls";
import { CompareTable } from "../compare/CompareTable";
import { compareDays, rowKey, sameSpot, type HourWindow, type Resolution } from "../compare/data";
import { loadComparePrefs, saveComparePrefs, type ComparePrefs } from "../compare/prefs";
import { AddSpotButton, SpotPicker } from "../compare/SpotPicker";
import { useCompareData } from "../compare/useCompareData";
import { saveLastSpot } from "../config/lastSpot";
import { useCustomSpots } from "../hooks/useCustomSpots";
import { useGeolocation } from "../hooks/useGeolocation";
import { useMapView } from "../hooks/useMapView";
import { LG_MEDIA_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { useOnline } from "../hooks/useOnline";
import { useT } from "../i18n";
import type { Spot } from "../types";
import { haversineNm } from "../utils/geo";

const DEFAULT_MAP_CENTER: { lat: number; lon: number } = { lat: 43.3, lon: 5.35 };

/** Height of the phone's sheet, as a share of the map area. */
const SHEET_FULL = "78%";
const SHEET_COMPACT = "40%";

/** Hands the reader to the header's search field: on this page a picked
    result becomes a favourite, which is how a spot gets added here. */
function focusSearch(): void {
  document.querySelector<HTMLInputElement>('header input[role="combobox"]')?.focus();
}

function Notice({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex-1 min-h-0 flex items-start justify-center px-4 pt-6">
      <div className="max-w-sm w-full">
        <h2 className="text-sm font-bold tracking-tight mb-1" style={{ color: "var(--ow-fg-0)" }}>
          {title}
        </h2>
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--ow-fg-1)" }}>
          {body}
        </p>
        {children}
      </div>
    </div>
  );
}

function SkeletonRows({ rows, dense }: { rows: number; dense: boolean }) {
  return (
    <div className="px-3 py-3 space-y-2 animate-fade-in">
      <div className="flex gap-2 items-center">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton h-3 flex-1 max-w-[200px]" />
      </div>
      {Array.from({ length: Math.max(1, rows) }).map((_, i) => (
        <div key={i} className="flex gap-1">
          <div className={`skeleton shrink-0 ${dense ? "h-[30px] w-24" : "h-[34px] w-32"}`} />
          {Array.from({ length: 8 }).map((_, j) => (
            <div key={j} className={`skeleton shrink-0 ${dense ? "h-[30px] w-16" : "h-[34px] w-[88px]"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * `/comparer`: the saved spots side by side.
 *
 * The map stays on screen and situates the spots; the table takes the rest.
 * On a phone the map fills the screen and a sheet unfolds over it, on a
 * wide screen the map is a strip above the table and the list of
 * favourites becomes the right column. Same settings on both: the step,
 * the sea band, the hour window, and which favourites are read.
 */
export function ComparePage() {
  const { t } = useT();
  const online = useOnline();
  const { customSpots, addSpot, removeSpot, renameSpot } = useCustomSpots();
  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  const { position: userPosition, locate } = useGeolocation();
  const { view: mapView, onViewChange } = useMapView();
  const { rows, isLoading } = useCompareData(customSpots);

  const [prefs, setPrefsState] = useState<ComparePrefs>(loadComparePrefs);
  const setPrefs = useCallback((patch: Partial<ComparePrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      saveComparePrefs(next);
      return next;
    });
  }, []);
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);

  // The spot the map is centred on and the table highlights. Recorded as
  // the last spot looked at, so Explorer, next door in the menu, opens on
  // it: that is where the detail by model lives.
  const [focused, setFocused] = useState<Spot | null>(null);
  const handleFocus = useCallback((spot: Spot) => {
    setFocused(spot);
    saveLastSpot(spot);
  }, []);

  // Phone only: the sheet's two heights, and the favourites panel inside it.
  const [sheetFull, setSheetFull] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Bumped whenever the map should frame the spots again: the "centre"
  // button, or the sheet having finished changing height.
  const [fitTick, setFitTick] = useState(0);

  // Distances from the reader, when the browser already lets us know where
  // they are. Never a prompt from this page: the permission is only used,
  // and the search bias and the marker on the map come with it.
  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        locate({ enableHighAccuracy: false, maximumAge: 5 * 60 * 1000 }, { silent: true });
      })
      .catch(() => {
        /* a browser without the API: no distances, nothing else changes */
      });
    return () => {
      cancelled = true;
    };
  }, [locate]);

  const distances = useMemo(() => {
    if (!userPosition) return undefined;
    const map = new Map<string, number>();
    for (const s of customSpots) {
      map.set(rowKey(s), haversineNm(userPosition.lat, userPosition.lon, s.latitude, s.longitude));
    }
    return map;
  }, [userPosition, customSpots]);

  const picked = useMemo(() => customSpots.filter((s) => !hidden.has(rowKey(s))), [customSpots, hidden]);
  const pickedRows = useMemo(() => rows.filter((r) => !hidden.has(rowKey(r.spot))), [rows, hidden]);
  const hasWaves = rows.some((row) => isWavesRelevant(row.marine));
  const wave = hasWaves && prefs.wave;
  const hasData = pickedRows.length > 0 && compareDays(pickedRows).length > 0;

  // The spots the map frames: the ones being read, once their data is in.
  // A request to centre goes through `fitTick`, so the set need not change.
  const fitSpots = useMemo(() => (isLoading ? undefined : picked), [isLoading, picked]);

  const handleSearchSelect = useCallback(
    (spot: Spot) => {
      const saved = customSpots.find((s) => sameSpot(s, spot));
      if (!saved) addSpot(spot);
      const key = rowKey(spot);
      if (hidden.has(key)) setPrefs({ hidden: prefs.hidden.filter((k) => k !== key) });
      handleFocus(saved ?? spot);
    },
    [customSpots, addSpot, hidden, prefs.hidden, setPrefs, handleFocus],
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

  const toggleSpot = useCallback(
    (spot: Spot) => {
      const key = rowKey(spot);
      setPrefs({
        hidden: hidden.has(key) ? prefs.hidden.filter((k) => k !== key) : [...prefs.hidden, key],
      });
    },
    [hidden, prefs.hidden, setPrefs],
  );
  // "Uncheck all" keeps the first favourite: an empty table compares nothing.
  const pickAll = useCallback(
    (all: boolean) => setPrefs({ hidden: all ? [] : customSpots.slice(1).map(rowKey) }),
    [customSpots, setPrefs],
  );
  const setRes = useCallback((res: Resolution) => setPrefs({ res }), [setPrefs]);
  const setWin = useCallback((win: HourWindow) => setPrefs({ win }), [setPrefs]);
  const setWave = useCallback((on: boolean) => setPrefs({ wave: on }), [setPrefs]);

  const onSheetTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && e.propertyName === "height") setFitTick((v) => v + 1);
  };

  const focusedKey = focused ? rowKey(focused) : null;

  const content = (dense: boolean) => {
    if (customSpots.length === 0) {
      return (
        <Notice title={t("compare.empty.title")} body={t("compare.empty.body")}>
          <AddSpotButton onClick={focusSearch} />
        </Notice>
      );
    }
    if (isLoading) return <SkeletonRows rows={picked.length} dense={dense} />;
    if (pickedRows.length === 0) {
      return <Notice title={t("compare.none.title")} body={t("compare.none.body")} />;
    }
    if (!hasData) {
      return (
        <div className="text-center py-8 px-4 text-sm" style={{ color: "var(--ow-fg-2)" }}>
          {online ? t("compare.table.empty") : t("compare.table.offline")}
        </div>
      );
    }
    return (
      <CompareTable
        rows={pickedRows}
        res={prefs.res}
        win={prefs.win}
        wave={wave}
        dense={dense}
        nameWidth={dense ? 96 : 132}
        gap={dense ? 3 : 4}
        focusedKey={focusedKey}
        onFocusSpot={handleFocus}
        distances={distances}
      />
    );
  };

  const map = (
    <SpotMap
      current={focused}
      customSpots={picked}
      fitSpots={fitSpots}
      fitStamp={fitTick}
      spotLabels
      userPosition={userPosition}
      onViewChange={onViewChange}
      defaultCenter={DEFAULT_MAP_CENTER}
      bottomInsetRef={isDesktop ? undefined : sheetRef}
      onSelectSpot={handleFocus}
      onAddSpot={addSpot}
      onRemoveSpot={handleRemoveSpot}
      onRenameSpot={handleRenameSpot}
      forecasts={[]}
      marine={null}
      metric="wind"
      selectedHour={null}
    />
  );

  const header = (
    <Header
      onSelectSpot={handleSearchSelect}
      nearLat={userPosition?.lat ?? mapView?.lat ?? customSpots[0]?.latitude ?? null}
      nearLon={userPosition?.lon ?? mapView?.lon ?? customSpots[0]?.longitude ?? null}
      savedSpots={customSpots}
      current="compare"
      mapQuery=""
    />
  );

  if (isDesktop) {
    return (
      <div className="h-dvh flex flex-col overflow-hidden" style={{ background: "var(--ow-bg-1)", color: "var(--ow-fg-0)" }}>
        {header}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 flex flex-col pt-4 pl-5">
            <div className="pr-5 shrink-0">
              <div
                className="relative rounded-lg overflow-hidden"
                style={{ height: 236, border: "1px solid var(--ow-line)" }}
              >
                {map}
                <NavMenu variant="map" current="compare" className="top-3 left-3" />
                <button
                  type="button"
                  onClick={() => setFitTick((v) => v + 1)}
                  aria-label={t("compare.map.recentre")}
                  title={t("compare.map.recentre")}
                  className="absolute right-3 bottom-3 z-[400] w-[38px] h-[38px] rounded-full flex items-center justify-center cursor-pointer"
                  style={{
                    border: "2px solid var(--ow-accent)",
                    background: "var(--ow-bg-1)",
                    color: "var(--ow-accent)",
                    boxShadow: "var(--ow-shadow-2)",
                  }}
                >
                  <TargetIcon size={18} />
                </button>
              </div>
            </div>
            <div
              className="shrink-0 flex items-center gap-3 mr-5 mt-3.5 mb-3 pb-3"
              style={{ borderBottom: "1px solid var(--ow-line)" }}
            >
              <StepSegment value={prefs.res} onChange={setRes} small={false} />
              {hasWaves && (
                <>
                  <WindPlusLabel />
                  <WaveChip on={prefs.wave} onChange={setWave} small={false} />
                </>
              )}
              <div className="ml-auto">
                <WindowChip win={prefs.win} onChange={setWin} small={false} />
              </div>
            </div>
            {content(false)}
          </div>
          <div className="shrink-0 flex flex-col" style={{ width: 268, borderLeft: "1px solid var(--ow-line)" }}>
            <SpotPicker
              spots={customSpots}
              hidden={hidden}
              onToggle={toggleSpot}
              onAll={pickAll}
              distances={distances}
              variant="column"
            />
            <div className="p-3" style={{ borderTop: "1px solid var(--ow-line)" }}>
              <AddSpotButton onClick={focusSearch} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}>
      {header}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0">{map}</div>
        <div
          ref={sheetRef}
          onTransitionEnd={onSheetTransitionEnd}
          className="absolute left-0 right-0 bottom-0 z-[400] flex flex-col safe-bottom"
          style={{
            height: sheetFull ? SHEET_FULL : SHEET_COMPACT,
            background: "var(--ow-bg-1)",
            borderRadius: "20px 20px 0 0",
            boxShadow: "var(--ow-shadow-pop)",
            borderTop: "1px solid var(--ow-line)",
            transition: "height .3s cubic-bezier(.3, 1, .4, 1)",
          }}
        >
          <button
            type="button"
            onClick={() => setSheetFull((v) => !v)}
            aria-expanded={sheetFull}
            aria-label={sheetFull ? t("compare.sheet.collapse") : t("compare.sheet.expand")}
            className="shrink-0 w-full pt-[9px] pb-1 cursor-pointer"
          >
            <span className="block mx-auto rounded-[3px]" style={{ width: 40, height: 5, background: "var(--ow-line-2)" }} />
          </button>
          <div className="shrink-0 px-3 pb-2 flex items-center gap-[7px]">
            <StepSegment value={prefs.res} onChange={setRes} small />
            {hasWaves && <WaveChip on={prefs.wave} onChange={setWave} small />}
            <WindowChip win={prefs.win} onChange={setWin} small />
            <div className="ml-auto">
              <SpotsChip
                picked={picked.length}
                total={customSpots.length}
                open={panelOpen}
                onClick={() => setPanelOpen((v) => !v)}
                small
              />
            </div>
          </div>
          {panelOpen && (
            <SpotPicker
              spots={customSpots}
              hidden={hidden}
              onToggle={toggleSpot}
              onAll={pickAll}
              distances={distances}
              variant="panel"
              onClose={() => setPanelOpen(false)}
            />
          )}
          <div className="flex-1 min-h-0 flex flex-col pl-3.5">{content(true)}</div>
          {sheetFull && (
            <div className="shrink-0 px-3 pt-2 pb-1" style={{ borderTop: "1px solid var(--ow-line)" }}>
              <AddSpotButton onClick={focusSearch} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
