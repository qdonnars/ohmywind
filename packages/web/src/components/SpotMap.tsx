// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef, useCallback, useState, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Spot, ModelForecast, MarineHourly, MetricView } from "../types";
import { useTheme } from "../design/useTheme";
import { reverseGeocode } from "../api/reverseGeocode";
import { useLongPress, type LongPressDetail } from "../hooks/useLongPress";
import { SpotEditDialog, SpotNameDialog, type PendingSpot } from "./SpotDialogs";
import { ARROW_PANE, syncSpotArrowLayer } from "../utils/spotArrowLayer";
import type { UserPosition } from "../hooks/useGeolocation";
import { syncUserPositionLayer } from "../utils/userPositionLayer";
import { syncSeamarkLayer } from "../utils/seamarkLayer";
import { syncPreviewMarker, syncSpotMarkers } from "../utils/spotMarkerLayer";
import { addBasemap, BASEMAP_MAX_ZOOM, type Basemap } from "../utils/basemapLayer";
import { useMapAutoCenter } from "../hooks/useMapAutoCenter";
import type { MapView } from "../utils/mapViewParams";

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
  // The map is built once and lives outside React, so its Leaflet handlers
  // cannot close over a prop: they would freeze on the value of the render
  // that built them. Each callback is mirrored into a ref instead, written
  // from an effect (after commit) rather than during render, which is the
  // only order React guarantees for a ref.
  const onViewChangeRef = useRef(onViewChange);
  const onSelectRef = useRef(onSelectSpot);
  const onPreviewRef = useRef(onPreviewSpot);
  const onAddRef = useRef(onAddSpot);
  const onRemoveRef = useRef(onRemoveSpot);
  const onRenameRef = useRef(onRenameSpot);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
    onSelectRef.current = onSelectSpot;
    onPreviewRef.current = onPreviewSpot;
    onAddRef.current = onAddSpot;
    onRemoveRef.current = onRemoveSpot;
    onRenameRef.current = onRenameSpot;
  }, [onViewChange, onSelectSpot, onPreviewSpot, onAddSpot, onRemoveSpot, onRenameSpot]);

  // pendingSpot: creating a new spot or renaming an existing one. The state
  // setters need no ref of their own: React keeps their identity stable for
  // the life of the component, so the handlers can close over them directly.
  const [pendingSpot, setPendingSpot] = useState<PendingSpot | null>(null);

  // pendingEdit: long-pressed an existing marker → show rename/delete choice
  const [pendingEdit, setPendingEdit] = useState<Spot | null>(null);

  // Maps each marker's SVG element → its spot (for native long-press detection)
  const elementToSpotRef = useRef<Map<Element, Spot>>(new Map());
  const basemapRef = useRef<Basemap | null>(null);
  const seamarkLayerRef = useRef<L.TileLayer | null>(null);

  const { resolvedTheme } = useTheme();

  /**
   * Press and hold, on a marker or on open water.
   *
   * On a marker the user saved: the rename/delete dialog, which is why only
   * those markers are in `elementToSpotRef`. On the water: the "new spot"
   * dialog, pre-filled with the nearest place name. On any other marker
   * (Leaflet draws them as `circle` or `path` too) nothing is armed at all,
   * so a plain tap still selects the spot.
   */
  const shouldPress = useCallback((target: Element) => {
    if (elementToSpotRef.current.has(target)) return true;
    const tag = target.tagName.toLowerCase();
    return tag !== "circle" && tag !== "path";
  }, []);

  const onPress = useCallback(async ({ clientX, clientY, target }: LongPressDetail) => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    const editSpot = elementToSpotRef.current.get(target);
    if (editSpot) {
      setPendingEdit(editSpot);
      return;
    }
    const rect = el.getBoundingClientRect();
    const latlng = map.containerPointToLatLng(
      L.point(clientX - rect.left, clientY - rect.top),
    );
    const name = await reverseGeocode(latlng.lat, latlng.lng);
    setPendingSpot({ lat: latlng.lat, lng: latlng.lng, name });
  }, []);

  const clickSuppressedRef = useLongPress(containerRef, { shouldPress, onPress });

  // Switch the basemap style when the theme changes
  useEffect(() => {
    basemapRef.current?.setTheme(resolvedTheme);
  }, [resolvedTheme]);

  // The hollow marker for a point being previewed but not saved.
  useEffect(() => {
    if (!mapRef.current) return;
    syncPreviewMarker(mapRef.current, previewLayerRef, current, customSpots);
  }, [current, customSpots]);

  // Draw the "you are here" dot whenever a fix is known.
  useEffect(() => {
    if (!mapRef.current) return;
    syncUserPositionLayer(mapRef.current, userLayerRef, userPosition ?? null);
  }, [userPosition]);

  // Camera moves that account for the data panel covering the bottom of the
  // map, and re-aim when the panel's height settles. See the hook.
  const { visibleCenter, autoCenter, seed: seedAutoCenter, clear: clearAutoCenter, observe: observePanel } =
    useMapAutoCenter(bottomInsetRef);

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
    // maxZoom is declared here rather than inherited from the basemap: the
    // GL layer is not a grid layer, so it hands the map no zoom bound.
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      maxZoom: BASEMAP_MAX_ZOOM,
    }).setView(initialCenter, initialZoom);
    // A point-centred initial view is an auto-centre like any other: seed
    // the intent so the panel settling (skeleton → loaded table) re-aims it.
    if (!initialView && (current || userPosition)) {
      seedAutoCenter(
        current ? current.latitude : userPosition!.lat,
        current ? current.longitude : userPosition!.lon,
        initialZoom,
      );
    }

    basemapRef.current = addBasemap(map, resolvedTheme);

    // Map credits live in the info panel rather than in the corner. The OSM
    // Foundation allows this as long as they stay findable through an info
    // button, which is where they now are, alongside the other sources.

    // Custom pane for wind arrows (below markers)
    map.createPane(ARROW_PANE);
    map.getPane(ARROW_PANE)!.style.zIndex = "450";

    mapRef.current = map;

    // Plain click on the map background → preview the forecast there. Marker
    // clicks never reach this handler: Leaflet paths default to
    // bubblingMouseEvents: false, so selecting a saved spot stays distinct
    // from previewing open water.
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (clickSuppressedRef.current) {
        clickSuppressedRef.current = false;
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

    const el = containerRef.current!;

    // Markers are not created here: the sync effect below is declared
    // after this one, so it runs in the same commit and draws them before
    // the browser paints. Creating them twice was one copy of the marker
    // style too many.

    setTimeout(() => map.invalidateSize(), 200);

    // Re-invalidate map when container resizes (e.g. mobile collapse, desktop layout)
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    const detachPanelWatch = observePanel(map);

    return () => {
      ro.disconnect();
      detachPanelWatch();
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
    if (!mapRef.current) return;
    syncSpotMarkers({
      map: mapRef.current,
      markers: markersRef.current,
      elementToSpot: elementToSpotRef.current,
      spots: customSpots,
      current,
      onSelect: (spot) => onSelectRef.current(spot),
    });
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
      autoCenter(mapRef.current, current.latitude, current.longitude, "pan");
    } else {
      clearAutoCenter();
    }
  }, [current, customSpots, syncMarkers, autoCenter, clearAutoCenter]);

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
    autoCenter(mapRef.current, userPosition.lat, userPosition.lon, "fly");
    // userPosition is intentionally not a dependency: the stamp is what
    // expresses "a move was requested", and a fresh fix alone must not
    // steal the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToStamp]);

  // Metric-aware arrows: wind = one per model, waves/currents = one (single
  // Open-Meteo Marine source), tides = none (scalar). The geometry, the
  // per-metric scales and the label-collision pass live in utils/spotArrows.
  useEffect(() => {
    if (!mapRef.current) return;
    syncSpotArrowLayer(mapRef.current, arrowLayerRef, {
      current,
      selectedHour,
      metric,
      forecasts,
      marine,
      color: resolvedTheme === "light" ? "#64748b" : "#ffffff",
    });
  }, [selectedHour, forecasts, marine, metric, current, resolvedTheme]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full overflow-hidden" />
      {/* Long press on a saved marker: rename or delete. */}
      {pendingEdit && (
        <SpotEditDialog
          spot={pendingEdit}
          onRename={() => {
            const s = pendingEdit;
            setPendingEdit(null);
            setPendingSpot({ lat: s.latitude, lng: s.longitude, name: s.name, editingSpot: s });
          }}
          onDelete={() => {
            onRemoveRef.current(pendingEdit);
            setPendingEdit(null);
          }}
          onCancel={() => setPendingEdit(null)}
        />
      )}

      {/* Press on open water (create), or the rename branch above (edit). */}
      {pendingSpot && (
        <SpotNameDialog
          pending={pendingSpot}
          onNameChange={(name) => setPendingSpot({ ...pendingSpot, name })}
          onConfirm={() => {
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
          onCancel={() => setPendingSpot(null)}
        />
      )}
    </div>
  );
}
