// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// The forecast caches are plain Maps read with a TTL check. Read-side expiry
// alone never frees anything: an entry nobody asks for again stays for the
// life of the tab, and a wind entry is 60 to 110 KiB (four models, 7 to 12
// days hourly). A session that taps spots or reshapes a route kept tens of
// megabytes it could never serve again, on phones where a heavy background
// tab is the first one the system kills.
//
// Every write goes through here instead: it drops what has expired, then the
// oldest entries beyond a cap.

/**
 * Store `entry` under `key`, then drop expired entries and the oldest ones
 * beyond `max`.
 *
 * Relies on every write to `cache` going through this function: the Map then
 * iterates in write order, oldest first, so both sweeps stop at the first
 * entry worth keeping.
 */
export function storeBounded<V extends { fetchedAt: number }>(
  cache: Map<string, V>,
  key: string,
  entry: V,
  ttlMs: number,
  max: number,
): void {
  // Delete first so a refresh moves the key back to the tail of the queue.
  cache.delete(key);
  cache.set(key, entry);
  for (const [k, v] of cache) {
    const expired = entry.fetchedAt - v.fetchedAt >= ttlMs;
    if (!expired && cache.size <= max) break;
    cache.delete(k);
  }
}
