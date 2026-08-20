// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef, useCallback, useState, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Spot, ModelForecast, MarineHourly, MetricView } from "../types";
import { QUICK_SPOTS } from "../spots";
import { useTheme } from "../design/theme";
import type { UserPosition } from "../hooks/useGeolocation";
import { syncUserPositionLayer } from "../utils/userPositionLayer";
import { syncSeamarkLayer } from "../utils/seamarkLayer";
import { centerForBottomInset } from "../utils/visibleCenter";
import type { MapView } from "../utils/mapViewParams";

// Spot-map arrows are drawn into a single 300×300 SVG anchored at the spot
// (centre = 150,150). For ``wind``, each forecast contributes one arrow + label.
// For ``waves`` and ``currents``, a single arrow is drawn from the Open-Meteo
// Marine source. ``tides`` is scalar — no arrow.
//
// Labels naturally sit just past each arrow tip, in the arrow's direction. When
// two arrows predict similar directions their tips (and labels) collide. We run
// a small force-based relaxation pass: each pair of overlapping labels pushes
// the other away until none overlap (or we hit max iterations). Labels that
// drift away from their tip get a thin leader line back to it.
type ArrowItem = {
  rad: number;
  tipX: number;
  tipY: number;
  // label centre (relaxed)
  lblX: number;
  lblY: number;
  // natural label centre (before relaxation) — used to decide if a leader line is needed
  natLblX: number;
  natLblY: number;
  // top label, e.g. "15" (wind kn), "0.5" (Hs m), "1.5" (current kn)
  displayText: string;
  // bottom caption, e.g. "AROME", "Hs m", "kn"
  caption: string;
  color: string;
};

const SPOT_CX = 150;
const SPOT_CY = 150;
// Zoom and duration of the "fly to the user" camera move.
const FLY_ZOOM = 10;
const FLY_MS = 1200;
// Approximate label half-width and half-height (speed text 18px + model text 13px stacked).
const LABEL_HW = 32;
const LABEL_HH = 22;
// Don't let labels slide back over the spot marker itself.
const MIN_FROM_SPOT = 60;

function relaxLabels(items: ArrowItem[]): void {
  const ITERATIONS = 40;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const dx = b.lblX - a.lblX;
        const dy = b.lblY - a.lblY;
        // AABB overlap on each axis
        const overlapX = LABEL_HW * 2 - Math.abs(dx);
        const overlapY = LABEL_HH * 2 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          // push along the smaller-overlap axis (minimum-translation vector)
          if (overlapX < overlapY) {
            const push = overlapX * 0.5 * Math.sign(dx || 1);
            a.lblX -= push;
            b.lblX += push;
          } else {
            const push = overlapY * 0.5 * Math.sign(dy || 1);
            a.lblY -= push;
            b.lblY += push;
          }
          moved = true;
        }
      }
    }
    // After each pass, project labels out of the spot-marker keep-out radius.
    for (const it of items) {
      const dx = it.lblX - SPOT_CX;
      const dy = it.lblY - SPOT_CY;
      const dist = Math.hypot(dx, dy);
      if (dist < MIN_FROM_SPOT && dist > 0.001) {
        const scale = MIN_FROM_SPOT / dist;
        it.lblX = SPOT_CX + dx * scale;
        it.lblY = SPOT_CY + dy * scale;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function arrowMarkup(it: ArrowItem): string {
  // Thin shaft + narrow arrowhead. Shaft stops at the base of the head so the
  // two strokes don't pile up under the tip — gives a sharp, single-pointed look.
  const headLen = 13;
  const headAng = 0.3;
  const lx = it.tipX - headLen * Math.sin(it.rad - headAng);
  const ly = it.tipY + headLen * Math.cos(it.rad - headAng);
  const rx = it.tipX - headLen * Math.sin(it.rad + headAng);
  const ry = it.tipY + headLen * Math.cos(it.rad + headAng);
  // Where the shaft should end (midpoint of the arrowhead base, along the shaft axis).
  const baseDist = headLen * Math.cos(headAng);
  const shaftX = it.tipX - baseDist * Math.sin(it.rad);
  const shaftY = it.tipY + baseDist * Math.cos(it.rad);
  const dropColor = it.color === "#ffffff" ? "#000" : "#fff";
  return `<line x1="${SPOT_CX}" y1="${SPOT_CY}" x2="${shaftX}" y2="${shaftY}" stroke="${it.color}" stroke-width="3" stroke-linecap="round" style="filter:drop-shadow(0 0 1.5px ${dropColor})"/>
    <polygon points="${it.tipX},${it.tipY} ${lx},${ly} ${rx},${ry}" fill="${it.color}" style="filter:drop-shadow(0 0 1.5px ${dropColor})"/>`;
}

function leaderMarkup(it: ArrowItem): string {
  // Only draw a leader if the label has been displaced from its natural position.
  const drift = Math.hypot(it.lblX - it.natLblX, it.lblY - it.natLblY);
  if (drift < 6) return "";
  return `<line x1="${it.tipX}" y1="${it.tipY}" x2="${it.lblX}" y2="${it.lblY}" stroke="${it.color}" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.55"/>`;
}

function labelMarkup(it: ArrowItem): string {
  const shadow = it.color === "#ffffff"
    ? "0 0 3px #000,0 0 6px #000"
    : "0 0 3px #fff,0 0 5px #fff";
  const caption = it.caption
    ? `<text x="${it.lblX}" y="${it.lblY + 20}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#fff" style="text-shadow:0 0 3px #000,0 0 5px #000">${it.caption}</text>`
    : "";
  return `<text x="${it.lblX}" y="${it.lblY}" text-anchor="middle" dominant-baseline="middle" font-size="18" font-weight="700" fill="${it.color}" style="text-shadow:${shadow}">${it.displayText}</text>${caption}`;
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,
      { headers: { "Accept-Language": "fr" } }
    );
    const data = await res.json();
    const addr = data.address || {};
    return (
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      data.display_name?.split(",")[0] ||
      `${lat.toFixed(3)}, ${lon.toFixed(3)}`
    );
  } catch {
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  }
}

interface SpotMapProps {
  // null when the user has just removed their active spot — keep the map
  // viewport where it is rather than yanking back to a default center.
  current: Spot | null;
  customSpots: Spot[];
  // User position once the browser grants geolocation. Drawn as a dot with
  // an accuracy halo, and used as the initial center when it is already
  // known at mount. Never auto-creates a spot itself: whether a fix becomes
  // the active preview spot is the page's decision.
  userPosition?: UserPosition | null;
  // Bumped by the page when it wants the camera moved onto the user. Kept
  // separate from `userPosition` so the map draws the dot without deciding
  // when the viewport may be taken over: that policy lives in the page.
  flyToStamp?: number | null;
  /** Fired when the user finishes panning or zooming. Feeds the search
      proximity bias, and the view handed to /plan so switching mode leaves
      the camera still. */
  onViewChange?: (view: MapView) => void;
  /** Restores the camera handed over by /plan. Wins over the active spot:
      coming back from the planner must not move the map. */
  initialView?: MapView | null;
  defaultCenter?: { lat: number; lon: number };
  /** The OPAQUE data area overlaying the bottom edge of the map (the
      forecast tables — not the pills band, which floats transparently over
      a still-readable map and therefore counts as map). Centring a point
      must aim for the middle of the strip above this area, not of the full
      container half-hidden behind it (issue #218). A ref rather than a
      number, for two reasons: the panel grows and shrinks with its content,
      so its height is measured at the moment the camera moves; and the
      element itself is unmounted while no spot is active, so the ref is
      re-read rather than captured. */
  bottomInsetRef?: RefObject<HTMLElement | null>;
  onSelectSpot: (spot: Spot) => void;
  /** Plain tap or left click on the water: show the forecast there without
      saving anything. Looking up conditions at a point should not oblige
      the user to commit it to their favourites. */
  onPreviewSpot?: (lat: number, lon: number) => void;
  onAddSpot: (spot: Spot) => void;
  onRemoveSpot: (spot: Spot) => void;
  onRenameSpot: (spot: Spot, name: string) => void;
  forecasts: ModelForecast[];
  marine: MarineHourly | null;
  metric: MetricView;
  selectedHour: string | null;
  /** OpenSeaMap aids-to-navigation overlay. Off by default here: this map
      exists to read wind arrows over a clean coastline. The preference
      belongs to the page, which persists it. */
  showSeamarks?: boolean;
}

function spotKey(s: Spot) {
  return `${s.latitude},${s.longitude}`;
}

export function SpotMap({
  current,
  customSpots,
  userPosition,
  flyToStamp,
  onViewChange,
  initialView,
  defaultCenter,
  bottomInsetRef,
  onSelectSpot,
  onPreviewSpot,
  onAddSpot,
  onRemoveSpot,
  onRenameSpot,
  forecasts,
  marine,
  metric,
  selectedHour,
  showSeamarks = false,
}: SpotMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const arrowLayerRef = useRef<L.Marker | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const previewLayerRef = useRef<L.CircleMarker | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);
  const onSelectRef = useRef(onSelectSpot);
  onSelectRef.current = onSelectSpot;
  const onPreviewRef = useRef(onPreviewSpot);
  useEffect(() => {
    onPreviewRef.current = onPreviewSpot;
  }, [onPreviewSpot]);
  /** A long press ends with a pointerup, which the browser follows with a
      click. Without this the press that opened the "new spot" dialog would
      also drop a preview underneath it. */
  const suppressClickRef = useRef(false);
  const onAddRef = useRef(onAddSpot);
  onAddRef.current = onAddSpot;
  const onRemoveRef = useRef(onRemoveSpot);
  onRemoveRef.current = onRemoveSpot;
  const onRenameRef = useRef(onRenameSpot);
  onRenameRef.current = onRenameSpot;

  // pendingSpot: creating a new spot or renaming an existing one
  const [pendingSpot, setPendingSpot] = useState<{
    lat: number;
    lng: number;
    name: string;
    editingSpot?: Spot;
  } | null>(null);
  const setPendingRef = useRef(setPendingSpot);
  setPendingRef.current = setPendingSpot;

  // pendingEdit: long-pressed an existing marker → show rename/delete choice
  const [pendingEdit, setPendingEdit] = useState<Spot | null>(null);
  const setPendingEditRef = useRef(setPendingEdit);
  setPendingEditRef.current = setPendingEdit;

  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPressRef = useRef<() => void>(() => {});
  // Maps each marker's SVG element → its spot (for native long-press detection)
  const elementToSpotRef = useRef<Map<Element, Spot>>(new Map());
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const seamarkLayerRef = useRef<L.TileLayer | null>(null);

  const { resolvedTheme } = useTheme();

  // Switch Carto tiles when theme changes
  useEffect(() => {
    if (!mapRef.current) return;
    const variant = resolvedTheme === "light" ? "light_all" : "dark_all";
    const url = `https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`;
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(url);
    }
  }, [resolvedTheme]);

  // A previewed point is not in customSpots, so the saved-spot markers never
  // draw it. Without its own marker the panel would switch to a location the
  // map does not show. Dashed and hollow, to read as provisional next to the
  // solid saved spots.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    previewLayerRef.current?.remove();
    previewLayerRef.current = null;
    if (!current) return;
    const saved = customSpots.some(
      (s) => s.latitude === current.latitude && s.longitude === current.longitude,
    );
    if (saved) return;
    previewLayerRef.current = L.circleMarker([current.latitude, current.longitude], {
      radius: 9,
      color: "#2dd4bf",
      weight: 2.5,
      dashArray: "4 3",
      fillColor: "#2dd4bf",
      fillOpacity: 0.25,
      interactive: false,
    }).addTo(map);
  }, [current, customSpots]);

  // Draw the "you are here" dot whenever a fix is known.
  useEffect(() => {
    if (!mapRef.current) return;
    syncUserPositionLayer(mapRef.current, userLayerRef, userPosition ?? null);
  }, [userPosition]);

  // Centring a point means aiming for the middle of the strip the bottom
  // data panel leaves visible — and the panel height at the moment a camera
  // move starts is not final: the skeleton is swapped for tables of varying
  // height once the forecast lands. So every auto-centre records its target
  // here, and a ResizeObserver on the panel re-aims the camera when the
  // height settles. A drag ends the intent: the viewport is the user's.
  const autoCenterRef = useRef<{
    lat: number;
    lon: number;
    zoom: number;
    insetPx: number;
    // Epoch ms when the flyTo animation lands; 0 for plain pans. A panel
    // resize during the flight re-issues the fly with the remaining
    // duration, so the correction reads as one continuous camera move.
    flyEndsAt: number;
  } | null>(null);

  const visibleCenter = useCallback(
    (lat: number, lon: number, zoom: number): [number, number] => {
      const inset = bottomInsetRef?.current?.offsetHeight ?? 0;
      const c = centerForBottomInset(lat, lon, zoom, inset);
      return [c.lat, c.lon];
    },
    [bottomInsetRef],
  );

  // The observer wants the element, but the data area is unmounted while no
  // spot is active — so each auto-centre re-points it at whichever node
  // currently renders the panel, instead of observing once at mount.
  const insetRoRef = useRef<ResizeObserver | null>(null);
  const observedInsetElRef = useRef<Element | null>(null);
  const ensureInsetObserved = useCallback(() => {
    const el = bottomInsetRef?.current ?? null;
    const ro = insetRoRef.current;
    if (!ro || el === observedInsetElRef.current) return;
    if (observedInsetElRef.current) ro.unobserve(observedInsetElRef.current);
    observedInsetElRef.current = el;
    if (el) ro.observe(el);
  }, [bottomInsetRef]);

  const autoCenter = useCallback(
    (lat: number, lon: number, mode: "pan" | "fly") => {
      const map = mapRef.current;
      if (!map) return;
      ensureInsetObserved();
      const inset = bottomInsetRef?.current?.offsetHeight ?? 0;
      const zoom = mode === "fly" ? FLY_ZOOM : map.getZoom();
      const c = centerForBottomInset(lat, lon, zoom, inset);
      autoCenterRef.current = {
        lat,
        lon,
        zoom,
        insetPx: inset,
        flyEndsAt: mode === "fly" ? Date.now() + FLY_MS : 0,
      };
      if (mode === "fly") {
        map.flyTo([c.lat, c.lon], zoom, { duration: FLY_MS / 1000 });
      } else {
        map.panTo([c.lat, c.lon], { animate: true });
      }
    },
    [bottomInsetRef, ensureInsetObserved],
  );

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // When neither a current spot nor a granted geolocation is available
    // (typical first-visit + denied case), open wide enough to show OhMyWind's
    // full scope — Atlantic + Mediterranean French coast — so the user
    // understands the geographic reach before zooming into their region.
    const initialZoom = initialView ? initialView.zoom : current || userPosition ? 10 : 6;
    // A camera handed over by /plan or the default region framing is a
    // *centre* and is honoured as-is; a spot or a user fix is a *point of
    // interest* and must land in the visible strip above the data panel.
    const initialCenter: [number, number] = initialView
      ? [initialView.lat, initialView.lon]
      : current
      ? visibleCenter(current.latitude, current.longitude, initialZoom)
      : userPosition
        ? visibleCenter(userPosition.lat, userPosition.lon, initialZoom)
        : defaultCenter
          ? [defaultCenter.lat, defaultCenter.lon]
          : [43.3, 5.35];
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(initialCenter, initialZoom);
    // A point-centred initial view is an auto-centre like any other: seed
    // the intent so the panel settling (skeleton → loaded table) re-aims it.
    if (!initialView && (current || userPosition)) {
      autoCenterRef.current = {
        lat: current ? current.latitude : userPosition!.lat,
        lon: current ? current.longitude : userPosition!.lon,
        zoom: initialZoom,
        insetPx: bottomInsetRef?.current?.offsetHeight ?? 0,
        flyEndsAt: 0,
      };
    }

    const variant = resolvedTheme === "light" ? "light_all" : "dark_all";
    const tile = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`, {
      maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current = tile;

    // Map credits live in the info panel rather than in the corner. The OSM
    // Foundation allows this as long as they stay findable through an info
    // button, which is where they now are, alongside the other sources.

    // Custom pane for wind arrows (below markers)
    map.createPane("windArrows");
    map.getPane("windArrows")!.style.zIndex = "450";

    mapRef.current = map;

    // Plain click on the map background → preview the forecast there. Marker
    // clicks never reach this handler: Leaflet paths default to
    // bubblingMouseEvents: false, so selecting a saved spot stays distinct
    // from previewing open water.
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onPreviewRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    // Report the viewport once settled. `moveend` fires per gesture, not per
    // frame, and the consumer rounds before storing, so panning does not
    // churn React state.
    map.on("moveend", () => {
      const c = map.getCenter();
      onViewChangeRef.current?.({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
    });

    // Long press detection via Pointer Events (covers mouse + touch, one event stream)
    const el = containerRef.current!;
    let startX = 0;
    let startY = 0;

    const cancelPress = () => {
      if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    };
    cancelPressRef.current = cancelPress;

    let activePointers = 0;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      activePointers++;
      if (activePointers > 1) { cancelPress(); return; }

      startX = e.clientX;
      startY = e.clientY;
      const target = e.target as Element;

      // Check if pressing on a known custom marker
      const editSpot = elementToSpotRef.current.get(target);
      if (editSpot) {
        pressTimerRef.current = setTimeout(() => {
          suppressClickRef.current = true;
          setPendingEditRef.current(editSpot);
        }, 400);
        return;
      }

      // If pressing on any other SVG marker (non-custom), just skip
      const tag = target.tagName.toLowerCase();
      if (tag === "circle" || tag === "path") return;

      // Press on the map background → add new spot
      pressTimerRef.current = setTimeout(async () => {
        suppressClickRef.current = true;
        const rect = el.getBoundingClientRect();
        const point = L.point(startX - rect.left, startY - rect.top);
        const latlng = map.containerPointToLatLng(point);
        const name = await reverseGeocode(latlng.lat, latlng.lng);
        setPendingRef.current({ lat: latlng.lat, lng: latlng.lng, name });
      }, 400);
    };

    const handlePointerUp = () => {
      activePointers = Math.max(0, activePointers - 1);
      cancelPress();
      // The click that follows this pointerup runs first; clearing on the
      // next tick means one press swallows exactly one click, and a later
      // tap on the map is honoured normally.
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
        cancelPress();
      }
    };

    // Right-click (desktop) — same outcomes as long-press but instant. We
    // suppress the browser context menu so the rename/add dialog is the only
    // surface the user has to interact with.
    const handleContextMenu = async (e: MouseEvent) => {
      e.preventDefault();
      cancelPress();
      const target = e.target as Element;
      const editSpot = elementToSpotRef.current.get(target);
      if (editSpot) {
        setPendingEditRef.current(editSpot);
        return;
      }
      const tag = target.tagName.toLowerCase();
      if (tag === "circle" || tag === "path") return;
      const rect = el.getBoundingClientRect();
      const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
      const latlng = map.containerPointToLatLng(point);
      const name = await reverseGeocode(latlng.lat, latlng.lng);
      setPendingRef.current({ lat: latlng.lat, lng: latlng.lng, name });
    };

    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    // Create initial markers immediately + fix size after layout
    for (const spot of [...QUICK_SPOTS, ...customSpots]) {
      const key = spotKey(spot);
      const active =
        current != null &&
        spot.latitude === current.latitude &&
        spot.longitude === current.longitude;
      const isCustom = customSpots.some((s) => spotKey(s) === key);
      const marker = L.circleMarker([spot.latitude, spot.longitude], {
        radius: active ? 10 : 7,
        color: active ? "#ffffff" : "#9ca3af",
        fillColor: active ? "#2dd4bf" : "#6b7280",
        fillOpacity: active ? 0.9 : 0.6,
        weight: active ? 2.5 : 1,
        bubblingMouseEvents: false,
      })
        .bindTooltip(spot.name, {
          direction: "top",
          offset: [0, -10],
          className: "spot-tooltip",
        })
        .on("click", () => onSelectRef.current(spot))
        .addTo(map);
      if (isCustom) {
        const svgEl = (marker as any)._path as Element | undefined;
        if (svgEl) elementToSpotRef.current.set(svgEl, spot);
      }
      markersRef.current.set(key, marker);
    }

    setTimeout(() => map.invalidateSize(), 200);

    // Re-invalidate map when container resizes (e.g. mobile collapse, desktop layout)
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    // The user dragging the map ends any auto-centre intent: from then on
    // the viewport is theirs, panel resizes must not move it. (A manual
    // zoom keeps the intent — zooming around the centred point is still
    // "looking at the point".)
    map.on("dragstart", () => {
      autoCenterRef.current = null;
    });

    // Re-aim the camera when the data panel's height settles: the height
    // measured when an auto-centre started (often the loading skeleton) is
    // not the height of the loaded tables, and the difference shifts the
    // point off the visible-strip centre by half of it. The observed node
    // is (re-)chosen by ensureInsetObserved at each auto-centre, because
    // the panel unmounts while no spot is active.
    insetRoRef.current = new ResizeObserver(() => {
      const target = autoCenterRef.current;
      if (!target || !mapRef.current) return;
      // Measure through the ref, not the observed entry: after a remount
      // the observer may still deliver for the old node.
      const inset = bottomInsetRef?.current?.offsetHeight ?? 0;
      if (inset === target.insetPx) return;
      target.insetPx = inset;
      const flyRemainingMs = target.flyEndsAt - Date.now();
      // Mid-flight the interpolated getZoom() is meaningless — keep the
      // fly's destination zoom. At rest, follow the user's current zoom.
      const zoom = flyRemainingMs > 0 ? target.zoom : mapRef.current.getZoom();
      target.zoom = zoom;
      const c = centerForBottomInset(target.lat, target.lon, zoom, inset);
      if (flyRemainingMs > 0) {
        mapRef.current.flyTo([c.lat, c.lon], zoom, {
          duration: Math.max(flyRemainingMs, 300) / 1000,
        });
      } else {
        mapRef.current.panTo([c.lat, c.lon], { animate: true });
      }
    });
    ensureInsetObserved();

    return () => {
      cancelPress();
      ro.disconnect();
      insetRoRef.current?.disconnect();
      insetRoRef.current = null;
      observedInsetElRef.current = null;
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Marine-chart overlay. Declared AFTER the init effect on purpose: effects
  // fire in declaration order, so on mount the map already exists here and a
  // returning user gets back the overlay they left on. Kept out of the init
  // effect itself because the toggle also flips while the map is alive.
  useEffect(() => {
    if (!mapRef.current) return;
    syncSeamarkLayer(mapRef.current, seamarkLayerRef, showSeamarks);
  }, [showSeamarks]);

  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const allSpots = [...QUICK_SPOTS, ...customSpots];
    const desiredKeys = new Set(allSpots.map(spotKey));

    // Remove old markers
    for (const [key, marker] of markersRef.current) {
      if (!desiredKeys.has(key)) {
        const svgEl = (marker as any)._path as Element | undefined;
        if (svgEl) elementToSpotRef.current.delete(svgEl);
        marker.remove();
        markersRef.current.delete(key);
      }
    }

    // Add or update
    for (const spot of allSpots) {
      const key = spotKey(spot);
      const active =
        current != null &&
        spot.latitude === current.latitude &&
        spot.longitude === current.longitude;
      const style = {
        radius: active ? 10 : 7,
        color: active ? "#ffffff" : "#9ca3af",
        fillColor: active ? "#2dd4bf" : "#6b7280",
        fillOpacity: active ? 0.9 : 0.6,
        weight: active ? 2.5 : 1,
      };

      const isCustom = customSpots.some((cs) => spotKey(cs) === key);
      let marker = markersRef.current.get(key);
      if (!marker) {
        const s = spot;
        marker = L.circleMarker([s.latitude, s.longitude], {
          ...style,
          bubblingMouseEvents: false,
        })
          .bindTooltip(s.name, {
            direction: "top",
            offset: [0, -10],
            className: "spot-tooltip",
          })
          .on("click", () => onSelectRef.current(s))
          .addTo(map);
        if (isCustom) {
          const svgEl = (marker as any)._path as Element | undefined;
          if (svgEl) elementToSpotRef.current.set(svgEl, s);
        }
        markersRef.current.set(key, marker);
      } else {
        marker.setStyle(style);
      }
    }
  }, [current, customSpots]);

  // Sync markers on changes
  useEffect(() => {
    if (!mapRef.current) return;
    syncMarkers();
    // Pan to the active spot but keep the user's current zoom — clicking a
    // marker shouldn't yank them out of a wide overview or a tight zoom-in.
    // If the user just removed their active spot (current == null), don't
    // pan at all — preserve their viewport instead of reverting to a default.
    if (current) {
      autoCenter(current.latitude, current.longitude, "pan");
    } else {
      autoCenterRef.current = null;
    }
  }, [current, customSpots, syncMarkers, autoCenter]);

  // Fly to the user only when the page asks for it (first visit with no
  // saved spot, or an explicit tap on the locate button). Keying on the
  // stamp rather than the coordinates means a second tap still recenters
  // after the user has panned away, even though the fix is unchanged.
  //
  // Declared AFTER the pan-to-spot effect above, and the order is load-
  // bearing: on a first visit the page selects the fix as preview spot and
  // requests the fly in the same commit, so both effects fire — each starts
  // a camera move that cancels the other's, and the one declared later wins.
  // The fly must win, or the map stays at the wide initial zoom.
  useEffect(() => {
    if (!mapRef.current) return;
    if (!flyToStamp || !userPosition) return;
    autoCenter(userPosition.lat, userPosition.lon, "fly");
    // userPosition is intentionally not a dependency: the stamp is what
    // expresses "a move was requested", and a fresh fix alone must not
    // steal the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToStamp]);

  // Metric-aware arrows: wind = one per model, waves/currents = one (single
  // Open-Meteo Marine source), tides = none (scalar).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (arrowLayerRef.current) {
      arrowLayerRef.current.remove();
      arrowLayerRef.current = null;
    }

    if (!selectedHour || !current) return;

    const color = resolvedTheme === "light" ? "#64748b" : "#ffffff";

    // (rad, length) → tip + natural label position. Builds a fully-positioned
    // ArrowItem so the relaxation step can move the label without recomputing
    // geometry.
    const buildItem = (
      rad: number,
      length: number,
      displayText: string,
      caption: string,
    ): ArrowItem => {
      const tipX = SPOT_CX + Math.sin(rad) * length;
      const tipY = SPOT_CY - Math.cos(rad) * length;
      const natLblX = tipX + Math.sin(rad) * 26;
      const natLblY = tipY - Math.cos(rad) * 26;
      return {
        rad, tipX, tipY,
        lblX: natLblX, lblY: natLblY,
        natLblX, natLblY,
        displayText, caption, color,
      };
    };

    const items: ArrowItem[] = [];
    if (metric === "wind") {
      // One arrow per model. Direction is "from" → +180 to point downwind.
      for (const forecast of forecasts) {
        const timeIdx = forecast.hourly.time.indexOf(selectedHour);
        if (timeIdx === -1) continue;
        const dir = forecast.hourly.wind_direction_10m[timeIdx];
        const spd = forecast.hourly.wind_speed_10m[timeIdx];
        if (dir == null || spd == null) continue;
        const rad = ((dir + 180) * Math.PI) / 180;
        const length = Math.min(72 + spd * 4.8, 240);
        items.push(buildItem(rad, length, String(Math.round(spd)), forecast.modelName));
      }
    } else if (metric === "waves" && marine) {
      const timeIdx = marine.time.indexOf(selectedHour);
      if (timeIdx !== -1) {
        const dir = marine.wave_direction_deg[timeIdx];
        const hs = marine.wave_height_m[timeIdx];
        if (dir != null && hs != null) {
          // wave_direction is "from" (Open-Meteo convention) → +180 downwave.
          const rad = ((dir + 180) * Math.PI) / 180;
          // Hs typically 0–4 m; scale so a 2 m sea reads visually like a 20 kn
          // wind on the wind layer.
          const length = Math.min(72 + hs * 50, 240);
          // Top label: Hs with unit attached so the number reads as a height
          // ("0.2m") rather than an abstract value. Caption: dominant period
          // in seconds — sailors read this together to gauge swell vs chop.
          const period = marine.wave_period_s[timeIdx];
          const caption = period != null ? `${period.toFixed(0)}s` : "Hs";
          items.push(buildItem(rad, length, `${hs.toFixed(1)}m`, caption));
        }
      }
    } else if (metric === "currents" && marine) {
      const timeIdx = marine.time.indexOf(selectedHour);
      if (timeIdx !== -1) {
        const spd = marine.current_speed_kn[timeIdx];
        const dir = marine.current_direction_to_deg[timeIdx];
        if (spd != null && dir != null) {
          // current_direction is already "to" — no flip.
          const rad = (dir * Math.PI) / 180;
          // Visual scale tuned to nav impact: 1 kn = 5 kn-of-wind length,
          // 4 kn = 20 kn-of-wind length. Avoids over-dramatising the
          // sub-1-knot values that are typical Mediterranean baseline.
          const length = Math.min(60 + spd * 25, 180);
          // Single-line label "0.8 kn" — currents have no secondary axis
          // to show below (unlike waves with period), so collapse to one line.
          items.push(buildItem(rad, length, `${spd.toFixed(1)} kn`, ""));
        }
      }
    }
    // metric === "tides": no arrow (scalar), fall through to no-render.

    if (items.length === 0) return;
    relaxLabels(items);

    // Render order: arrows (back) → leader lines → labels (front, on top of arrows)
    let svgContent = "";
    for (const it of items) svgContent += arrowMarkup(it);
    for (const it of items) svgContent += leaderMarkup(it);
    for (const it of items) svgContent += labelMarkup(it);

    const icon = L.divIcon({
      html: `<svg width="300" height="300" viewBox="0 0 300 300" style="overflow:visible;pointer-events:none">${svgContent}</svg>`,
      className: "",
      iconSize: [300, 300],
      iconAnchor: [150, 150],
    });

    arrowLayerRef.current = L.marker([current.latitude, current.longitude], {
      icon,
      interactive: false,
      pane: "windArrows",
    }).addTo(map);
  }, [selectedHour, forecasts, marine, metric, current, resolvedTheme]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full overflow-hidden" />
      {/* Marker long-press: rename or delete */}
      {pendingEdit && (
        <div className="absolute inset-0 flex items-center justify-center z-[1000] bg-black/50 backdrop-blur-sm animate-fade-in" role="dialog" aria-label="Spot options">
          <div className="ow-modal-surface backdrop-blur rounded-xl p-5 mx-4 w-full max-w-xs animate-modal-in">
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ow-fg-0)' }}>{pendingEdit.name}</p>
            <p className="text-xs mb-4" style={{ color: 'var(--ow-fg-1)' }}>
              {pendingEdit.latitude.toFixed(4)}, {pendingEdit.longitude.toFixed(4)}
            </p>
            <div className="flex flex-col gap-2">
              <button
                className="ow-modal-btn w-full min-h-[44px] py-2.5 rounded-lg text-sm font-medium transition-all"
                onClick={() => {
                  const s = pendingEdit;
                  setPendingEdit(null);
                  setPendingSpot({ lat: s.latitude, lng: s.longitude, name: s.name, editingSpot: s });
                }}
              >
                Rename
              </button>
              <button
                className="w-full min-h-[44px] py-2.5 rounded-lg bg-red-700/80 text-white text-sm font-medium hover:bg-red-600 active:bg-red-500 active:scale-[0.98] transition-all"
                onClick={() => {
                  onRemoveRef.current(pendingEdit);
                  setPendingEdit(null);
                }}
              >
                Delete
              </button>
              <button
                className="ow-modal-btn-outline w-full min-h-[44px] py-2.5 rounded-lg text-sm transition-all"
                onClick={() => setPendingEdit(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New spot / rename spot */}
      {pendingSpot && (
        <div className="absolute inset-0 flex items-center justify-center z-[1000] bg-black/50 backdrop-blur-sm animate-fade-in" role="dialog" aria-label={pendingSpot.editingSpot ? "Rename spot" : "New spot"}>
          <div className="ow-modal-surface backdrop-blur rounded-xl p-5 mx-4 w-full max-w-xs animate-modal-in">
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ow-fg-0)' }}>
              {pendingSpot.editingSpot ? "Rename spot" : "New spot"}
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--ow-fg-1)' }}>
              {pendingSpot.lat.toFixed(4)}, {pendingSpot.lng.toFixed(4)}
            </p>
            <input
              className="ow-modal-input w-full text-sm rounded-lg px-3 py-2.5 mb-4 transition-colors"
              value={pendingSpot.name}
              onChange={(e) => setPendingSpot({ ...pendingSpot, name: e.target.value })}
              autoFocus
              aria-label="Spot name"
            />
            <div className="flex gap-2">
              <button
                className="ow-modal-btn-outline flex-1 min-h-[44px] py-2.5 rounded-lg text-sm font-medium transition-all"
                onClick={() => setPendingSpot(null)}
              >
                Cancel
              </button>
              <button
                className="flex-1 min-h-[44px] py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-500 active:scale-[0.98] transition-all"
                onClick={() => {
                  if (pendingSpot.editingSpot) {
                    onRenameRef.current(pendingSpot.editingSpot, pendingSpot.name);
                  } else {
                    onAddRef.current({
                      name: pendingSpot.name,
                      latitude: pendingSpot.lat,
                      longitude: pendingSpot.lng,
                    });
                  }
                  setPendingSpot(null);
                }}
              >
                {pendingSpot.editingSpot ? "Rename" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
