// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The world lattice of the land tiles: the TypeScript twin of
 * `openwind_data.routing.auto_route.land_tiles` (see that module for the
 * lattice and the archive's layout).
 *
 * Every expression here is written in the order of its Python twin. The
 * route repair must find the same route in the browser as on the server,
 * and floating point only promises that to the same operations in the same
 * order: `lat * (Math.PI / 180)` is not `lat * Math.PI / 180` to the last
 * bit.
 */

export const TILES = 512;
export const TILE_PX = 1280;
export const WORLD_PX = TILES * TILE_PX;
/** A tile's state in the index; 0 is all sea. */
export const LAND = 1;
export const MIXED = 2;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
export const MAX_LAT = Math.atan(Math.sinh(Math.PI)) * RAD_TO_DEG;
const M_PER_DEG = 111_195;

export function colOf(lon: number): number {
  return ((lon + 180) / 360) * WORLD_PX;
}

export function rowOf(lat: number): number {
  return (0.5 + Math.asinh(Math.tan(lat * DEG_TO_RAD)) / (2 * Math.PI)) * WORLD_PX;
}

export function lonOf(col: number): number {
  return (col / WORLD_PX) * 360 - 180;
}

export function latOf(row: number): number {
  return Math.atan(Math.sinh((row / WORLD_PX - 0.5) * 2 * Math.PI)) * RAD_TO_DEG;
}

/** Side of a pixel on the ground at this latitude, in metres, to the
    micrometre (as its twin: a cosine is not the same to the last bit in
    every language). */
export function pixelM(lat: number): number {
  return (
    Math.floor((360 / WORLD_PX) * M_PER_DEG * Math.cos(lat * DEG_TO_RAD) * 1e6 + 0.5) / 1e6
  );
}
