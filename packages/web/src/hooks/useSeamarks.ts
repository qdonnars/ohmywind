// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useState } from "react";
import {
  loadSeamarksEnabled,
  saveSeamarksEnabled,
  type MapSurface,
} from "../config/seamarkPreference";

/**
 * The marine-chart overlay toggle for one map. Reads that map's stored
 * preference once at mount and writes it back on every flip. The two maps
 * are separate documents and separate preferences, so each opens the way
 * its own job needs.
 */
export function useSeamarks(surface: MapSurface) {
  const [enabled, setEnabled] = useState<boolean>(() => loadSeamarksEnabled(surface));

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      saveSeamarksEnabled(surface, next);
      return next;
    });
  }, [surface]);

  return { enabled, toggle };
}
