// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The boat configuration, as a subscription rather than a re-read.
 *
 * `/plan` and `/config` are coupled through `ow_polar_config_v1`: the planner
 * writes it when the user picks a boat, the editor writes it when they tune a
 * polar. With no notification channel, the sidebar coped by calling
 * `loadPolarConfig()` (a `JSON.parse` plus a round of sanitizers) twice per
 * render, on every tick of the departure slider, and a change made in another
 * tab still needed a reload to show up (annexe B, M2).
 *
 * One reader instead: `useSyncExternalStore` over both channels, the module
 * registry of `polarConfig.ts` for this tab and the `storage` event for the
 * others. The snapshot is memoised on the raw string, so React sees a stable
 * reference for as long as nothing wrote.
 */

import { useSyncExternalStore } from "react";
import {
  loadPolarConfig,
  subscribePolarConfig,
  POLAR_CONFIG_KEY,
  type PolarConfig,
} from "./polarConfig";

let snapshot: PolarConfig | null = null;
let snapshotRaw: string | null = null;
/** Distinguishes "nothing stored" from "not read yet": both read as null. */
let hasSnapshot = false;

function readSnapshot(): PolarConfig {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(POLAR_CONFIG_KEY);
  } catch {
    raw = null;
  }
  if (hasSnapshot && raw === snapshotRaw && snapshot !== null) return snapshot;
  snapshotRaw = raw;
  snapshot = loadPolarConfig();
  hasSnapshot = true;
  return snapshot;
}

function subscribe(onStoreChange: () => void): () => void {
  const unsubscribe = subscribePolarConfig(onStoreChange);
  const onStorage = (event: StorageEvent) => {
    // A null key means the whole store was cleared.
    if (event.key === null || event.key === POLAR_CONFIG_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    unsubscribe();
    window.removeEventListener("storage", onStorage);
  };
}

export function usePolarConfig(): PolarConfig {
  return useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
}

/** Test seam: drop the memoised snapshot so a test can rewrite storage
    underneath without going through `savePolarConfig`. */
export function resetPolarConfigSnapshot(): void {
  snapshot = null;
  snapshotRaw = null;
  hasSnapshot = false;
}
