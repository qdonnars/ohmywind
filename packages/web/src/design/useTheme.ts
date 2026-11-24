// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// The context and its hook live apart from theme.tsx so that file exports
// components and nothing else: Fast Refresh gives up on a module that mixes
// the two, and a theme change would then reload the whole app instead of
// swapping the component.

import { createContext, useContext } from 'react';

/** The palette on screen: what `data-theme` carries and the maps paint with. */
export type ThemeMode = 'light' | 'dark';

/**
 * What the reader picked. `auto` follows the device's light or dark setting,
 * live, and is stored as the absence of `ow_theme`; `light` and `dark` are
 * stored as such.
 */
export type ThemePreference = 'auto' | ThemeMode;

export const ThemeCtx = createContext<{
  /** The reader's choice, for a control offering Auto / Light / Dark. */
  preference: ThemePreference;
  /** The palette that choice resolves to right now. */
  resolvedTheme: ThemeMode;
  /** Applies a choice at once and stores it. */
  setPreference: (p: ThemePreference) => void;
}>({ preference: 'auto', resolvedTheme: 'dark', setPreference: () => {} });

export function useTheme() {
  return useContext(ThemeCtx);
}
