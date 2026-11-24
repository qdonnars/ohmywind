// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef, useState } from 'react';

import {
  applyTheme,
  readSystemTheme,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  subscribeSystemTheme,
} from './initialTheme';
import { ThemeCtx, type ThemePreference } from './useTheme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const [system, setSystem] = useState(readSystemTheme);
  const resolvedTheme = resolveTheme(preference, system);

  // Read by the system listener, which is subscribed once and must not
  // resubscribe on every choice.
  const preferenceRef = useRef(preference);

  // Keeps the attribute in step with the state. The other writers
  // (applyInitialTheme, called from main.tsx, setPreference and the system
  // listener below) are there to beat an ordering, not to replace this one.
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Follows the device while the app is open. Only Auto repaints, but the
  // setting is tracked in every mode, so switching back to Auto lands on
  // what the device shows now, not on what it showed at launch.
  useEffect(
    () =>
      subscribeSystemTheme((next) => {
        // Before the re-render: see setPreference.
        if (preferenceRef.current === 'auto') applyTheme(next);
        setSystem(next);
      }),
    [],
  );

  function setPreference(p: ThemePreference) {
    // Written before the re-render, for the same reason as the initial stamp:
    // the map effects that resolve a token from the DOM run before the
    // provider's own effect, and would otherwise read the outgoing palette.
    applyTheme(resolveTheme(p, system));
    preferenceRef.current = p;
    setPreferenceState(p);
    storeThemePreference(p);
  }

  return (
    <ThemeCtx.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeCtx.Provider>
  );
}
