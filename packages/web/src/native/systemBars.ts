// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { SystemBarsStyle } from "@capacitor/core";

/**
 * The status bar style that stays readable over the page's theme. Capacitor
 * names a style after the background it sits on: `Dark` draws light icons
 * for a dark page, `Light` dark icons for a light one. Anything else leaves
 * the choice to the system.
 */
export function systemBarsStyleFor(theme: string | null): SystemBarsStyle {
  if (theme === "dark") return SystemBarsStyle.Dark;
  if (theme === "light") return SystemBarsStyle.Light;
  return SystemBarsStyle.Default;
}
