// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The maximum tidal current rasters of the methodology map: one 8-bit PNG
 * per served atlas (``scripts/build_tidal_world_raster.py``), pixel value
 * ``1 + round(kt * scale)``, 0 for no cell, rows already resampled to Web
 * Mercator. Pure functions and a small grid class; the map component turns
 * a grid into a coloured image overlay and asks it for the value under a
 * click.
 */

export interface RasterEntry {
  atlas: string;
  label: string;
  resolution_m: number;
  /** Cascade rank of the atlas (3 estuary, 2 coastal, 1 shelf, 0 basin). */
  rank?: number;
  file: string;
  /** ``[[south, west], [north, east]]`` in degrees. */
  bounds: [[number, number], [number, number]];
  scale: number;
  cells: number;
}

export interface RasterManifest {
  generated_at: string;
  scale: number;
  rasters: RasterEntry[];
}

/** Colour stops of the green ramp: light at 0.5 kt, dark at 5 kt and above. */
export const RAMP_STOPS: readonly [number, string][] = [
  [0.5, "#b5dfc1"],
  [1, "#86ca9c"],
  [1.5, "#5cb47b"],
  [2, "#3a9d5f"],
  [3, "#238247"],
  [5, "#0f5f31"],
];
/** Covered water under the first stop: the tide is not worth a look here. */
export const CALM_COLOR = "#d9ecdf";

function hex(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The ramp colour of a maximum current, continuous between the stops,
    clamped at the last one; the calm colour under the first. */
export function rampRgb(kt: number): [number, number, number] {
  if (!(kt >= RAMP_STOPS[0][0])) return hex(CALM_COLOR);
  for (let i = 1; i < RAMP_STOPS.length; i++) {
    const [k1, c1] = RAMP_STOPS[i];
    if (kt <= k1) {
      const [k0, c0] = RAMP_STOPS[i - 1];
      const t = (kt - k0) / (k1 - k0);
      const a = hex(c0);
      const b = hex(c1);
      return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
    }
  }
  return hex(RAMP_STOPS[RAMP_STOPS.length - 1][1]);
}

export function rampColor(kt: number): string {
  const [r, g, b] = rampRgb(kt);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** A CSS gradient of the ramp, for the legend. */
export function rampGradient(): string {
  const [k0] = RAMP_STOPS[0];
  const [kn] = RAMP_STOPS[RAMP_STOPS.length - 1];
  const parts = RAMP_STOPS.map(([k, c]) => `${c} ${Math.round(((k - k0) / (kn - k0)) * 100)}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

/** Knots from a pixel value, ``null`` for no cell. */
export function decodePixel(value: number, scale: number): number | null {
  return value > 0 ? (value - 1) / scale : null;
}

const mercY = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360));

/** One decoded raster: its pixel values (north to south) and where they sit. */
export class RasterGrid {
  readonly entry: RasterEntry;
  readonly width: number;
  readonly height: number;
  /** One byte per pixel, row 0 at the north edge. */
  readonly values: Uint8Array | Uint8ClampedArray;
  readonly ySouth: number;
  readonly yNorth: number;

  constructor(entry: RasterEntry, width: number, height: number, values: Uint8Array | Uint8ClampedArray) {
    this.entry = entry;
    this.width = width;
    this.height = height;
    this.values = values;
    this.ySouth = mercY(entry.bounds[0][0]);
    this.yNorth = mercY(entry.bounds[1][0]);
  }

  /** The maximum current at a point, ``null`` outside the image or with no cell. */
  valueAt(lat: number, lon: number): number | null {
    const [[south, west], [north, east]] = this.entry.bounds;
    if (lat < south || lat > north || lon < west || lon > east) return null;
    const col = Math.min(this.width - 1, Math.floor(((lon - west) / (east - west)) * this.width));
    const row = Math.min(this.height - 1, Math.floor(((this.yNorth - mercY(lat)) / (this.yNorth - this.ySouth)) * this.height));
    return decodePixel(this.values[row * this.width + col], this.entry.scale);
  }
}

/** The value under a point across grids, in cascade order (rank, then resolution). */
export function maxCurrentAt(lat: number, lon: number, grids: RasterGrid[]): { kt: number; entry: RasterEntry } | null {
  const byCascade = [...grids].sort(
    (a, b) => (b.entry.rank ?? 0) - (a.entry.rank ?? 0) || a.entry.resolution_m - b.entry.resolution_m,
  );
  for (const g of byCascade) {
    const kt = g.valueAt(lat, lon);
    if (kt != null) return { kt, entry: g.entry };
  }
  return null;
}
