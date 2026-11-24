// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The few IndexedDB calls the offline cache needs, on the native API.
 *
 * Why IndexedDB and not `localStorage`: a spot's forecast is 60 to 150 KiB of
 * JSON, and `localStorage` gives the whole origin about 5 MB, shared with the
 * boat, the saved spots and the last plan (`plan/lastSimulation.ts` caps
 * itself at 500 kB for that reason). IndexedDB has the origin's real quota,
 * and its writes do not block the page.
 *
 * Why no library: four operations on one object store do not justify a
 * dependency. Every call resolves or rejects, never throws synchronously,
 * and the callers treat a rejection as "no cache" (private browsing in old
 * Firefox, storage disabled, quota refused).
 */

const DB_NAME = "ohmywind";
const DB_VERSION = 1;
/** Forecasts of the spots looked at, keyed by `key` (see forecastStore.ts). */
export const FORECAST_STORE = "forecasts";

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FORECAST_STORE)) {
        db.createObjectStore(FORECAST_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the schema: let it, and reopen on next use.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
  // A failed open is retried on the next call rather than cached forever.
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function idbGet(store: string, key: string): Promise<unknown> {
  const db = await openDb();
  return result(db.transaction(store, "readonly").objectStore(store).get(key));
}

export async function idbGetAll(store: string): Promise<unknown[]> {
  const db = await openDb();
  return result(db.transaction(store, "readonly").objectStore(store).getAll());
}

/** Writes `values` and deletes `deleteKeys` in one transaction. */
export async function idbWrite(store: string, values: unknown[], deleteKeys: string[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  for (const k of deleteKeys) os.delete(k);
  return done(tx);
}
