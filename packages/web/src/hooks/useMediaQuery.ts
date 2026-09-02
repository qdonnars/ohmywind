// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useSyncExternalStore } from "react";

/**
 * The `lg` breakpoint, as a media query.
 *
 * Tailwind's `lg:` variant compiles to `@media (width >= 64rem)`, and this is
 * the string that has to mean exactly the same thing: the planner mounts one
 * panel or the other from it, so a layout the CSS hides and a panel React
 * mounts must never disagree. Declared here, imported by whoever needs it, so
 * there is a single value to change.
 */
export const LG_MEDIA_QUERY = "(min-width: 64rem)";

/** The slice of `MediaQueryList` the store needs, so tests can pass a fake. */
export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

/**
 * Pure: turns a media query list into the `subscribe`/`getSnapshot` pair
 * `useSyncExternalStore` wants. A `null` list (no `matchMedia`, or no window
 * at all) reads as "does not match" and subscribes to nothing.
 */
export function mediaQueryStore(mql: MediaQueryListLike | null): {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
} {
  return {
    subscribe(onChange) {
      if (!mql) return () => {};
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    getSnapshot: () => mql?.matches ?? false,
  };
}

/**
 * Whether a CSS media query currently matches, kept in sync with resizes.
 *
 * `useSyncExternalStore` rather than state plus an effect: the value is read
 * during render from the browser itself, so there is no frame where React
 * believes one layout and the CSS shows another.
 */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(
    () =>
      mediaQueryStore(
        typeof window !== "undefined" && typeof window.matchMedia === "function"
          ? window.matchMedia(query)
          : null,
      ),
    [query],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
