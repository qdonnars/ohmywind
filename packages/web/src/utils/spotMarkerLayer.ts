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
import { readToken } from "../design/tokens";

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

/** Bigger, brighter and ringed when the spot is the one being read. Colours
    come from the theme rather than from four hex values written here: Leaflet
    wants a resolved string, so they are read at draw time. */
function styleFor(active: boolean, numbered: boolean) {
  if (numbered) {
    // The comparison map: every spot is one being read, so all of them carry
    // the accent, and the focused one is only bigger. Wide enough for the
    // digit the marker holds, which is what names the spot here.
    return {
      radius: active ? 11 : 9,
      color: readToken("--ow-marker-stroke"),
      fillColor: readToken("--ow-marker-active"),
      fillOpacity: 0.95,
      weight: 2,
    };
  }
  return {
    radius: active ? 10 : 7,
    color: readToken(active ? "--ow-marker-stroke" : "--ow-marker-stroke-idle"),
    fillColor: readToken(active ? "--ow-marker-active" : "--ow-marker-idle"),
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
  /** Rank of each spot, by `spotKey`, when the map numbers them instead of
      naming them: four labels at the scale of a coastline overlap into an
      unreadable pile, a digit inside the marker never does. The same number
      keys the row in the comparison table. Fixed for the life of a marker,
      so a map must not change its mind about numbering. */
  numbers?: ReadonlyMap<string, number>;
}

/** Reconcile the saved-spot markers with `spots`, restyling what stays. */
export function syncSpotMarkers({
  map,
  markers,
  elementToSpot,
  spots,
  current,
  onSelect,
  numbers,
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
    const number = numbers?.get(key);
    const style = styleFor(isAt(spot, current), number != null);
    const existing = markers.get(key);
    if (existing) {
      existing.setStyle(style);
      // Unticking the third favourite must not renumber the fourth, but a
      // favourite deleted or added does shift the ranks below it, so the
      // digit is rewritten on every sync rather than bound once.
      if (number != null) existing.setTooltipContent(String(number));
      continue;
    }
    const marker = L.circleMarker([spot.latitude, spot.longitude], {
      ...style,
      // Leaflet paths default to this anyway; spelled out because it is what
      // keeps a marker click from also reaching the map's own click handler,
      // which would preview open water on top of selecting the spot.
      bubblingMouseEvents: false,
    })
      .bindTooltip(
        number != null ? String(number) : spot.name,
        number != null
          ? { permanent: true, direction: "center", offset: [0, 0], className: "spot-number" }
          : { direction: "top", offset: [0, -10], className: "spot-tooltip" },
      )
      .on("click", () => onSelect(spot))
      .addTo(map);
    const svgEl = (marker as unknown as WithSvgPath)._path;
    if (svgEl) {
      elementToSpot.set(svgEl, spot);
      // The tooltip is the marker's accessible name, and on a numbered map
      // it holds a digit: the spot still has to say what it is.
      if (number != null) svgEl.setAttribute("aria-label", spot.name);
    }
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
  const accent = readToken("--ow-marker-active");
  layerRef.current = L.circleMarker([current.latitude, current.longitude], {
    radius: 9,
    color: accent,
    weight: 2.5,
    dashArray: "4 3",
    fillColor: accent,
    fillOpacity: 0.25,
    interactive: false,
  }).addTo(map);
}
