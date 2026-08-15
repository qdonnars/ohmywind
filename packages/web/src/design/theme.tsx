// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { createContext, useContext, useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'ow_theme';

function getInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  // No stored preference — follow system
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {}
  return 'dark';
}

const ThemeCtx = createContext<{
  mode: ThemeMode;
  resolvedTheme: ThemeMode;
  setMode: (m: ThemeMode) => void;
}>({ mode: 'dark', resolvedTheme: 'dark', setMode: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  function setMode(m: ThemeMode) {
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
  }

  return (
    <ThemeCtx.Provider value={{ mode, resolvedTheme: mode, setMode }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() { return useContext(ThemeCtx); }

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

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <button
      onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
      className="shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-sm font-semibold transition-colors"
      style={{ color: 'var(--ow-fg-1)', background: 'transparent' }}
      title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`}
      aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`}
    >
      {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
