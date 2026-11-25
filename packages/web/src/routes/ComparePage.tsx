// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { isWavesRelevant } from "../api/marine";
import { MapTopBar } from "../components/MapTopBar";
import { ZOOM_CLEARANCE_BELOW_PX, ZOOM_GROUP_PX } from "../components/mapControlsLayout";
import { SpotMap } from "../components/SpotMap";
import {
  SpotsChip,
  StepSegment,
  TargetIcon,
  WaveChip,
  WindowChip,
} from "../compare/CompareControls";
import { CompareTable } from "../compare/CompareTable";
import {
  compareDays,
  rowKey,
  sameSpot,
  searchReference,
  type HourWindow,
  type Resolution,
} from "../compare/data";
import { focusSearch } from "../compare/focusSearch";
import {
  clampSheet,
  loadComparePrefs,
  saveComparePrefs,
  SHEET_OPEN_MIN,
  SHEET_MAX,
  SHEET_MIN,
  SHEET_OPEN,
  SHEET_PEEK,
  type ComparePrefs,
} from "../compare/prefs";
import { AddSpotButton, SpotPicker } from "../compare/SpotPicker";
import { useCompareData } from "../compare/useCompareData";
import { loadLastSpot, saveLastSpot } from "../config/lastSpot";
import { goTo } from "../router";
import { useCustomSpots } from "../hooks/useCustomSpots";
import { useGeolocation } from "../hooks/useGeolocation";
import { useMapView } from "../hooks/useMapView";
import { LG_MEDIA_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { useOnline } from "../hooks/useOnline";
import { useOpenMeteoQuota } from "../hooks/useOpenMeteoQuota";
import { openMeteoQuotaMessage } from "../api/openMeteoQuota";
import { useT } from "../i18n";
import type { Spot } from "../types";
import { haversineNm } from "../utils/geo";

const DEFAULT_MAP_CENTER: { lat: number; lon: number } = { lat: 43.3, lon: 5.35 };

/** Under this much map left between the bar and the sheet, framing the
    spots would only move them behind it: the reader has asked for the
    table, not the map. The button that frames them stands down too. */
const MAP_STRIP_MIN_PX = 100;

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
 * Laid out as the explorer is, at every width: no header, the map over the
 * whole screen (under the status bar in the apps), the menu, the search and
 * the settings floating over its top (`MapTopBar`), and the table in a sheet
 * over its bottom. The sheet grows from under the bar, never over it, and is
 * dragged by its handle. One row of settings heads it: the step, the sea
 * band, the hour window, and the « Spots » chip, which unfolds the list of
 * favourites to tick under the row. From lg up only the sizes change.
 */
export function ComparePage() {
  const { t } = useT();
  const online = useOnline();
  // Same empty state as the explore table: nothing offline (the toast said
  // it), then a spent Open-Meteo quota with its return time, then a bare
  // "no data".
  const quota = useOpenMeteoQuota();
  const { customSpots, addSpot, removeSpot, renameSpot } = useCustomSpots();
  // Presentation only: the cells and the chips are larger from lg up.
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
  // it: that is where the detail by model lives. A second tap on the spot
  // already focused, its row or its marker, goes there: a double tap does
  // it in one go, and the focused row says so (« Explorer › »).
  const [focused, setFocused] = useState<Spot | null>(null);
  const focusedRef = useRef<Spot | null>(null);
  const handleFocus = useCallback((spot: Spot) => {
    saveLastSpot(spot);
    if (sameSpot(focusedRef.current, spot)) {
      goTo("/");
      return;
    }
    setFocused(spot);
  }, []);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);
  // The last spot looked at when the page opened, here or on Explorer: a
  // reference for the place search until a spot is focused.
  const [lastSpot] = useState(loadLastSpot);

  // The height of the sheet, and the favourites panel inside it. The height
  // is dragged by the handle and kept across visits, so a reader who works
  // in the table full screen finds it full screen again.
  const [sheet, setSheet] = useState(() => prefs.sheet);
  const [sheetAnimating, setSheetAnimating] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  // The room the sheet grows in: from under the bar over the map to the
  // bottom of the screen. Its height, for what the strip of map left above
  // the sheet can hold.
  const roomRef = useRef<HTMLDivElement>(null);
  const [roomPx, setRoomPx] = useState(0);
  useLayoutEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const measure = () => setRoomPx(room.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(room);
    return () => ro.disconnect();
  }, []);
  // The bar over the map, which a point centred on the map must clear.
  const topBarRef = useRef<HTMLDivElement>(null);
  // `value` rather than the state read back on release: a whole drag can land
  // in one batch, and the height committed then must be the one dragged to.
  const dragRef = useRef<{ y: number; from: number; moved: boolean; value: number } | null>(null);
  // A drag ends on a click the browser fires anyway; without this the sheet
  // would snap back to one of its two tap heights on every release.
  const tapHandledRef = useRef(false);
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

  // The rank of each favourite, in the order they were saved: the map draws
  // it inside the marker, the table and the picker repeat it before the name.
  // Built from every favourite rather than from the ticked ones, so
  // unticking the third does not renumber the fourth.
  const markerNumbers = useMemo(
    () => new Map(customSpots.map((s, i): [string, number] => [rowKey(s), i + 1])),
    [customSpots],
  );

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

  // ── The sheet's height ─────────────────────────────────────────────────
  // A drag on the handle sets it anywhere between a peek and the full
  // room; a tap keeps the two heights of the design. Percentages of the
  // room under the bar rather than of the viewport, so the bar never counts
  // and the sheet at its highest stops under it.
  const mapAreaHeight = () => roomRef.current?.clientHeight ?? 0;

  const refitMap = (pct: number) => {
    const height = mapAreaHeight();
    if (height > 0 && height * (1 - pct / 100) < MAP_STRIP_MIN_PX) return;
    setFitTick((v) => v + 1);
  };

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // Capture so the drag survives a thumb that wanders off the handle. Not
    // every pointer can be captured (a synthetic one, a pointer already
    // released), and losing the capture only costs the stray-thumb case.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* the drag still works, it just ends when the pointer leaves */
    }
    setSheetAnimating(false);
    dragRef.current = { y: e.clientY, from: sheet, moved: false, value: sheet };
  };
  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = drag.y - e.clientY;
    // Under a few pixels the reader is tapping, not dragging: the sheet must
    // not jitter under a thumb that meant to toggle it.
    if (!drag.moved && Math.abs(dy) < 4) return;
    drag.moved = true;
    const height = mapAreaHeight();
    if (height <= 0) return;
    drag.value = Math.min(Math.max(drag.from + (dy / height) * 100, SHEET_MIN), SHEET_MAX);
    setSheet(drag.value);
  };
  const onHandleUp = (e: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drag?.moved) return;
    tapHandledRef.current = true;
    setPrefs({ sheet: clampSheet(drag.value) });
    refitMap(drag.value);
  };
  const toggleSheet = () => {
    if (tapHandledRef.current) {
      tapHandledRef.current = false;
      return;
    }
    const next = sheet >= SHEET_OPEN_MIN ? SHEET_PEEK : SHEET_OPEN;
    setSheetAnimating(true);
    setSheet(next);
    setPrefs({ sheet: next });
  };
  const onSheetTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "height") return;
    setSheetAnimating(false);
    refitMap(sheet);
  };
  const sheetOpen = sheet >= SHEET_OPEN_MIN;

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
      // Offline, nothing here: the passing « Hors ligne : mise à jour
      // impossible » said it when the page asked (useCompareData), and the
      // table fills by itself when the network comes back.
      if (!online) return null;
      return (
        <div className="text-center py-8 px-4 text-sm" style={{ color: "var(--ow-fg-2)" }}>
          {quota
            ? openMeteoQuotaMessage("connection", quota.window, quota.resetAt)
            : t("compare.table.empty")}
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
        numbers={markerNumbers}
      />
    );
  };

  // The strip of map between the bar and the sheet, and the column of round
  // controls along its right edge (components/mapControlsLayout.ts): the
  // zoom buttons right under the bar (mouse and trackpad only), the button
  // that frames the spots again at the bottom, above the sheet. A short
  // strip keeps the bottom one, and none at all once the map is only a
  // band: the zoom buttons stand down first, as on the planner.
  const stripPx = roomPx * (1 - sheet / 100);
  const recentreRoom = stripPx >= MAP_STRIP_MIN_PX;
  const zoomRoom = stripPx >= ZOOM_GROUP_PX + ZOOM_CLEARANCE_BELOW_PX;

  // Not the map centre first, as on Explorer: here the sheet hides most of
  // the map, and the centre of a map framed above it lies far off. See
  // searchReference.
  const near = searchReference(userPosition, [focused, lastSpot, customSpots[0]], mapView);
  const small = !isDesktop;

  return (
    <div className="ow-app-screen flex flex-col overflow-hidden" style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}>
      {/* No header: the map fills the whole screen, under the status bar in
          the apps, and the menu, the search and the settings float over its
          top (MapTopBar), as on the explorer. */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0">
          <SpotMap
            current={focused}
            customSpots={picked}
            fitSpots={fitSpots}
            fitStamp={fitTick}
            markerNumbers={markerNumbers}
            userPosition={userPosition}
            onViewChange={onViewChange}
            defaultCenter={DEFAULT_MAP_CENTER}
            bottomInsetRef={sheetRef}
            topInsetRef={topBarRef}
            onSelectSpot={handleFocus}
            onAddSpot={addSpot}
            onRemoveSpot={handleRemoveSpot}
            onRenameSpot={handleRenameSpot}
            forecasts={[]}
            marine={null}
            metric="wind"
            selectedHour={null}
            zoomButtons={zoomRoom ? { className: "ow-chrome-right ow-chrome-slot-1" } : undefined}
          />
        </div>
        {/* The room of the sheet starts where the column of controls does,
            under the bar (.ow-chrome-slot-1), so the sheet at its highest
            leaves the menu, the search and the settings in reach. It lets
            the map take the taps it does not cover. */}
        <div ref={roomRef} className="ow-chrome-slot-1 absolute inset-x-0 bottom-0 z-[400] pointer-events-none">
          <div
            ref={sheetRef}
            onTransitionEnd={onSheetTransitionEnd}
            className="absolute left-0 right-0 bottom-0 flex flex-col pointer-events-auto"
            style={{
              height: `${sheet}%`,
              background: "var(--ow-bg-1)",
              borderRadius: "20px 20px 0 0",
              boxShadow: "var(--ow-shadow-pop)",
              borderTop: "1px solid var(--ow-line)",
              transition: sheetAnimating ? "height .3s cubic-bezier(.3, 1, .4, 1)" : undefined,
              // Clear of the notch in landscape, as the bar is.
              paddingLeft: "env(safe-area-inset-left, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
            }}
          >
            {/* At the bottom of the column of controls, 16 px above the
                sheet, where the explorer has its locate button: frames the
                compared spots again. */}
            {recentreRoom && (
              <button
                type="button"
                onClick={() => setFitTick((v) => v + 1)}
                aria-label={t("compare.map.recentre")}
                title={t("compare.map.recentre")}
                className="ow-chrome-right absolute w-12 h-12 rounded-full flex items-center justify-center shadow-lg cursor-pointer transition-transform hover:scale-105 active:scale-95"
                style={{
                  bottom: "calc(100% + 16px)",
                  background: "var(--ow-surface-glass)",
                  backdropFilter: "blur(8px)",
                  border: "1px solid var(--ow-line-2)",
                  color: "var(--ow-accent)",
                }}
              >
                <TargetIcon size={20} />
              </button>
            )}
            {/* The grab handle. Wide enough for a thumb, and the whole strip
                takes the drag: the pill alone was a 5 px target. A press that
                travels stays a resize, a press that does not is the tap the
                design gives the two heights to. */}
            <button
              type="button"
              onClick={toggleSheet}
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              aria-expanded={sheetOpen}
              aria-label={sheetOpen ? t("compare.sheet.collapse") : t("compare.sheet.expand")}
              className="shrink-0 w-full flex items-center justify-center cursor-row-resize touch-none"
              style={{ height: 28 }}
            >
              <span className="block rounded-[3px]" style={{ width: 40, height: 5, background: "var(--ow-line-2)" }} />
            </button>
            {/* The row of settings, and the list the « Spots » chip unfolds
                under it: in the flow on a phone, pushing the table down; from
                lg up a panel hanging under the chip, over the table, which a
                click beside it closes, as the hour window does. */}
            <div className="relative z-[10] shrink-0">
              <div className="relative z-[2] px-3 pb-2 lg:px-5 lg:pb-3 flex items-center gap-[7px] max-[380px]:gap-1.5 lg:gap-3">
                <StepSegment value={prefs.res} onChange={setRes} small={small} />
                {hasWaves && <WaveChip on={prefs.wave} onChange={setWave} small={small} />}
                <WindowChip win={prefs.win} onChange={setWin} small={small} />
                <div className="ml-auto">
                  <SpotsChip
                    picked={picked.length}
                    total={customSpots.length}
                    open={panelOpen}
                    onClick={() => setPanelOpen((v) => !v)}
                    small={small}
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
                  numbers={markerNumbers}
                  onClose={() => setPanelOpen(false)}
                  onAdd={() => {
                    setPanelOpen(false);
                    focusSearch();
                  }}
                />
              )}
              {panelOpen && (
                <div
                  aria-hidden="true"
                  className="hidden lg:block fixed inset-0 z-[1]"
                  onClick={() => setPanelOpen(false)}
                />
              )}
            </div>
            {/* No « Ajouter un spot » under the table: the sheet is the table,
                and the way to add one is in the « Spots » panel, with the list
                it grows. */}
            <div className="flex-1 min-h-0 flex flex-col pl-3.5 lg:pl-5">{content(small)}</div>
          </div>
        </div>
        {/* After the sheet, so what hangs under the bar (the offline toast)
            paints over a sheet raised to its highest. The search adds the
            place picked to the favourites. No camera on the menu's links: the
            explorer opens on the spot focused here (saveLastSpot). */}
        <MapTopBar
          current="compare"
          mapQuery=""
          barRef={topBarRef}
          onSelectSpot={handleSearchSelect}
          nearLat={near?.lat ?? null}
          nearLon={near?.lon ?? null}
          savedSpots={customSpots}
        />
      </div>
    </div>
  );
}
