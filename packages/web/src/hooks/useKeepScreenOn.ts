// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef } from "react";
import { browserKeepAwakeEnv, createScreenKeeper, type ScreenKeeper } from "../native/keepAwake";

/**
 * Keeps the screen on while `active` is true and the page is visible; lets
 * it go when `active` turns false or the component unmounts (leaving the
 * page). See `native/keepAwake.ts` for the how.
 */
export function useKeepScreenOn(active: boolean): void {
  const keeper = useRef<ScreenKeeper | null>(null);

  useEffect(() => {
    const k = createScreenKeeper(browserKeepAwakeEnv());
    keeper.current = k;
    return () => {
      k.dispose();
      keeper.current = null;
    };
  }, []);

  useEffect(() => {
    keeper.current?.setWanted(active);
  }, [active]);
}
