// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef, useState } from 'react';

import { useT } from '../i18n';
import {
  applyTheme,
  readSystemTheme,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  subscribeSystemTheme,
} from './initialTheme';
import { ThemeCtx, useTheme, type ThemePreference } from './useTheme';

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

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/** Flips to the other palette from the one on screen, and stores it: from
    Auto, this leaves Auto. */
export function ThemeToggle() {
  const { resolvedTheme: mode, setPreference } = useTheme();
  const { t } = useT();
  const label = mode === 'dark' ? t('explore.theme.toLight') : t('explore.theme.toDark');
  return (
    <button
      onClick={() => setPreference(mode === 'dark' ? 'light' : 'dark')}
      className="shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-sm font-semibold transition-colors"
      style={{ color: 'var(--ow-fg-1)', background: 'transparent' }}
      title={label}
      aria-label={label}
    >
      {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
