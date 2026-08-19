// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import L from "leaflet";

/**
 * OpenSeaMap "seamark" overlay: the aids to navigation rendered from the
 * ``seamark:*`` tags of OpenStreetMap, in standard IALA symbology. Buoys,
 * beacons, lighthouses with their light sectors, harbours and marinas.
 *
 * Raster, not vector: OpenSeaMap renders the tiles for us, so the whole
 * layer costs one URL and zero payload in the bundle. The trade-off is that
 * nothing is clickable and the symbols are drawn for a paper-chart
 * background, i.e. mostly black. See ``index.css`` for the halo that keeps
 * them legible on the dark basemap.
 *
 * No minimum zoom on purpose. A screenful of tiles costs the same at every
 * scale, and the OpenSeaMap style already drops the minor marks as you zoom
 * out, so gating the layer would only make the toggle look broken to
 * someone who pressed it while the whole coast was in view.
 */
const SEAMARK_URL = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";

/** Deepest zoom OpenSeaMap actually renders. Past it Leaflet upscales the
    z18 tile instead of asking for a tile that does not exist. */
export const SEAMARK_MAX_NATIVE_ZOOM = 18;

/** Own pane, between the basemap (200) and the route overlay (400): the
    marks must sit over the coastline but under the planned track, which is
    the thing the user is actually manipulating. */
export const SEAMARK_PANE = "seamarks";

/** Creates the dedicated pane. Call once, right after the map is built. */
export function createSeamarkPane(map: L.Map): void {
  if (map.getPane(SEAMARK_PANE)) return;
  const pane = map.createPane(SEAMARK_PANE);
  pane.style.zIndex = "250";
  // Purely decorative: clicks belong to the basemap underneath, which is
  // what adds a waypoint on /plan and opens a spot on the explore map.
  pane.style.pointerEvents = "none";
}

/**
 * Idempotently reflect `enabled` onto the map. Mirrors
 * ``syncUserPositionLayer`` so both shared map layers are wired the same way
 * from the two map components.
 */
export function syncSeamarkLayer(
  map: L.Map,
  layerRef: { current: L.TileLayer | null },
  enabled: boolean,
): void {
  if (!enabled) {
    layerRef.current?.remove();
    layerRef.current = null;
    return;
  }
  if (layerRef.current) {
    if (map.hasLayer(layerRef.current)) return;
    // The ref outlived the map it was attached to. Both map components tear
    // their map down and build a new one on remount, and React StrictMode
    // does exactly that on every dev mount, so a bare truthiness check here
    // silently skipped attaching the overlay to the live map.
    layerRef.current.remove();
    layerRef.current = null;
  }

  createSeamarkPane(map);
  layerRef.current = L.tileLayer(SEAMARK_URL, {
    pane: SEAMARK_PANE,
    maxNativeZoom: SEAMARK_MAX_NATIVE_ZOOM,
    maxZoom: 19,
  }).addTo(map);
}
