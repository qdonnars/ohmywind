// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";

/**
 * Whether the screen stays on while a computed plan is shown (see
 * `native/keepAwake.ts`). On unless the reader turns it off in the settings:
 * at the chart table the screen going dark is the surprise, not the light.
 */

const KEY = LOCAL_STORAGE_KEYS.keepAwake;
const DEFAULT = true;

export function loadKeepAwakeEnabled(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    const stored = storage.getItem(KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function saveKeepAwakeEnabled(enabled: boolean, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable: the choice holds for this visit only */
  }
}
