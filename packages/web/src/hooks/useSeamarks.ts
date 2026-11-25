// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useSyncExternalStore } from "react";
import {
  loadSeamarksEnabled,
  saveSeamarksEnabled,
  subscribeSeamarks,
} from "../config/seamarkPreference";

/**
 * The marine-chart overlay choice, shared by both maps and the settings.
 * Every component using it re-renders when any of them changes it, so a
 * map behind the settings follows a new choice at once.
 *
 * - `enabled`: Always (true) or Never (false).
 * - `setEnabled`: sets and stores a choice, for the Always / Never control.
 */
export function useSeamarks() {
  const enabled = useSyncExternalStore(subscribeSeamarks, loadSeamarksEnabled, loadSeamarksEnabled);
  const setEnabled = useCallback((next: boolean) => saveSeamarksEnabled(next), []);
  return { enabled, setEnabled };
}
