// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useReducer, useSyncExternalStore } from "react";
import {
  openMeteoQuota,
  subscribeOpenMeteoQuota,
  type QuotaExhaustion,
} from "../api/openMeteoQuota";

/** How often a screen showing the wait re-reads the clock. */
const TICK_MS = 30_000;

/**
 * The Open-Meteo quota exhaustion in force, or null, kept in sync with the
 * fetchers that record it and with the clock that clears it.
 *
 * `useSyncExternalStore` for the store half, so a refusal recorded during a
 * fetch reaches the empty state of the table in the same commit. The clock
 * half is a re-render every half minute while an exhaustion is showing: the
 * sentence carries a countdown, and the exhaustion must vanish on its own
 * once the counter has cleared, without waiting for a refusal that no longer
 * comes. `openMeteoQuota()` re-reads the clock on every call, which is why a
 * bare re-render is enough to notice the reset.
 */
export function useOpenMeteoQuota(): QuotaExhaustion | null {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const quota = useSyncExternalStore(subscribeOpenMeteoQuota, openMeteoQuota, () => null);
  useEffect(() => {
    if (quota === null) return;
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [quota]);
  return quota;
}
