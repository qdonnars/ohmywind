import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../design/theme";
import type { SegmentReport } from "./types";
import { cxLevel, CX_COLORS } from "./types";

export interface PlanMapHandle {
  recenter: (lat: number, lon: number) => void;
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
}

function waypointIcon(label: string, bg: string, deletable: boolean): L.DivIcon {
  const xBtn = deletable
    ? `<button type="button" class="ow-wpt-x" aria-label="Supprimer ce point">×</button>`
    : "";
  return L.divIcon({
    html: `<div class="ow-wpt"><div class="ow-wpt-circle" style="background:${bg}">${label}</div>${xBtn}</div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export const PlanMap = forwardRef<PlanMapHandle, PlanMapProps>(function PlanMap(
  { waypoints, segments, isStale, onWptMove, onWptAdd, onWptDelete, onMapClick, highlightedSegmentRange }: PlanMapProps,
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const polylinesRef = useRef<L.Polyline[]>([]);
  const highlightLineRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const dragLineRef = useRef<L.Polyline | null>(null);
  const livePositionsRef = useRef<[number, number][]>(waypoints);
  const isDraggingRef = useRef(false);
  const onWptAddRef = useRef(onWptAdd);
  const onWptDeleteRef = useRef(onWptDelete);
  const onMapClickRef = useRef(onMapClick);
  const { resolvedTheme } = useTheme();

  useEffect(() => { onWptAddRef.current = onWptAdd; }, [onWptAdd]);
  useEffect(() => { onWptDeleteRef.current = onWptDelete; }, [onWptDelete]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  useImperativeHandle(ref, () => ({
    recenter(lat, lon) {
      mapRef.current?.setView([lat, lon], 12, { animate: true });
    },
  }));

  useEffect(() => {
    livePositionsRef.current = waypoints;
  }, [waypoints]);

  // Switch tiles on theme change
  useEffect(() => {
    if (!tileLayerRef.current) return;
    const variant = resolvedTheme === "light" ? "light_all" : "dark_all";
    tileLayerRef.current.setUrl(`https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`);
  }, [resolvedTheme]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false });

    const variant = resolvedTheme === "light" ? "light_all" : "dark_all";
    const tile = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`, {
      maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current = tile;

    L.control.attribution({ position: "bottomright", prefix: false })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>')
      .addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Initial view: fit bounds if ≥2 waypoints, else Marseille/Riviera area
    if (waypoints.length >= 2) {
      map.fitBounds(L.latLngBounds(waypoints.map(([lat, lon]) => L.latLng(lat, lon))), { padding: [40, 40] });
    } else if (waypoints.length === 1) {
      map.setView([waypoints[0][0], waypoints[0][1]], 10);
    } else {
      map.setView([43.1, 5.9], 8);
    }

    mapRef.current = map;

    // Map click — for adding initial waypoints (guarded by onMapClickRef)
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (isDraggingRef.current || !onMapClickRef.current) return;
      onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current!);
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Draw draggable waypoint markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

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
      const bg = isFirst ? "#2dd4bf" : isLast ? "#e84118" : "#6b7280";
      const marker = L.marker([lat, lon], {
        icon: waypointIcon(label, bg, !!onWptDelete),
        draggable: true,
      }).addTo(map);

      // Stop marker clicks from bubbling to the map (would re-add a wpt).
      const el = marker.getElement();
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
        const pos = marker.getLatLng();
        const positions = [...livePositionsRef.current];
        positions[i] = [pos.lat, pos.lng];
        livePositionsRef.current = positions;
        const lls = positions.map(([la, lo]) => L.latLng(la, lo));
        if (!dragLineRef.current) {
          dragLineRef.current = L.polyline(lls, {
            color: "#6b7280",
            weight: 3,
            dashArray: "6 4",
            opacity: 0.85,
          }).addTo(map);
        } else {
          dragLineRef.current.setLatLngs(lls);
        }
      });

      marker.on("dragend", () => {
        if (dragLineRef.current) {
          dragLineRef.current.remove();
          dragLineRef.current = null;
        }
        const pos = marker.getLatLng();
        onWptMove(i, pos.lat, pos.lng);
        setTimeout(() => { isDraggingRef.current = false; }, 150);
      });

      markersRef.current.push(marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints]);

  // Draw polyline — gray while loading/stale, colored per segment when fresh
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const p of polylinesRef.current) p.remove();
    polylinesRef.current = [];

    if (waypoints.length < 2) return;

    if (!segments || isStale) {
      const line = L.polyline(waypoints.map(([lat, lon]) => L.latLng(lat, lon)), {
        color: "#6b7280",
        weight: 5,
        dashArray: "6 4",
        opacity: 0.7,
      }).addTo(map);
      line.on("click", (e: L.LeafletMouseEvent) => {
        if (isDraggingRef.current || !onWptAddRef.current) return;
        L.DomEvent.stopPropagation(e);
        const click = e.latlng;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < waypoints.length - 1; i++) {
          const mid = L.latLng(
            (waypoints[i][0] + waypoints[i + 1][0]) / 2,
            (waypoints[i][1] + waypoints[i + 1][1]) / 2,
          );
          const d = click.distanceTo(mid);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        onWptAddRef.current(bestIdx, click.lat, click.lng);
      });
      polylinesRef.current = [line];
      return;
    }

    segments.forEach((seg, i) => {
      const color = CX_COLORS[cxLevel(seg.tws_kn)];
      const line = L.polyline(
        [L.latLng(seg.start.lat, seg.start.lon), L.latLng(seg.end.lat, seg.end.lon)],
        { color, weight: 6, opacity: 0.9 }
      ).addTo(map);
      line.on("click", (e: L.LeafletMouseEvent) => {
        if (isDraggingRef.current || !onWptAddRef.current) return;
        L.DomEvent.stopPropagation(e);
        onWptAddRef.current(i, e.latlng.lat, e.latlng.lng);
      });
      polylinesRef.current.push(line);
    });
  }, [waypoints, segments, isStale]);

  // Selected-leg highlight overlay — drawn on top of the colored segments,
  // using the brand accent color so it pops against the wind palette.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (highlightLineRef.current) {
      highlightLineRef.current.remove();
      highlightLineRef.current = null;
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
    const accent = resolvedTheme === "light" ? "#0f766e" : "#2dd4bf";
    const overlay = L.polyline(path, {
      color: accent,
      weight: 10,
      opacity: 0.85,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
    overlay.bringToFront();
    highlightLineRef.current = overlay;
  }, [highlightedSegmentRange, segments, resolvedTheme]);

  return <div ref={containerRef} className="w-full h-full" />;
});
