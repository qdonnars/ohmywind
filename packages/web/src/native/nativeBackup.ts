// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS, type LocalStorageKeyName } from "../storage/keys";
import { decodePayload, encodePayload, type TransferItems } from "../storage/transfer";

/**
 * A copy of the reader's data in the app's native storage, put back if the
 * WebView's storage is wiped.
 *
 * iOS may purge a site's script-writable storage (WebKit's tracking
 * prevention, low disk space); on Android, clearing the WebView's data does
 * the same. Spots, boat, settings and the last plan would go with it. So:
 *
 * - `localStorage` stays the source of truth. The shell keeps a copy in
 *   the native preferences (UserDefaults, SharedPreferences, through the
 *   Preferences plugin), written a moment after each change and when the app
 *   goes to the background.
 * - A marker in `localStorage` says "this storage has been seen by the
 *   backup". At start, no marker means the storage is new or was wiped: the
 *   marker is written first (so this can never loop), then each entry of the
 *   copy that `localStorage` lacks is written back, never one it already
 *   holds, and the page reloads once so every module reads the restored
 *   values. With the marker present nothing is restored, so data the reader
 *   deleted on purpose never comes back.
 * - It runs before the import from the former Android app
 *   (`shellImport.ts`): a restored storage carries that import's state, so
 *   Chrome is not opened a second time.
 *
 * The copy uses the payload format of `storage/transfer.ts` (base64url of
 * `{ "items": ... }`), one format for every place the data travels.
 *
 * No Capacitor here: the plugin comes in through `BackupDeps`.
 */

/** Name of the copy in the native preferences. */
export const BACKUP_PREFERENCE_KEY = "ow_backup_v1";

/** Debounce of the copy after a change, in ms. */
export const BACKUP_DELAY_MS = 2000;

const MARKER_KEY = LOCAL_STORAGE_KEYS.nativeBackup;

/**
 * Which entries the copy holds. Typed over the registry like the transfer
 * policy: a new key does not compile until it is decided here.
 */
export const BACKUP_POLICY: Readonly<Record<LocalStorageKeyName, boolean>> = {
  // What the reader made, and their settings.
  customSpots: true,
  polarConfig: true,
  modelConfig: true,
  lang: true,
  theme: true,
  timezone: true,
  compare: true,
  seamarksExplore: true,
  seamarksPlan: true,
  lastSpot: true,
  keepAwake: true,
  onboarding: true,
  compareHint: true,
  whatsNewSeen: true,
  drawerHeight: true,
  sidebarWidth: true,
  // The last plan: no URL to fit in here, unlike the transfer.
  lastSimulation: true,
  // The view the app was closed on, restored with the plan it points at.
  lastView: true,
  // Given to this app, so still true after a purge.
  geolocDeclined: true,
  // Restored with the rest, the import from the former app stays done.
  shellImport: true,
  // Caches, refetched on demand.
  marcCoverage: false,
  waypointDepths: false,
  // Counted from the launch of this storage on purpose, see reviewPrompt.ts:
  // a purge can only make the rating request later, never earlier.
  reviewPrompt: false,
  // An answer given on the site to the invitation to install the app: the
  // app never shows that invitation.
  installInvite: false,
  // The marker must disappear with a wipe: it is how a wipe is detected.
  nativeBackup: false,
};

export const BACKUP_KEYS: readonly string[] = (Object.entries(BACKUP_POLICY) as [LocalStorageKeyName, boolean][])
  .filter(([, kept]) => kept)
  .map(([name]) => LOCAL_STORAGE_KEYS[name]);

const BACKED_UP = new Set(BACKUP_KEYS);

function isBackedUp(key: string | null): boolean {
  return key === null || BACKED_UP.has(key);
}

/** The backed-up entries present in `storage`, encoded. */
export function snapshot(storage: Pick<Storage, "getItem">): string {
  const items: TransferItems = {};
  for (const key of BACKUP_KEYS) {
    let value: string | null = null;
    try {
      value = storage.getItem(key);
    } catch {
      value = null;
    }
    if (value !== null) items[key] = value;
  }
  return encodePayload(items);
}

/** The entries of a stored copy that may be written back, or null. */
export function parseBackup(raw: string | null): TransferItems | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = decodePayload(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const items = (parsed as { items?: unknown }).items;
  if (typeof items !== "object" || items === null || Array.isArray(items)) return null;
  const out: TransferItems = {};
  for (const [key, value] of Object.entries(items)) {
    if (BACKED_UP.has(key) && typeof value === "string") out[key] = value;
  }
  return out;
}

export interface BackupDeps {
  storage: Pick<Storage, "getItem" | "setItem">;
  readCopy(): Promise<string | null>;
  writeCopy(value: string): Promise<void>;
  reload(): void;
}

export type RestoreOutcome = "kept" | "restored" | "nothing" | "unavailable";

/**
 * At start, before anything else of the shell. "restored" means the page is
 * reloading: the caller stops there. "unavailable" means the copy could not
 * be read: the caller must not write a new one over it this session.
 */
export async function restoreIfWiped(deps: BackupDeps): Promise<RestoreOutcome> {
  try {
    if (deps.storage.getItem(MARKER_KEY) !== null) return "kept";
    deps.storage.setItem(MARKER_KEY, "1");
    // A marker that did not stick would restore and reload at every start.
    if (deps.storage.getItem(MARKER_KEY) !== "1") return "nothing";
  } catch {
    return "nothing";
  }
  let raw: string | null;
  try {
    raw = await deps.readCopy();
  } catch {
    return "unavailable";
  }
  const items = parseBackup(raw);
  if (!items) return "nothing";
  let written = 0;
  for (const [key, value] of Object.entries(items)) {
    try {
      if (deps.storage.getItem(key) !== null) continue;
      deps.storage.setItem(key, value);
      written += 1;
    } catch {
      /* quota: keep what fitted */
    }
  }
  if (written === 0) return "nothing";
  deps.reload();
  return "restored";
}

export interface BackupWriter {
  /** A key of `localStorage` changed (null: all of them, a clear()). */
  changed(key: string | null): void;
  /** Write now if anything differs from the last copy. */
  flush(): Promise<void>;
  /** Changes before this are noted but not written: the copy must not be
      overwritten before the restore had its look at it. */
  start(): void;
}

export function createBackupWriter(
  deps: Pick<BackupDeps, "storage" | "writeCopy">,
  timers: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  },
): BackupWriter {
  let started = false;
  let last: string | null = null;
  let pending: unknown = null;
  let writing: Promise<void> = Promise.resolve();

  const flush = (): Promise<void> => {
    if (pending !== null) {
      timers.clear(pending);
      pending = null;
    }
    if (!started) return writing;
    writing = writing.then(async () => {
      const copy = snapshot(deps.storage);
      if (copy === last) return;
      try {
        await deps.writeCopy(copy);
        last = copy;
      } catch {
        /* the next change or the next background tries again */
      }
    });
    return writing;
  };

  return {
    changed(key) {
      if (!isBackedUp(key) || !started) return;
      if (pending !== null) timers.clear(pending);
      pending = timers.set(() => {
        pending = null;
        void flush();
      }, BACKUP_DELAY_MS);
    },
    flush,
    start() {
      started = true;
    },
  };
}

/**
 * Calls `onWrite` after every successful write to `storage` through the
 * Storage methods. No other way exists to hear about changes made by the
 * page itself (the `storage` event only fires in other tabs), and the app
 * writes from a dozen modules. Shell only; the PWA never runs this.
 */
export function watchStorageWrites(storage: Storage, onWrite: (key: string | null) => void): void {
  const proto = Object.getPrototypeOf(storage) as Storage;
  const { setItem, removeItem, clear } = proto;
  const notify = (self: unknown, key: string | null) => {
    if (self !== storage) return;
    try {
      onWrite(key);
    } catch {
      /* the write itself succeeded: never let the backup break it */
    }
  };
  proto.setItem = function (this: Storage, key: string, value: string) {
    setItem.call(this, key, value);
    notify(this, String(key));
  };
  proto.removeItem = function (this: Storage, key: string) {
    removeItem.call(this, key);
    notify(this, String(key));
  };
  proto.clear = function (this: Storage) {
    clear.call(this);
    notify(this, null);
  };
}
