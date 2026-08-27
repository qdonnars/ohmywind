// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// The context and its hook live apart from theme.tsx so that file exports
// components and nothing else: Fast Refresh gives up on a module that mixes
// the two, and a theme change would then reload the whole app instead of
// swapping the component.

import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark';

export const ThemeCtx = createContext<{
  mode: ThemeMode;
  resolvedTheme: ThemeMode;
  setMode: (m: ThemeMode) => void;
}>({ mode: 'dark', resolvedTheme: 'dark', setMode: () => {} });

export function useTheme() {
  return useContext(ThemeCtx);
}
