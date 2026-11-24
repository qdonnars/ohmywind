// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";

/**
 * Whether the marine-chart overlay (OpenSeaMap) is on: one choice, Always or
 * Never, for both maps, the explorer and the planner.
 *
 * It replaces a flag per map (explorer off, planner on by default), which the
 * reader could only set from each map's own button. The overlay button of
 * either map and the settings flip this same value, and every mounted reader
 * follows at once (`subscribeSeamarks`).
 */

/** The choice of a reader who never made one. The single place to change it. */
export const SEAMARKS_DEFAULT = true;

const KEY = LOCAL_STORAGE_KEYS.seamarks;

/**
 * What a reader who never touched the new choice gets, from the two flags of
 * the earlier releases. Each was written only when its map's button was
 * pressed, so a stored value is an explicit choice and its absence is not.
 *
 * The planner's choice decides first: it is the map where the marks serve
 * navigation, so turning them off there (against its default) is the plainest
 * "I do not want them", and turning them back on there the plainest wish to
 * keep them. Without one, the explorer's choice decides; without either, the
 * default. A conflict between the two flags (on for one map, off for the
 * other) therefore follows the planner.
 *
 * Read only, never written nor removed: going back to an earlier build finds
 * the old flags intact.
 */
function legacyChoice(storage: Pick<Storage, "getItem">): boolean | null {
  for (const key of [LOCAL_STORAGE_KEYS.seamarksPlan, LOCAL_STORAGE_KEYS.seamarksExplore]) {
    const stored = storage.getItem(key);
    if (stored === "1") return true;
    if (stored === "0") return false;
  }
  return null;
}

function readStored(): boolean {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return legacyChoice(localStorage) ?? SEAMARKS_DEFAULT;
  } catch {
    // Private browsing or storage disabled: the overlay is a preference,
    // not a requirement.
    return SEAMARKS_DEFAULT;
  }
}

/** The value for this page's lifetime, once read or set. Set even when the
    write fails, so the button still works in a session without storage. */
let current: boolean | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function loadSeamarksEnabled(): boolean {
  if (current === null) current = readStored();
  return current;
}

export function saveSeamarksEnabled(enabled: boolean): void {
  current = enabled;
  try {
    // An explicit "0" rather than clearing the key: a reader who turned the
    // marks off must not be handed them back by the default.
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable: the choice still holds for this session */
  }
  notify();
}

function onStorage(e: StorageEvent): void {
  // Another tab changed the choice, or cleared the storage: read it again.
  if (e.key !== null && e.key !== KEY) return;
  current = null;
  notify();
}

/** `subscribe` for `useSyncExternalStore`: hears this page's own writes and
    those of the app's other tabs. Returns the unsubscribe. */
export function subscribeSeamarks(listener: () => void): () => void {
  const win = typeof window !== "undefined" ? window : null;
  if (listeners.size === 0) win?.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) win?.removeEventListener("storage", onStorage);
  };
}
