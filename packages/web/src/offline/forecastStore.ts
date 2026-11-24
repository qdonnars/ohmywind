// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { MarineHourly, ModelForecast, Spot } from "../types";
import { FORECAST_STORE, idbGet, idbGetAll, idbWrite } from "./idb";

/**
 * The last forecast of each spot worth reopening offline (issue #537).
 *
 * The explorer used to remember the spot (`config/lastSpot.ts`) but not what
 * was shown for it: reopened in airplane mode, it centred the map on the spot
 * and left the tables empty. Each successful wind and sea fetch is now kept on
 * the device, for the last spot looked at and for the saved spots, and read
 * back when the network cannot answer. The screens show it with its date
 * (`offline/freshness.ts`).
 *
 * What stays, decided at every write (`entriesToPurge`):
 *
 * - the last spot looked at, always, saved or not;
 * - the saved spots, the `MAX_SAVED_SPOTS` most recently fetched;
 * - nothing older than `MAX_AGE_MS`: past that every hour of the forecast is
 *   behind us and there is nothing left to show.
 *
 * Eleven entries of 60 to 150 KiB at most: about 1.5 MB in IndexedDB, nothing
 * in the `localStorage` budget.
 */

/** Payload version, bumped rather than reinterpreted (see storage/keys.ts). */
export const FORECAST_CACHE_VERSION = 1;
/** Saved spots kept besides the last one. */
export const MAX_SAVED_SPOTS = 10;
/** The fetch covers seven days from midnight: beyond that, nothing is left. */
export const MAX_AGE_MS = 7 * 24 * 3_600_000;

export interface CachedForecast {
  v: number;
  /** `spotKey` of the spot. */
  key: string;
  spot: Spot;
  models: ModelForecast[];
  marine: MarineHourly | null;
  /** Epoch ms of the fetch: the date the screens show. */
  fetchedAt: number;
  /** Set on the last spot looked at, which is never purged for being unsaved. */
  last?: boolean;
}

/** 4 decimals, ~11 m: the key `api/openmeteo.ts` and `api/marine.ts` use. */
export function spotKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

// ── validation ───────────────────────────────────────────────────────────────
//
// What comes back from the device was written by some earlier build. A light
// structural check, as in plan/lastSimulation.ts: a payload that does not
// hold together is no cache at all rather than a table that throws.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

function isSpot(v: unknown): v is Spot {
  return (
    isRecord(v) &&
    typeof v.name === "string" &&
    typeof v.latitude === "number" &&
    typeof v.longitude === "number"
  );
}

function isModelForecast(v: unknown): v is ModelForecast {
  if (!isRecord(v) || typeof v.modelName !== "string" || !isRecord(v.hourly)) return false;
  const h = v.hourly;
  return (
    isStringArray(h.time) &&
    Array.isArray(h.wind_speed_10m) &&
    Array.isArray(h.wind_direction_10m) &&
    Array.isArray(h.wind_gusts_10m) &&
    Array.isArray(h.weather_code)
  );
}

function isMarine(v: unknown): v is MarineHourly {
  return isRecord(v) && isStringArray(v.time) && Array.isArray(v.wave_height_m);
}

/** A stored entry, or null when it is not one this build can read. */
export function parseCachedForecast(raw: unknown): CachedForecast | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== FORECAST_CACHE_VERSION) return null;
  if (typeof raw.key !== "string" || !isSpot(raw.spot)) return null;
  if (typeof raw.fetchedAt !== "number" || !Number.isFinite(raw.fetchedAt)) return null;
  if (!Array.isArray(raw.models) || !raw.models.every(isModelForecast)) return null;
  if (raw.marine !== null && !isMarine(raw.marine)) return null;
  return {
    v: FORECAST_CACHE_VERSION,
    key: raw.key,
    spot: raw.spot,
    models: raw.models,
    marine: raw.marine,
    fetchedAt: raw.fetchedAt,
    last: raw.last === true,
  };
}

// ── purge ────────────────────────────────────────────────────────────────────

/** What the purge needs to know of an entry. */
export interface EntryHead {
  key: string;
  fetchedAt: number;
  last?: boolean;
}

/**
 * Keys to delete, given what is stored and the saved spots of the moment.
 *
 * Pure, so the policy is tested without a database. An entry that does not
 * parse is passed with `fetchedAt: -Infinity` and goes with the expired ones.
 */
export function entriesToPurge(
  entries: readonly EntryHead[],
  savedKeys: ReadonlySet<string>,
  now: number,
): string[] {
  const drop: string[] = [];
  const saved: EntryHead[] = [];
  for (const e of entries) {
    if (!(now - e.fetchedAt < MAX_AGE_MS)) drop.push(e.key);
    else if (e.last) continue;
    else if (savedKeys.has(e.key)) saved.push(e);
    else drop.push(e.key);
  }
  saved.sort((a, b) => b.fetchedAt - a.fetchedAt);
  for (const e of saved.slice(MAX_SAVED_SPOTS)) drop.push(e.key);
  return drop;
}

// ── store ────────────────────────────────────────────────────────────────────

/** The storage underneath, so the store runs on a Map in the tests. */
export interface ForecastBackend {
  get(key: string): Promise<unknown>;
  getAll(): Promise<unknown[]>;
  /** One atomic write: `put` then `remove`. */
  write(put: unknown[], remove: string[]): Promise<void>;
}

export interface ForecastStore {
  /**
   * Keep `entry` as the last spot looked at, then purge. `savedKeys` are the
   * `spotKey`s of the saved spots right now. Never rejects: a cache that
   * cannot be written only costs the offline case.
   */
  save(entry: Omit<CachedForecast, "v" | "key" | "last">, savedKeys: ReadonlySet<string>, now?: number): Promise<void>;
  /** The entry of a spot, or null (absent, unreadable, too old, no storage). */
  load(lat: number, lon: number, now?: number): Promise<CachedForecast | null>;
}

export function createForecastStore(backend: ForecastBackend): ForecastStore {
  return {
    async save(entry, savedKeys, now = Date.now()) {
      try {
        const key = spotKey(entry.spot.latitude, entry.spot.longitude);
        const fresh: CachedForecast = { ...entry, v: FORECAST_CACHE_VERSION, key, last: true };
        const stored = await backend.getAll();
        const heads: EntryHead[] = [];
        const demote: CachedForecast[] = [];
        for (const raw of stored) {
          const parsed = parseCachedForecast(raw);
          if (!parsed) {
            const k = isRecord(raw) && typeof raw.key === "string" ? raw.key : null;
            if (k !== null && k !== key) heads.push({ key: k, fetchedAt: -Infinity });
            continue;
          }
          if (parsed.key === key) continue;
          // The previous last spot is now an ordinary entry: kept only if saved.
          if (parsed.last) demote.push({ ...parsed, last: false });
          heads.push({ key: parsed.key, fetchedAt: parsed.fetchedAt, last: false });
        }
        const drop = new Set(entriesToPurge(heads, savedKeys, now));
        const put = [fresh, ...demote.filter((e) => !drop.has(e.key))];
        await backend.write(put, [...drop]);
      } catch {
        // No storage (private mode, quota): the app works, offline is poorer.
      }
    },
    async load(lat, lon, now = Date.now()) {
      try {
        const entry = parseCachedForecast(await backend.get(spotKey(lat, lon)));
        if (!entry || !(now - entry.fetchedAt < MAX_AGE_MS)) return null;
        return entry;
      } catch {
        return null;
      }
    },
  };
}

const idbBackend: ForecastBackend = {
  get: (key) => idbGet(FORECAST_STORE, key),
  getAll: () => idbGetAll(FORECAST_STORE),
  write: (put, remove) => idbWrite(FORECAST_STORE, put, remove),
};

/** The app's store, on IndexedDB. */
export const forecastStore = createForecastStore(idbBackend);
