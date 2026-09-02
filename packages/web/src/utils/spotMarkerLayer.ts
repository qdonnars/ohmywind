// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The spot markers on the explore map, and the hollow one that marks a point
 * merely being previewed.
 *
 * Same shape as `userPositionLayer` and `seamarkLayer`: a plain function that
 * takes the map and the refs holding the current layers, and reconciles them
 * with what should be drawn. React owns the data; Leaflet owns the nodes.
 *
 * The element-to-spot map is the other half of the long-press menu: a press
 * lands on an SVG node, and this is what turns that node back into the spot it
 * draws. Only markers registered here open the rename/delete dialog.
 */

import L from "leaflet";
import type { Spot } from "../types";

// Leaflet renders a CircleMarker into an SVG node it keeps to itself: there is
// no public accessor, only the internal ``_path``. Hit-testing needs that node
// to map an element back to its spot, so the field is declared here instead of
// being reached through ``any`` — same escape hatch, but one that still type
// checks the property and its type.
type WithSvgPath = { _path?: Element };

/** Identity of a spot on the map: two spots at the same point are one marker. */
export function spotKey(s: Spot): string {
  return `${s.latitude},${s.longitude}`;
}

function isAt(spot: Spot, at: Spot | null): boolean {
  return at != null && spot.latitude === at.latitude && spot.longitude === at.longitude;
}

/** Bigger, brighter and ringed when the spot is the one being read. */
function styleFor(active: boolean) {
  return {
    radius: active ? 10 : 7,
    color: active ? "#ffffff" : "#9ca3af",
    fillColor: active ? "#2dd4bf" : "#6b7280",
    fillOpacity: active ? 0.9 : 0.6,
    weight: active ? 2.5 : 1,
  };
}

interface SyncSpotMarkersArgs {
  map: L.Map;
  /** Live markers, keyed by `spotKey`. Mutated in place. */
  markers: Map<string, L.CircleMarker>;
  /** SVG node to spot, for the long-press menu. Mutated in place. */
  elementToSpot: Map<Element, Spot>;
  spots: Spot[];
  /** The spot currently being read, or null. Drives the active style. */
  current: Spot | null;
  onSelect: (spot: Spot) => void;
}

/** Reconcile the saved-spot markers with `spots`, restyling what stays. */
export function syncSpotMarkers({
  map,
  markers,
  elementToSpot,
  spots,
  current,
  onSelect,
}: SyncSpotMarkersArgs): void {
  const desiredKeys = new Set(spots.map(spotKey));

  for (const [key, marker] of markers) {
    if (!desiredKeys.has(key)) {
      const svgEl = (marker as unknown as WithSvgPath)._path;
      if (svgEl) elementToSpot.delete(svgEl);
      marker.remove();
      markers.delete(key);
    }
  }

  for (const spot of spots) {
    const key = spotKey(spot);
    const style = styleFor(isAt(spot, current));
    const existing = markers.get(key);
    if (existing) {
      existing.setStyle(style);
      continue;
    }
    const marker = L.circleMarker([spot.latitude, spot.longitude], {
      ...style,
      // Leaflet paths default to this anyway; spelled out because it is what
      // keeps a marker click from also reaching the map's own click handler,
      // which would preview open water on top of selecting the spot.
      bubblingMouseEvents: false,
    })
      .bindTooltip(spot.name, {
        direction: "top",
        offset: [0, -10],
        className: "spot-tooltip",
      })
      .on("click", () => onSelect(spot))
      .addTo(map);
    const svgEl = (marker as unknown as WithSvgPath)._path;
    if (svgEl) elementToSpot.set(svgEl, spot);
    markers.set(key, marker);
  }
}

/**
 * The marker for a point being previewed but not saved.
 *
 * A previewed point is not in the spot list, so the markers above never draw
 * it, and the panel would be reading conditions at a place the map does not
 * show. Dashed and hollow, to read as provisional next to the solid saved
 * spots, and non-interactive: there is nothing to select, it is already open.
 */
export function syncPreviewMarker(
  map: L.Map,
  layerRef: { current: L.CircleMarker | null },
  current: Spot | null,
  savedSpots: Spot[],
): void {
  layerRef.current?.remove();
  layerRef.current = null;
  if (!current) return;
  if (savedSpots.some((s) => isAt(s, current))) return;
  layerRef.current = L.circleMarker([current.latitude, current.longitude], {
    radius: 9,
    color: "#2dd4bf",
    weight: 2.5,
    dashArray: "4 3",
    fillColor: "#2dd4bf",
    fillOpacity: 0.25,
    interactive: false,
  }).addTo(map);
}
