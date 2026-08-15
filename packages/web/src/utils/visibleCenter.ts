// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Where must the map centre go so a point of interest lands in the middle of
// the *visible* strip of the map, when a UI panel overlays the bottom
// `insetPx` pixels of the container? Answer: `insetPx / 2` screen pixels
// south of the point — the map centre sits below the point, which lifts the
// point into the centre of what the panel leaves uncovered.
//
// Pure Web-Mercator math, deliberately leaflet-free: leaflet touches the DOM
// and crashes the node vitest env (same rationale as utils/geo.ts). The
// projection matches Leaflet's default CRS (EPSG:3857, 256 px tiles), so the
// result can be fed straight to setView / panTo / flyTo.

const TILE_SIZE = 256;

/** Latitude → Mercator pixel Y at the given integer zoom. Exported for the
    tests, which verify the pixel-space contract rather than magic values. */
export function mercatorY(lat: number, zoom: number): number {
  const scale = TILE_SIZE * 2 ** zoom;
  const phi = (lat * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * scale;
}

function latFromMercatorY(y: number, zoom: number): number {
  const scale = TILE_SIZE * 2 ** zoom;
  return (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale)));
}

/**
 * Map centre that puts (`lat`, `lon`) in the middle of the visible strip —
 * container height minus the `insetPx` covered by the bottom panel.
 * Longitude is untouched: the panel only eats vertical space.
 */
export function centerForBottomInset(
  lat: number,
  lon: number,
  zoom: number,
  insetPx: number,
): { lat: number; lon: number } {
  if (!insetPx) return { lat, lon };
  return { lat: latFromMercatorY(mercatorY(lat, zoom) + insetPx / 2, zoom), lon };
}
