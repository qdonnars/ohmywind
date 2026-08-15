// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState, useEffect } from "react";

export type TimezoneMode = "local" | "utc" | "boat";

const STORAGE_KEY = "ow_tz";
const MODES: TimezoneMode[] = ["local", "utc", "boat"];

function readStored(): TimezoneMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "local" || v === "utc" || v === "boat") return v;
  } catch {
    // localStorage not available
  }
  return "local";
}

export function useTimezone(): [TimezoneMode, () => void] {
  const [mode, setMode] = useState<TimezoneMode>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage not available
    }
  }, [mode]);

  function cycle() {
    setMode((prev) => {
      const idx = MODES.indexOf(prev);
      return MODES[(idx + 1) % MODES.length];
    });
  }

  return [mode, cycle];
}
