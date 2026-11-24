// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The land tiles the route repair reads, fetched one by one.
 *
 * The index (header and the state of every tile) comes first, then only
 * the mixed tiles a route touches: a few kilobytes each. Where the bytes
 * come from is a `TileSource`: the server's `/api/v1/land-tiles` in the
 * app, an archive on disk in the tests.
 */

import { LAND, MIXED, TILES, TILE_PX, WORLD_PX } from "./lattice";

export interface TileSource {
  /** The archive's index as stored: magic, header, states. */
  index(): Promise<Uint8Array>;
  /** One mixed tile as stored (zlib). */
  tile(archiveId: string, tx: number, ty: number): Promise<Uint8Array>;
}

const MAGIC = "OWLT1\n";
/** Decoded tiles kept in memory (205 kB each). */
const TILE_CACHE = 48;

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stored = new Response(bytes as Uint8Array<ArrayBuffer>).body;
  if (stored === null) throw new Error("no body to inflate");
  const stream = stored.pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class LandStore {
  readonly id: string;
  /** What this store asked its source for since it was opened: the index
      and each tile once, in bytes as stored (compressed). */
  readonly fetched = { requests: 0, bytes: 0 };
  private readonly states: Uint8Array;
  private readonly coverage: [number, number, number, number];
  private readonly source: TileSource;
  /** Decoded tiles and those on their way, most recently used last. */
  private readonly tiles = new Map<number, Promise<Uint8Array>>();

  private constructor(
    source: TileSource,
    id: string,
    coverage: [number, number, number, number],
    states: Uint8Array,
  ) {
    this.source = source;
    this.id = id;
    this.coverage = coverage;
    this.states = states;
  }

  static async open(source: TileSource): Promise<LandStore> {
    const raw = await source.index();
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const text = new TextDecoder();
    if (text.decode(raw.subarray(0, MAGIC.length)) !== MAGIC) {
      throw new Error("not a land tile index");
    }
    let at = MAGIC.length;
    const headerLength = view.getUint32(at, true);
    at += 4;
    const header = JSON.parse(text.decode(raw.subarray(at, at + headerLength))) as {
      id: string;
      zoom: number;
      tile_px: number;
      coverage: [number, number, number, number];
    };
    at += headerLength;
    if (2 ** header.zoom !== TILES || header.tile_px !== TILE_PX) {
      throw new Error("land tiles cut on another lattice than this code reads");
    }
    const statesLength = view.getUint32(at, true);
    at += 4;
    const states = await inflate(raw.subarray(at, at + statesLength));
    if (states.length !== TILES * TILES) throw new Error("land tile index truncated");
    const store = new LandStore(source, header.id, header.coverage, states);
    store.fetched.requests = 1;
    store.fetched.bytes = raw.byteLength;
    return store;
  }

  covers(row: number, col: number): boolean {
    const [tx0, ty0, tx1, ty1] = this.coverage;
    return (
      tx0 * TILE_PX <= col && col < tx1 * TILE_PX && ty0 * TILE_PX <= row && row < ty1 * TILE_PX
    );
  }

  /** The tile rectangle the archive answers for, in pixels: r0, r1, c0, c1. */
  bounds(): [number, number, number, number] {
    const [tx0, ty0, tx1, ty1] = this.coverage;
    return [ty0 * TILE_PX, ty1 * TILE_PX, tx0 * TILE_PX, tx1 * TILE_PX];
  }

  private packed(tx: number, ty: number): Promise<Uint8Array> {
    const key = ty * TILES + tx;
    let tile = this.tiles.get(key);
    if (tile) {
      this.tiles.delete(key);
    } else {
      tile = this.source.tile(this.id, tx, ty).then((stored) => {
        this.fetched.requests++;
        this.fetched.bytes += stored.byteLength;
        return inflate(stored);
      });
      // A failed fetch is forgotten, so that the next route asks again.
      tile.catch(() => this.tiles.delete(key));
    }
    this.tiles.set(key, tile);
    if (this.tiles.size > TILE_CACHE) {
      this.tiles.delete(this.tiles.keys().next().value as number);
    }
    return tile;
  }

  /**
   * Whether each lattice pixel is land (1) or sea (0). A pixel north or
   * south of the lattice is land; the columns wrap around the antimeridian.
   */
  async landAt(rows: Int32Array, cols: Int32Array): Promise<Uint8Array> {
    const n = rows.length;
    const out = new Uint8Array(n).fill(1);
    const wanted = new Map<number, Promise<Uint8Array>>();
    const tileOf = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      if (r < 0 || r >= WORLD_PX) continue;
      const c = ((cols[i] % WORLD_PX) + WORLD_PX) % WORLD_PX;
      const ty = Math.floor(r / TILE_PX);
      const tx = Math.floor(c / TILE_PX);
      const key = ty * TILES + tx;
      const state = this.states[key];
      if (state !== MIXED) {
        out[i] = state === LAND ? 1 : 0;
        continue;
      }
      tileOf[i] = key;
      if (!wanted.has(key)) wanted.set(key, this.packed(tx, ty));
    }
    const loaded = new Map<number, Uint8Array>();
    await Promise.all(
      [...wanted].map(async ([key, tile]) => {
        loaded.set(key, await tile);
      }),
    );
    const stride = TILE_PX >> 3;
    for (let i = 0; i < n; i++) {
      const key = tileOf[i];
      if (key < 0) continue;
      const packed = loaded.get(key) as Uint8Array;
      const c = ((cols[i] % WORLD_PX) + WORLD_PX) % WORLD_PX;
      const r = rows[i] - Math.floor(key / TILES) * TILE_PX;
      const lc = c - (key % TILES) * TILE_PX;
      out[i] = (packed[r * stride + (lc >> 3)] >> (7 - (lc & 7))) & 1;
    }
    return out;
  }

  /** The land mask of rows r0..r1 and columns c0..c1 (upper bounds excluded),
      row-major, 1 for land. */
  async window(r0: number, r1: number, c0: number, c1: number): Promise<Uint8Array> {
    const width = c1 - c0;
    const out = new Uint8Array((r1 - r0) * width).fill(1);
    const stride = TILE_PX >> 3;
    const jobs: Promise<void>[] = [];
    const tyFirst = Math.floor(Math.max(0, r0) / TILE_PX);
    const tyLast = Math.floor((Math.min(WORLD_PX, r1) - 1) / TILE_PX);
    for (let ty = tyFirst; ty <= tyLast; ty++) {
      const ra = Math.max(r0, ty * TILE_PX);
      const rb = Math.min(r1, (ty + 1) * TILE_PX);
      for (let txu = Math.floor(c0 / TILE_PX); txu <= Math.floor((c1 - 1) / TILE_PX); txu++) {
        const ca = Math.max(c0, txu * TILE_PX);
        const cb = Math.min(c1, (txu + 1) * TILE_PX);
        const tx = ((txu % TILES) + TILES) % TILES;
        const state = this.states[ty * TILES + tx];
        if (state !== MIXED) {
          if (state !== LAND) {
            for (let r = ra; r < rb; r++) out.fill(0, (r - r0) * width + ca - c0, (r - r0) * width + cb - c0);
          }
          continue;
        }
        jobs.push(
          this.packed(tx, ty).then((packed) => {
            for (let r = ra; r < rb; r++) {
              const src = (r - ty * TILE_PX) * stride;
              const dst = (r - r0) * width - c0;
              for (let c = ca; c < cb; c++) {
                const lc = c - txu * TILE_PX;
                out[dst + c] = (packed[src + (lc >> 3)] >> (7 - (lc & 7))) & 1;
              }
            }
          }),
        );
      }
    }
    await Promise.all(jobs);
    return out;
  }
}
