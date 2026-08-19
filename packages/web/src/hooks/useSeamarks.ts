// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useState } from "react";
import { loadSeamarksEnabled, saveSeamarksEnabled } from "../config/seamarkPreference";

/**
 * The marine-chart overlay toggle, shared by the explore map and the
 * planner map. Reads the stored preference once at mount and writes it back
 * on every flip, so the two pages (separate documents) agree.
 */
export function useSeamarks() {
  const [enabled, setEnabled] = useState<boolean>(loadSeamarksEnabled);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      saveSeamarksEnabled(next);
      return next;
    });
  }, []);

  return { enabled, toggle };
}
