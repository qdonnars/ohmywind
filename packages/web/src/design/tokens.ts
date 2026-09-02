// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Reading a design token from code.
 *
 * `design/tokens.css` is the single source of truth for the palette, and it is
 * what makes the two themes possible: `[data-theme="light"]` redefines the same
 * custom properties. Anything rendered by React can therefore just write
 * `var(--ow-accent)` and be done.
 *
 * Canvas and Leaflet cannot. Leaflet writes its `color` option straight into an
 * SVG presentation attribute, where `var()` support is uneven across engines,
 * and a canvas context takes a resolved colour string or nothing. Those two
 * call sites resolve the token here rather than repeating its hex value, which
 * is how the accent ended up written out four times, light theme included.
 *
 * Resolved on each call on purpose: the value changes when the theme does, and
 * caching it would freeze the map on the palette in force at first paint.
 */
export function readToken(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
