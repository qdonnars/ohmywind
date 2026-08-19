// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Size policy for the lighthouse symbol drawn over the OpenSeaMap raster.
 *
 * Split out from the layer that uses it because it is the only part worth
 * arguing about, and because importing Leaflet drags in `window`, which the
 * test environment does not have.
 *
 * The star does NOT grow. It marks a position, and blowing it up turns a
 * coastline into a field of stars while saying nothing more than the raster
 * already said. What earns the space is the flare: the mark that says a
 * light burns here, in the colour it burns. That is what a navigator reads
 * from far out, so that is what scales.
 */

/** Matches what the raster draws, so the vector star lands on its twin and
    there is no seam when the two are both on screen. */
export const STAR_SIZE_PX = 11;

/**
 * Flare length in px for a zoom level.
 *
 * At z13 and in, it matches the raster flare and the two become one symbol.
 * Zoomed out it grows about 4.5 px per level, so a light reads as a light
 * across a whole basin. The cap keeps a dense coast, the Finistère being
 * the worst case, from turning into overlapping streaks.
 */
export function flareSizePx(zoom: number): number {
  const MIN = 16;
  const MAX = 40;
  const PIVOT_ZOOM = 13;
  const GROWTH_PER_LEVEL = 4.5;
  return Math.min(MAX, Math.max(MIN, MIN + (PIVOT_ZOOM - zoom) * GROWTH_PER_LEVEL));
}
