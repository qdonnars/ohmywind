// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The map viewport, carried across the explore <-> planner navigation.
 *
 * Both pages are separate documents, so the only way to keep the camera
 * still when the user switches mode is to hand the view over in the URL.
 * Parsing and building live together here so the two directions cannot
 * drift apart.
 */

export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

/** Leaflet's own bounds for the tile layers in use. */
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;

export function parseMapView(search: string): MapView | null {
  const params = new URLSearchParams(search);
  const center = params.get("center");
  if (!center) return null;
  const [rawLat, rawLon] = center.split(",");
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  // A center without a zoom comes from an older link, or from a deep link
  // someone typed by hand. Framing a region is the sane default there.
  // The emptiness check matters: Number(null) and Number("") are both 0, so
  // testing the converted value would silently pin those to the minimum
  // zoom and show the whole planet.
  const rawZoom = params.get("zoom");
  const parsedZoom = rawZoom === null || rawZoom.trim() === "" ? Number.NaN : Number(rawZoom);
  const zoom = Number.isFinite(parsedZoom)
    ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(parsedZoom)))
    : 8;

  return { lat, lon, zoom };
}

/** "?center=48.39,-4.49&zoom=10", or "" when there is no view to carry. */
export function mapViewQuery(view: MapView | null | undefined): string {
  if (!view) return "";
  return `?center=${view.lat.toFixed(5)},${view.lon.toFixed(5)}&zoom=${view.zoom}`;
}
