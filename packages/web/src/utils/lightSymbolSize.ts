// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * How big to draw a lighthouse, in px, for a given zoom.
 *
 * Split out from the layer that uses it because it is the only part worth
 * arguing about, and because importing Leaflet drags in `window`, which the
 * test environment does not have.
 *
 * Anchored at both ends by what the map actually needs. At z13 and in, the
 * OpenSeaMap raster symbology is legible on its own, so the vector star
 * matches its ~11 px and disappears into its raster twin: there is no
 * threshold to pop across. Zoomed out it grows about 3.8 px per level,
 * putting it near 2x the raster at z10 and near 3x at z9, the two scales
 * this was reported at. The cap stops a whole-France view from turning into
 * a field of stars.
 */
export function lightSizePx(zoom: number): number {
  const MIN = 11;
  const MAX = 28;
  const PIVOT_ZOOM = 13;
  const GROWTH_PER_LEVEL = 3.8;
  return Math.min(MAX, Math.max(MIN, MIN + (PIVOT_ZOOM - zoom) * GROWTH_PER_LEVEL));
}
