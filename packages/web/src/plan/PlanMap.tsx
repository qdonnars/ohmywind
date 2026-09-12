// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../design/useTheme";
import type { SegmentReport } from "./types";
import { cxLevel, cxLevelToken } from "../domain/thresholds";
import { readToken } from "../design/tokens";
import { haversineNm, fmtNm } from "../utils/geo";
import { fmtDepthM } from "./format";
import type { UserPosition } from "../hooks/useGeolocation";
import { syncUserPositionLayer } from "../utils/userPositionLayer";
import { syncSeamarkLayer } from "../utils/seamarkLayer";
import { addBasemap, BASEMAP_MAX_ZOOM, type Basemap } from "../utils/basemapLayer";
import type { MapView } from "../utils/mapViewParams";
import { t, useLang } from "../i18n";
import { computeLegSegmentRanges } from "./aggregateLegs";
import { closestOnPolyline, TapGuard } from "./mapGestures";
import {
  HOLD_SLOP_PX,
  MARKER_SETTLE_MS,
  SEGMENT_HIT_PX,
  TAP_SLOP_PX,
  WAYPOINT_GRAB_MS,
  isCoarsePointer,
} from "../domain/gestures";

/** Hide a segment label when the leg is shorter than this on screen (px).
    Below it the labels crowd the waypoint markers, so we let them fade out
    as the user zooms out. */
const SEG_LABEL_MIN_PX = 90;

/** Zoom granularity of this map. Leaflet frames a route at the largest
    zoom on the snap grid that holds it, so at whole zoom levels a route
    filled anywhere between half and all of the padded frame, depending on
    where the doubling fell. A tenth of a level keeps every fit within 7 %
    of the frame; wheel and pinch simply land on finer steps. */
const ZOOM_SNAP = 0.1;

/** Frame for a route: 8 % of the map on each side, so the waypoints span
    about 84 % of the smaller dimension, and never less than what a marker
    needs to stay whole at the edge: its disc, the × badge that stands 41 px
    above its centre on touch, and the sounding 40 px below it. */
function routePadding(map: L.Map): L.FitBoundsOptions {
  const size = map.getSize();
  const x = Math.max(24, size.x * 0.08);
  const y = Math.max(28, size.y * 0.08);
  return {
    paddingTopLeft: L.point(x, Math.max(y, isCoarsePointer() ? 42 : 28)),
    paddingBottomRight: L.point(x, Math.max(y, 40)),
  };
}

export interface PlanMapHandle {
  recenter: (lat: number, lon: number) => void;
  /** Fit the camera to the current waypoints. Called when the computation
      the user asked for (Calculer / Comparer) lands — never automatically on
      waypoint placement, so the map stays where the user left it. */
  fitToWaypoints: () => void;
}

interface PlanMapProps {
  waypoints: [number, number][];
  segments?: SegmentReport[];
  isStale?: boolean;
  onWptMove: (idx: number, lat: number, lon: number) => void;
  onWptAdd?: (afterIdx: number, lat: number, lon: number) => void;
  onWptDelete?: (idx: number) => void;
  onMapClick?: (lat: number, lon: number) => void;
  /** Inclusive-exclusive range of segment indices to highlight (selected leg). */
  highlightedSegmentRange?: [number, number] | null;
  /** Index into `segments` of the step open in the panel, drawn over the leg
      highlight as a segment in the colour of its block in the strip. */
  focusedSegmentIdx?: number | null;
  /** Optional hint for the initial view when there are no waypoints yet
      (typically propagated from the home spot via `?center=lat,lon`). */
  initialCenter?: [number, number] | null;
  /** Drawn as a dot with an accuracy halo. Recentering stays the page's
      call, through the `recenter` imperative handle. */
  userPosition?: UserPosition | null;
  /** Fired when the user finishes panning or zooming. Feeds the search
      proximity bias, and the view handed back to the explore map. */
  onViewChange?: (view: MapView) => void;
  /** Zoom that goes with `initialCenter`, when the explore map handed one
      over. Ignored as soon as there are waypoints to frame. */
  initialZoom?: number | null;
  /** OpenSeaMap aids-to-navigation overlay. On by default here: placing
      waypoints in real water is what this map is for. The preference
      belongs to the page, which persists it. */
  showSeamarks?: boolean;
  /** Sounding under each waypoint, same order as `waypoints`. `undefined`
      is still loading, `null` is nothing to show. Fetching belongs to the
      page: the map only draws what it is handed. */
  depths?: (number | null | undefined)[];
}

function waypointIcon(label: string, bg: string, deletable: boolean): L.DivIcon {
  const xBtn = deletable
    ? `<button type="button" class="ow-wpt-x" aria-label="${t("plan.map.waypoint.remove")}">×</button>`
    : "";
  // The sounding slot is always rendered, empty until the lookup lands, and
  // filled in place by its own effect. Carrying it inside the icon rather
  // than as a separate tooltip layer means it follows the marker through a
  // drag for free, instead of sitting at the position the waypoint left.
  return L.divIcon({
    html:
      `<div class="ow-wpt"><div class="ow-wpt-circle" style="background:${bg}">${label}</div>${xBtn}` +
      `<span class="ow-wpt-depth"></span></div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export const PlanMap = forwardRef<PlanMapHandle, PlanMapProps>(function PlanMap(
  { waypoints, segments, isStale, onWptMove, onWptAdd, onWptDelete, onMapClick, highlightedSegmentRange, focusedSegmentIdx = null, initialCenter, userPosition, onViewChange, initialZoom, showSeamarks = false, depths }: PlanMapProps,
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const basemapRef = useRef<Basemap | null>(null);
  const seamarkLayerRef = useRef<L.TileLayer | null>(null);
  const polylinesRef = useRef<L.Polyline[]>([]);
  const highlightLayerRef = useRef<L.LayerGroup | null>(null);
  const focusLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const dragLineRef = useRef<L.Polyline | null>(null);
  const segLabelsRef = useRef<L.Tooltip[]>([]);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const flyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => { onViewChangeRef.current = onViewChange; }, [onViewChange]);
  const livePositionsRef = useRef<[number, number][]>(waypoints);
  const isDraggingRef = useRef(false);
  // One guard per map: every click the map or a segment hands us is checked
  // against the pointer gesture that produced it (see plan/mapGestures.ts).
  const tapGuardRef = useRef<TapGuard | null>(null);
  const onWptAddRef = useRef(onWptAdd);
  const onWptDeleteRef = useRef(onWptDelete);
  const onMapClickRef = useRef(onMapClick);
  const { resolvedTheme } = useTheme();
  // The delete button inside each marker carries a translated label, and
  // Leaflet keeps the rendered markup: a language switch has to redraw them.
  const lang = useLang();

  useEffect(() => { onWptAddRef.current = onWptAdd; }, [onWptAdd]);
  useEffect(() => { onWptDeleteRef.current = onWptDelete; }, [onWptDelete]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  useImperativeHandle(ref, () => ({
    recenter(lat, lon) {
      mapRef.current?.setView([lat, lon], 12, { animate: true });
    },
    fitToWaypoints() {
      const map = mapRef.current;
      if (!map) return;
      // The container may have been resized in this very frame (the mobile
      // drawer fitting itself to fresh results): Leaflet caches its size and
      // the ResizeObserver below only refreshes it after this callback, so
      // measure first, or the bounds are fitted to the map as it was.
      map.invalidateSize({ animate: false });
      if (waypoints.length >= 2) {
        map.fitBounds(
          L.latLngBounds(waypoints.map(([lat, lon]) => L.latLng(lat, lon))),
          routePadding(map),
        );
      } else if (waypoints.length === 1) {
        map.setView([waypoints[0][0], waypoints[0][1]], 10);
      }
    },
  }));

  useEffect(() => {
    livePositionsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    if (!mapRef.current) return;
    syncUserPositionLayer(mapRef.current, userLayerRef, userPosition ?? null);
  }, [userPosition]);

  // Draw the live per-segment length labels: one permanent tooltip at each
  // leg midpoint, showing the great-circle distance in nm. Auto-hides legs
  // that render shorter than SEG_LABEL_MIN_PX on screen so the chips don't
  // pile up at low zoom. Idempotent — clears the previous batch each call.
  function drawSegLabels(map: L.Map, positions: [number, number][]) {
    for (const t of segLabelsRef.current) t.remove();
    segLabelsRef.current = [];
    if (positions.length < 2) return;
    for (let i = 0; i < positions.length - 1; i++) {
      const [aLat, aLon] = positions[i];
      const [bLat, bLon] = positions[i + 1];
      const pa = map.latLngToContainerPoint([aLat, aLon]);
      const pb = map.latLngToContainerPoint([bLat, bLon]);
      if (pa.distanceTo(pb) < SEG_LABEL_MIN_PX) continue;
      const mid = L.latLng((aLat + bLat) / 2, (aLon + bLon) / 2);
      const tip = L.tooltip({
        permanent: true,
        direction: "center",
        className: "ow-seg-label",
        opacity: 1,
      })
        .setLatLng(mid)
        .setContent(fmtNm(haversineNm(aLat, aLon, bLat, bLon)))
        .addTo(map);
      segLabelsRef.current.push(tip);
    }
  }

  // Switch tiles on theme change
  useEffect(() => {
    basemapRef.current?.setTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;

    // maxZoom is declared here rather than inherited from the basemap: the
    // GL layer is not a grid layer, so it hands the map no zoom bound.
    //
    // No double-click zoom: on this map every click places a waypoint, so a
    // double click was a waypoint plus a zoom, and a double tap a waypoint
    // whose second tap landed on the marker just created. Wheel and pinch
    // stay the ways to zoom, as on the explore map.
    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
      zoomSnap: ZOOM_SNAP,
      maxZoom: BASEMAP_MAX_ZOOM,
    });

    basemapRef.current = addBasemap(map, resolvedTheme);

    // Map credits live in the info panel rather than in the corner. The OSM
    // Foundation allows this as long as they stay findable through an info
    // button, which is where they now are, alongside the other sources.

    // No zoom buttons: they crowded the bottom-right corner against the
    // locate control, and the explore map has done without them since day
    // one. Wheel and pinch zoom stay enabled.

    // Initial view. Falls back to a France-wide view rather than the Riviera
    // so users landing on /plan from anywhere on the coast aren't whisked to
    // the Med.
    //
    // When the explore map handed a camera over AND a route is waiting, we
    // open on the handed camera and animate to the route rather than cutting
    // straight to it. The move is what tells the user the map travelled
    // somewhere, instead of leaving them to work out that the coastline
    // changed under them.
    const routeBounds =
      waypoints.length >= 2
        ? L.latLngBounds(waypoints.map(([lat, lon]) => L.latLng(lat, lon)))
        : null;

    if (initialCenter && waypoints.length >= 1) {
      map.setView([initialCenter[0], initialCenter[1]], initialZoom ?? 8);
      // Deferred by a frame: flying before the container has its final size
      // lands on the wrong bounds, and PlanMap is mounted inside a flex row
      // that settles just after.
      const flyTimer = setTimeout(() => {
        map.invalidateSize();
        if (routeBounds) {
          map.flyToBounds(routeBounds, { ...routePadding(map), duration: 1.2 });
        } else {
          map.flyTo([waypoints[0][0], waypoints[0][1]], 10, { duration: 1.2 });
        }
      }, 80);
      flyTimerRef.current = flyTimer;
    } else if (routeBounds) {
      map.fitBounds(routeBounds, routePadding(map));
    } else if (waypoints.length === 1) {
      map.setView([waypoints[0][0], waypoints[0][1]], 10);
    } else if (initialCenter) {
      // Honour the zoom the explore map was at, so arriving with no route
      // yet does not jump the camera.
      map.setView([initialCenter[0], initialCenter[1]], initialZoom ?? 8);
    } else {
      map.setView([46.5, 2.5], 5);
    }

    mapRef.current = map;

    // Every pointer of the window feeds the tap guard, so that a click can be
    // matched with the gesture that produced it: a finger resting on the map
    // while it looks for the drawer handle, or one that went down on the
    // drawer and came up over the map, must not place a waypoint. Window
    // rather than container: a gesture that starts outside has to be seen
    // to be refused, and a second finger anywhere spoils a tap.
    const guard = new TapGuard();
    tapGuardRef.current = guard;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      guard.pointerDown({
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        inside: !!target && container.contains(target),
        onMarker: !!target?.closest(".leaflet-marker-icon"),
        mouse: e.pointerType === "mouse",
        button: e.button,
      });
    };
    const onPointerMove = (e: PointerEvent) =>
      guard.pointerMove({ pointerId: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() });
    const onPointerUp = (e: PointerEvent) =>
      guard.pointerUp({ pointerId: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() });
    const onPointerCancel = (e: PointerEvent) =>
      guard.pointerCancel({ pointerId: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() });
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);

    // Map click — for adding waypoints (guarded by onMapClickRef), and only
    // when the click is the tail of a clean tap.
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (isDraggingRef.current || !onMapClickRef.current) return;
      if (!guard.acceptClick(performance.now())) return;
      onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

    // Re-evaluate the segment labels on zoom: the screen-length auto-hide
    // threshold means legs appear/disappear as the scale changes.
    const onZoomEnd = () => drawSegLabels(map, livePositionsRef.current);
    map.on("zoomend", onZoomEnd);

    // Report the settled viewport for the search proximity bias.
    map.on("moveend", () => {
      const c = map.getCenter();
      onViewChangeRef.current?.({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
    });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      if (flyTimerRef.current) clearTimeout(flyTimerRef.current);
      ro.disconnect();
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      tapGuardRef.current = null;
      map.off("zoomend", onZoomEnd);
      segLabelsRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marine-chart overlay. Declared AFTER the init effect on purpose: effects
  // fire in declaration order, so on mount the map already exists here and a
  // returning user gets back the overlay they left on. Kept out of the init
  // effect itself because the toggle also flips while the map is alive.
  useEffect(() => {
    if (!mapRef.current) return;
    syncSeamarkLayer(mapRef.current, seamarkLayerRef, showSeamarks);
  }, [showSeamarks]);

  // Update cursor when onMapClick is active
  useEffect(() => {
    const container = mapRef.current?.getContainer();
    if (!container) return;
    container.style.cursor = onMapClick ? "crosshair" : "";
  }, [onMapClick]);

  // Gray out markers when stale (no full redraw)
  useEffect(() => {
    for (const m of markersRef.current) {
      const el = m.getElement()?.querySelector("div") as HTMLElement | null;
      if (el) el.style.opacity = isStale ? "0.45" : "1";
    }
  }, [isStale]);

  // Draw the waypoint markers.
  //
  // Two models, chosen by the primary pointer. With a mouse, Leaflet's own
  // drag (immediate, from the first pixel) and a × badge on hover, on the
  // corner of the disc. With a finger, the badge is always visible and sits
  // above the disc, clear of it: it used to cover the centre of the disc,
  // and Chrome snaps taps to the nearest button, so every touch deleted the
  // waypoint and none could move it. On touch a tap on the badge removes the
  // waypoint; a press held past WAYPOINT_GRAB_MS, on the disc or on the
  // badge, picks the waypoint up; a tap on the disc does nothing; and a
  // finger that moves before the grab fires pans the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const coarse = isCoarsePointer();
    const bornAt = performance.now();
    const disposers: Array<() => void> = [];

    // Dashed preview of the route while one waypoint is being moved, with
    // the live leg lengths. Shared by both drag models.
    const previewMove = (i: number, ll: L.LatLng) => {
      const positions = [...livePositionsRef.current];
      positions[i] = [ll.lat, ll.lng];
      livePositionsRef.current = positions;
      const lls = positions.map(([la, lo]) => L.latLng(la, lo));
      if (!dragLineRef.current) {
        dragLineRef.current = L.polyline(lls, {
          color: readToken("--ow-marker-idle"),
          weight: 3,
          dashArray: "6 4",
          opacity: 0.85,
          interactive: false,
        }).addTo(map);
      } else {
        dragLineRef.current.setLatLngs(lls);
      }
      drawSegLabels(map, positions);
    };
    const clearPreview = () => {
      if (dragLineRef.current) {
        dragLineRef.current.remove();
        dragLineRef.current = null;
      }
    };

    // Touch model. Pointer Events, captured on the icon: Chrome delivers
    // pointermove inside its slop (it withholds touchmove there), so the
    // hold can be watched, and the capture keeps the up event on the icon
    // wherever the finger ends. Touch events are untouched by the capture,
    // which is what lets Leaflet pan the map when the hold is cancelled
    // and pinch it when a second finger lands. The × badge is handled here
    // too, from the same pointer stream: its tap is read at pointerup rather
    // than from the click, which the map's tap guard refuses anyway, and a
    // press on it that outlives the grab delay is a grab like any other.
    const wireTouchMarker = (marker: L.Marker, el: HTMLElement, i: number): (() => void) => {
      // A held finger raises the native context menu; a double tap must
      // not reach the map either.
      L.DomEvent.on(el, "dblclick contextmenu", L.DomEvent.stop);

      let pressed: { id: number; x: number; y: number; t: number; onBadge: boolean } | null = null;
      let lifted = false;
      let origin: L.LatLng | null = null;
      // Where the marker sits relative to the finger at the grab, kept for
      // the whole drag: grabbed by the badge, the disc stays 30 px under
      // the finger instead of jumping up under it.
      let grabOffset = L.point(0, 0);
      let timer: ReturnType<typeof setTimeout> | null = null;

      const disarm = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };
      const settle = (commit: boolean) => {
        if (!lifted) return;
        lifted = false;
        el.classList.remove("ow-wpt-lifted");
        clearPreview();
        map.dragging.enable();
        if (commit) {
          // A grab released where it started (a slow tap on the ×, a
          // change of mind) leaves the route as it was, not "to recompute".
          const pos = marker.getLatLng();
          if (!origin || !pos.equals(origin)) onWptMove(i, pos.lat, pos.lng);
        } else if (origin) {
          marker.setLatLng(origin);
          livePositionsRef.current = waypoints;
          drawSegLabels(map, waypoints);
        }
        setTimeout(() => { isDraggingRef.current = false; }, 150);
      };
      const onDown = (e: PointerEvent) => {
        if (!e.isPrimary || pressed) return;
        const onBadge = e.target instanceof Element && !!e.target.closest(".ow-wpt-x");
        pressed = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), onBadge };
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Not capturable: the hold still works while the finger stays on
          // the icon, which a still finger does.
        }
        timer = setTimeout(() => {
          timer = null;
          if (!pressed) return;
          lifted = true;
          origin = marker.getLatLng();
          grabOffset = map
            .latLngToContainerPoint(origin)
            .subtract(map.mouseEventToContainerPoint({ clientX: pressed.x, clientY: pressed.y } as MouseEvent));
          isDraggingRef.current = true;
          // The map's own drag was armed by the same touch; from here the
          // finger moves the waypoint, not the map.
          map.dragging.disable();
          el.classList.add("ow-wpt-lifted");
          try {
            navigator.vibrate?.(10);
          } catch {
            // Optional feedback.
          }
          previewMove(i, marker.getLatLng());
        }, WAYPOINT_GRAB_MS);
      };
      const onMove = (e: PointerEvent) => {
        if (!pressed || e.pointerId !== pressed.id) return;
        if (!lifted) {
          // Moving before the hold fires means a pan: let go, Leaflet has it.
          if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > HOLD_SLOP_PX) {
            disarm();
            pressed = null;
          }
          return;
        }
        const ll = map.containerPointToLatLng(map.mouseEventToContainerPoint(e).add(grabOffset));
        marker.setLatLng(ll);
        previewMove(i, ll);
      };
      const onUp = (e: PointerEvent) => {
        if (!pressed || e.pointerId !== pressed.id) return;
        const start = pressed;
        pressed = null;
        disarm();
        if (lifted) {
          settle(true);
          return;
        }
        // Released before the grab fired: a tap. On the disc it does
        // nothing; on the × it removes the point.
        if (!start.onBadge) return;
        const now = performance.now();
        const tap = Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_SLOP_PX;
        // A marker younger than the settle time was created by the tap
        // before this one: the second tap of a double tap is not a request
        // to remove it.
        if (tap && now - bornAt > MARKER_SETTLE_MS) onWptDeleteRef.current?.(i);
      };
      const onCancel = (e: PointerEvent) => {
        if (!pressed || e.pointerId !== pressed.id) return;
        pressed = null;
        disarm();
        settle(false);
      };

      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onCancel);
      return () => {
        disarm();
        settle(false);
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onCancel);
      };
    };

    // Finish-flag icon for the last waypoint (Lucide-style flag).
    const flagSvg =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>' +
      '<line x1="4" y1="22" x2="4" y2="15"/>' +
      '</svg>';

    waypoints.forEach(([lat, lon], i) => {
      const isFirst = i === 0;
      const isLast = i === waypoints.length - 1 && waypoints.length > 1;
      // Number every waypoint 1..N so labels match the sidebar legs; last gets a flag.
      const label = isLast ? flagSvg : String(i + 1);
      const bg = readToken(
        isFirst ? "--ow-marker-active" : isLast ? "--ow-marker-end" : "--ow-marker-idle",
      );
      const marker = L.marker([lat, lon], {
        icon: waypointIcon(label, bg, !!onWptDelete),
        draggable: !coarse,
      }).addTo(map);
      const el = marker.getElement();

      if (coarse) {
        if (el) disposers.push(wireTouchMarker(marker, el, i));
        markersRef.current.push(marker);
        return;
      }

      // Mouse model. Stop marker clicks from bubbling to the map (would
      // re-add a wpt); the tap guard refuses them too, belt and braces.
      if (el) L.DomEvent.disableClickPropagation(el);

      // Wire delete-X button (rendered inside the divIcon)
      const xBtn = el?.querySelector<HTMLButtonElement>(".ow-wpt-x");
      if (xBtn) {
        L.DomEvent.disableClickPropagation(xBtn);
        // Only stop propagation — calling preventDefault on touchstart would
        // suppress the synthesized click event on touch devices, leaving the
        // button visibly pressed but unresponsive on release.
        L.DomEvent.on(xBtn, "mousedown touchstart pointerdown", (ev) => {
          L.DomEvent.stopPropagation(ev as Event);
        });
        L.DomEvent.on(xBtn, "click", (ev) => {
          L.DomEvent.stop(ev as Event);
          onWptDeleteRef.current?.(i);
        });
      }

      marker.on("dragstart", () => {
        isDraggingRef.current = true;
      });

      marker.on("drag", () => {
        previewMove(i, marker.getLatLng());
      });

      marker.on("dragend", () => {
        clearPreview();
        const pos = marker.getLatLng();
        onWptMove(i, pos.lat, pos.lng);
        setTimeout(() => { isDraggingRef.current = false; }, 150);
      });

      markersRef.current.push(marker);
    });

    return () => {
      for (const dispose of disposers) dispose();
    };
    // resolvedTheme: the waypoint colours are read from the theme, and
    // Leaflet keeps the resolved string in the icon markup. `lang` for the
    // same reason, applied to the label of the delete button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, resolvedTheme, lang]);

  // Fill the sounding slot of each waypoint icon.
  //
  // Written into the existing DOM rather than folded into the marker effect
  // above: soundings land one by one, and rebuilding every marker each time
  // one arrives would drop a drag in progress. Declared after that effect so
  // a fresh set of markers is filled in the same commit it is created.
  useEffect(() => {
    markersRef.current.forEach((marker, i) => {
      const slot = marker.getElement()?.querySelector<HTMLElement>(".ow-wpt-depth");
      if (!slot) return;
      const depth = depths?.[i];
      slot.textContent = typeof depth === "number" ? fmtDepthM(depth) : "";
    });
  }, [depths, waypoints]);

  // NB: no auto fit-bounds on waypoint changes. Re-fitting on every placement
  // yanked the camera away while the user was still composing their route.
  // The camera now only re-frames on explicit Calculer / Comparer, via the
  // imperative `fitToWaypoints()` handle above.

  // Draw the route: gray while loading/stale, colored per segment when fresh.
  //
  // The drawn lines are not what catches the click. Leaflet's SVG hit area
  // is the stroke itself, 5 to 6 px, under a millimetre for a finger; and a
  // miss landed on the map and appended a waypoint at the end of the route.
  // An invisible line, as wide as a finger needs, is laid over each leg and
  // carries the insertion. The tap is projected onto the leg, so a tap 10 px
  // off the line inserts a waypoint on the line.
  useEffect(() => {
    const map = mapRef.current;
    const guard = tapGuardRef.current;
    if (!map || !guard) return;

    for (const p of polylinesRef.current) p.remove();
    polylinesRef.current = [];

    if (waypoints.length < 2) {
      drawSegLabels(map, waypoints);
      return;
    }

    const hitWeight = isCoarsePointer() ? SEGMENT_HIT_PX.coarse : SEGMENT_HIT_PX.fine;
    const toLatLngs = (path: [number, number][]) => path.map(([la, lo]) => L.latLng(la, lo));
    const addHitLine = (path: [number, number][], afterIdxOf: (segIdx: number) => number) => {
      const hit = L.polyline(toLatLngs(path), {
        weight: hitWeight,
        opacity: 0,
        className: "ow-seg-hit",
        bubblingMouseEvents: false,
      }).addTo(map);
      hit.on("click", (e: L.LeafletMouseEvent) => {
        if (isDraggingRef.current || !onWptAddRef.current) return;
        if (!guard.acceptClick(performance.now())) return;
        const pts = path.map(([la, lo]) => map.latLngToLayerPoint([la, lo]));
        const best = closestOnPolyline(pts, map.latLngToLayerPoint(e.latlng));
        if (!best) return;
        const ll = map.layerPointToLatLng(L.point(best.point.x, best.point.y));
        onWptAddRef.current(afterIdxOf(best.segIdx), ll.lat, ll.lng);
      });
      polylinesRef.current.push(hit);
    };

    if (!segments || isStale) {
      // Dashed + faded only when the line is provisional (loading or stale).
      // A fresh route without per-segment colors (e.g. compare mode) draws as
      // a solid neutral line so it doesn't read as "not computed yet".
      const line = L.polyline(toLatLngs(waypoints), {
        color: readToken("--ow-marker-idle"),
        weight: 5,
        dashArray: isStale ? "6 4" : undefined,
        opacity: isStale ? 0.7 : 0.85,
        interactive: false,
      }).addTo(map);
      polylinesRef.current.push(line);
      // One line through every waypoint: segment i of the line is leg i.
      addHitLine(waypoints, (segIdx) => segIdx);
      // Live leg lengths while the route is being traced / not yet computed.
      drawSegLabels(map, waypoints);
      return;
    }

    // Route is computed: per-leg distance now lives in the sidebar, so drop
    // the on-map tracing labels to keep the colored segments uncluttered.
    drawSegLabels(map, []);

    segments.forEach((seg) => {
      const color = readToken(cxLevelToken(cxLevel(seg.tws_kn)));
      const line = L.polyline(
        [L.latLng(seg.start.lat, seg.start.lon), L.latLng(seg.end.lat, seg.end.lon)],
        { color, weight: 6, opacity: 0.9, interactive: false }
      ).addTo(map);
      polylinesRef.current.push(line);
    });

    // A computed leg is several segments (one per step of the passage), so
    // a segment's index is not a waypoint's: inserting "after segment 4" of
    // a three-waypoint route used to splice past the end and append. One
    // hit line per leg, inserting after that leg's first waypoint.
    computeLegSegmentRanges(segments, waypoints).forEach(([s, e], legIdx) => {
      const slice = segments.slice(s, e);
      if (slice.length === 0) return;
      const path: [number, number][] = [
        [slice[0].start.lat, slice[0].start.lon],
        ...slice.map((seg): [number, number] => [seg.end.lat, seg.end.lon]),
      ];
      addHitLine(path, () => legIdx);
    });
  }, [waypoints, segments, isStale]);

  // Selected-leg highlight overlay, drawn on top of the colored segments in
  // the brand accent so it pops against the wind palette. Small ticks mark
  // the boundaries between the leg's steps, so the strip in the panel and
  // the line on the map cut the leg in the same places. Not interactive:
  // it sits above the hit lines, and Leaflet hands a click on an inert
  // layer to the map, which appended a waypoint at the end of the route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (highlightLayerRef.current) {
      highlightLayerRef.current.remove();
      highlightLayerRef.current = null;
    }
    if (!highlightedSegmentRange || !segments || segments.length === 0) return;
    const [s, e] = highlightedSegmentRange;
    if (s < 0 || e <= s || s >= segments.length) return;
    const slice = segments.slice(s, Math.min(e, segments.length));
    if (slice.length === 0) return;
    const path: L.LatLngExpression[] = [
      L.latLng(slice[0].start.lat, slice[0].start.lon),
      ...slice.map((seg) => L.latLng(seg.end.lat, seg.end.lon)),
    ];
    // Re-read on every theme change: the light palette darkens the accent,
    // and this overlay used to carry its own copy of both hex values.
    const accent = readToken("--ow-accent");
    const onAccent = readToken("--ow-on-accent");
    const overlay = L.polyline(path, {
      color: accent,
      weight: 10,
      opacity: 0.85,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    });
    const ticks = slice.slice(0, -1).map((seg) =>
      L.circleMarker([seg.end.lat, seg.end.lon], {
        radius: 3,
        color: accent,
        weight: 1.5,
        fillColor: onAccent,
        fillOpacity: 0.95,
        interactive: false,
      }),
    );
    const group = L.layerGroup([overlay, ...ticks]).addTo(map);
    overlay.bringToFront();
    for (const t of ticks) t.bringToFront();
    highlightLayerRef.current = group;
  }, [highlightedSegmentRange, segments, resolvedTheme]);

  // The step open in the panel: its own segment drawn over the leg
  // highlight, in the wind band of that step so it matches the block the
  // user tapped in the strip, with a white casing so it reads as a piece
  // laid on the line rather than a change of the line's colour. Declared
  // after the highlight effect so that, when both redraw in one commit, the
  // step ends up above the leg.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (focusLayerRef.current) {
      focusLayerRef.current.remove();
      focusLayerRef.current = null;
    }
    if (focusedSegmentIdx == null || !segments) return;
    const seg = segments[focusedSegmentIdx];
    if (!seg) return;
    const path: L.LatLngExpression[] = [
      L.latLng(seg.start.lat, seg.start.lon),
      L.latLng(seg.end.lat, seg.end.lon),
    ];
    const casing = L.polyline(path, {
      color: readToken("--ow-on-accent"),
      weight: 14,
      opacity: 0.95,
      lineCap: "round",
      interactive: false,
    });
    const step = L.polyline(path, {
      color: readToken(cxLevelToken(cxLevel(seg.tws_kn))),
      weight: 8,
      opacity: 1,
      lineCap: "round",
      interactive: false,
    });
    const group = L.layerGroup([casing, step]).addTo(map);
    casing.bringToFront();
    step.bringToFront();
    focusLayerRef.current = group;
  }, [focusedSegmentIdx, segments, resolvedTheme]);

  return <div ref={containerRef} className="w-full h-full" />;
});
