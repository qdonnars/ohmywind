// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useSyncExternalStore } from "react";
import { loadKeepAwakeEnabled, saveKeepAwakeEnabled, subscribeKeepAwake } from "./keepAwakePreference";

// Bound to the real storage: the snapshot and the subscription read the
// same store, without the injectable `storage` argument of the tests.
const read = () => loadKeepAwakeEnabled();

/**
 * Whether the screen stays on while a computed plan is shown, as a
 * subscription: the switch of the settings and the planner under them read
 * the same value and follow each other at once.
 */
export function useKeepAwakePreference(): { enabled: boolean; setEnabled: (next: boolean) => void } {
  const enabled = useSyncExternalStore(subscribeKeepAwake, read, read);
  const setEnabled = useCallback((next: boolean) => saveKeepAwakeEnabled(next), []);
  return { enabled, setEnabled };
}
