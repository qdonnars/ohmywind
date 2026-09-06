// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Which theme to start in, and stamping it on <html>. Apart from theme.tsx for
// the same reason as useTheme.ts: that file exports components and nothing
// else, or Fast Refresh reloads the whole app on a theme edit.

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import type { ThemeMode } from "./useTheme";

const STORAGE_KEY = LOCAL_STORAGE_KEYS.theme;

// Every access below is guarded because both APIs throw outright, rather than
// returning null, when the browser blocks site data: Safari in private mode
// for localStorage, and any embedder that denies matchMedia. A theme is a
// preference, so failing to read one falls back to the default instead of
// taking the app down.
export function getInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage denied: fall through to the system preference.
  }
  // No stored preference: follow the system.
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    // matchMedia denied: fall through to the default below.
  }
  return "dark";
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
/**
 * What the system bars take as the page colour: the theme-color meta, read by
 * Android for the status bar of an installed app and by iOS for the status
 * bar of a home-screen web app (index.html asks for an opaque one). Same
 * values as --ow-bg-0 in tokens.css; the manifest pins the dark one, which
 * is the colour at launch, before any script runs.
 */
export const THEME_COLOR: Record<ThemeMode, string> = {
  dark: "#030712",
  light: "#f4f6fb",
};

/** Stamp the theme on the document: the attribute the tokens key on, and
    the colour the system bars follow. */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", mode);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[mode]);
}

export function applyInitialTheme(): void {
  applyTheme(getInitialMode());
}
