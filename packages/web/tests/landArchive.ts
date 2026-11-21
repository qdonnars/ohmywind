// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * A `TileSource` over an archive on disk, for the tests: the bytes the
 * server would serve from `/api/v1/land-tiles`, read where the Python
 * package keeps them.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { MIXED, TILES } from "../src/plan/repair/lattice";
import type { TileSource } from "../src/plan/repair/tiles";

/** The archive shipped in the Python package: the one the server reads. */
export const BUNDLED_ARCHIVE = fileURLToPath(
  new URL(
    "../../data-adapters/src/openwind_data/routing/auto_route/grids/france.owlt",
    import.meta.url,
  ),
);

export function archiveSource(path: string): TileSource & { fetched: number } {
  const raw = readFileSync(path);
  const headerLength = raw.readUInt32LE(6);
  const statesAt = 10 + headerLength;
  const statesLength = raw.readUInt32LE(statesAt);
  const indexEnd = statesAt + 4 + statesLength;
  const states = inflateSync(raw.subarray(statesAt + 4, indexEnd));
  const rank = new Int32Array(TILES * TILES);
  let count = 0;
  for (let i = 0; i < states.length; i++) {
    rank[i] = count;
    if (states[i] === MIXED) count++;
  }
  const dataAt = indexEnd + 4 * (count + 1);
  const source = {
    fetched: 0,
    index: async () => new Uint8Array(raw.subarray(0, indexEnd)),
    tile: async (_id: string, tx: number, ty: number) => {
      const key = ty * TILES + tx;
      if (states[key] !== MIXED) throw new Error(`tile ${tx}/${ty} is not mixed`);
      source.fetched++;
      const from = raw.readUInt32LE(indexEnd + 4 * rank[key]);
      const to = raw.readUInt32LE(indexEnd + 4 * (rank[key] + 1));
      return new Uint8Array(raw.subarray(dataAt + from, dataAt + to));
    },
  };
  return source;
}
