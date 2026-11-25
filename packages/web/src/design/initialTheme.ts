// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// The reader's theme choice, the device's own setting, and stamping the
// result on <html>. Apart from theme.tsx for the same reason as useTheme.ts:
// that file exports components and nothing else, or Fast Refresh reloads the
// whole app on a theme edit.

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import type { ThemeMode, ThemePreference } from "./useTheme";

const STORAGE_KEY = LOCAL_STORAGE_KEYS.theme;

const LIGHT_QUERY = "(prefers-color-scheme: light)";

// Every access below is guarded because both APIs throw outright, rather than
// returning null, when the browser blocks site data: Safari in private mode
// for localStorage, and any embedder that denies matchMedia. A theme is a
// preference, so failing to read one falls back to the default instead of
// taking the app down.

/** The stored choice. Anything but `light` or `dark`, absence included, is
    `auto`: there is no third value to store. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage denied: follow the system.
  }
  return "auto";
}

/**
 * Stores a choice. `auto` removes the entry rather than writing a value, so
 * the absence of `ow_theme` keeps meaning "follow the device", as it always
 * has, and an older build reading this storage does the same.
 */
export function storeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage denied: the theme still applies, it just will not survive a reload.
  }
}

function systemQuery(): MediaQueryList | null {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(LIGHT_QUERY)
      : null;
  } catch {
    return null;
  }
}

/** The device's setting. Dark when it says nothing or cannot be read, the
    app's historical default. */
export function readSystemTheme(): ThemeMode {
  return systemQuery()?.matches ? "light" : "dark";
}

/**
 * Calls `onChange` with the device's new setting each time it flips, for as
 * long as the app is open (a scheduled switch at dusk, the control centre).
 * Returns the unsubscribe.
 */
export function subscribeSystemTheme(onChange: (theme: ThemeMode) => void): () => void {
  const mql = systemQuery();
  if (!mql) return () => {};
  const listener = (e: MediaQueryListEvent) => onChange(e.matches ? "light" : "dark");
  try {
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  } catch {
    // A list without addEventListener (WebKit before 14): no live follow,
    // the setting is still read at each launch.
    return () => {};
  }
}

export function resolveTheme(preference: ThemePreference, system: ThemeMode): ThemeMode {
  return preference === "auto" ? system : preference;
}

/**
 * What the system bars take as the page colour: the theme-color meta, read by
 * Android for the status bar of an installed app and by iOS for the status
 * bar of a home-screen web app (index.html asks for an opaque one). Same
 * values as --ow-bg-0 in tokens.css; the manifest pins the dark one, which
 * is the colour at launch, before any script runs.
 */
const THEME_COLOR: Record<ThemeMode, string> = {
  dark: "#030712",
  light: "#f4f6fb",
};

/** Stamp the theme on the document: the attribute the tokens key on, and
    the colour the system bars follow. */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", mode);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[mode]);
}

/**
 * Stamp `data-theme` before React renders anything.
 *
 * Called from `main.tsx` rather than left to the provider's effect, because
 * effects run children first: on the very first mount, every component below
 * the provider runs its effects while `<html>` still carries no theme at all.
 * A component that resolves a token from the live DOM there (the two maps,
 * which hand Leaflet and the arrow layer a colour string rather than a
 * `var()`) would read the fallback palette and keep it until some unrelated
 * redraw. Idempotent, and the provider still owns every later change.
 */
export function applyInitialTheme(): void {
  applyTheme(resolveTheme(readThemePreference(), readSystemTheme()));
}
