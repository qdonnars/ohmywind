// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The route repair, off the main thread: a retrace is a few hundred
 * milliseconds of search, a second or two on a phone, and the map must
 * keep answering the finger meanwhile.
 *
 * One request at a time, in the order they arrive. The land store (index
 * and decoded tiles) lives as long as the worker.
 */

import type { LatLon } from "./engine";
import { repairRoute, type RepairOutcome } from "./repair";
import { serverTiles } from "./source";
import { LandStore } from "./tiles";

export interface RepairRequest {
  id: number;
  points: LatLon[];
}

/** What one repair cost: its time here, and what it had to fetch (the
    index on the first route, then the tiles not yet held), in bytes as
    stored on the server. */
export interface RepairCost {
  ms: number;
  requests: number;
  bytes: number;
}

export type RepairReply =
  | { id: number; ok: true; outcome: RepairOutcome; cost: RepairCost }
  | { id: number; ok: false; error: string };

let store: Promise<LandStore> | null = null;
let queue: Promise<void> = Promise.resolve();

async function answer(request: RepairRequest): Promise<RepairReply> {
  const started = performance.now();
  try {
    const opening = store === null;
    store ??= LandStore.open(serverTiles);
    const land = await store;
    const before = opening ? { requests: 0, bytes: 0 } : { ...land.fetched };
    const outcome = await repairRoute(land, request.points);
    const cost = {
      ms: performance.now() - started,
      requests: land.fetched.requests - before.requests,
      bytes: land.fetched.bytes - before.bytes,
    };
    return { id: request.id, ok: true, outcome, cost };
  } catch (error) {
    // An index that did not come is asked for again by the next route.
    store = null;
    return { id: request.id, ok: false, error: String(error) };
  }
}

self.onmessage = (event: MessageEvent<RepairRequest>) => {
  queue = queue.then(async () => {
    self.postMessage(await answer(event.data));
  });
};
