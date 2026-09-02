// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The numeric bands the app colours and labels by, in one module.
 *
 * They were spread over four files, twice each in one of them: the Beaufort
 * ladder appeared as a table of steps and again as a bare array of maxima in
 * `utils/colors.ts`; the sea, current and tide bands sat inline in
 * `MarineTable.tsx`; the "mer formée" cutoff was written 1.25 in both
 * `aggregateLegs.ts` and the sidebar's leg list. A band edited in one copy and
 * not the other shows up as a cell coloured one way and captioned another.
 *
 * Colours are deliberately *not* here. The palettes live in `design/tokens.css`
 * as `--ow-w-0..8` (wind) and `--ow-c-1..5` (complexity), which is what makes
 * them theme-aware; this module only maps a value to a level, and hands back
 * the name of the CSS variable that level paints with.
 */

// ── Wind, Beaufort ───────────────────────────────────────────────────────────

/**
 * Upper bound in knots of Beaufort levels 0 to 7; anything above is level 8.
 * Nine steps over 0-50 kn, enough for a Mediterranean mistral (35-40 kn).
 */
const BEAUFORT_MAX_KN = [4, 7, 11, 15, 19, 23, 28, 33];

/** Beaufort level, 0 to 8, for a wind speed in knots. */
export function beaufortLevel(knots: number): number {
  const i = BEAUFORT_MAX_KN.findIndex((max) => knots < max);
  return i === -1 ? 8 : i;
}

/** Name of the `design/tokens.css` custom property painting a Beaufort level. */
export function windLevelToken(level: number): string {
  return `--ow-w-${level}`;
}

/** The same, ready to drop into a CSS value. */
export function windLevelVar(level: number): string {
  return `var(${windLevelToken(level)})`;
}

// ── Sea state ────────────────────────────────────────────────────────────────

/**
 * Significant wave height, in metres, above which a leg is called "mer formée".
 * Matches the `agitée` band edge of the server-side complexity scorer, so the
 * chip on a leg and the warning the MCP surfaces agree.
 */
export const SEA_FORMED_HS_M = 1.25;

/**
 * Hs band, mapped onto the wind palette so one colour scale reads across the
 * whole table. Aligned with packages/data-adapters/.../complexity._SEA_BANDS:
 * plate < 0.5, belle < 1, agitée < 2, forte < 3, très forte beyond.
 */
export function wavesLevel(hs: number): number {
  if (hs < 0.5) return 1;
  if (hs < 1.0) return 2;
  if (hs < 2.0) return 4;
  if (hs < 3.0) return 6;
  return 8;
}

// ── Currents ─────────────────────────────────────────────────────────────────

/**
 * Below this speed a current is noise rather than information, and its pill is
 * hidden. Mirror of `openwind_data.adapters.base`, which is what decides
 * whether the MCP mentions the current on a leg at all. Most Mediterranean
 * passages sit under it, by design.
 */
export const CURRENT_RELEVANCE_THRESHOLD_KN = 0.3;

/**
 * Current speed band in knots. Red (level 8) is reserved for >= 10 kn (Raz
 * Blanchard and Goulet de Brest spring-tide territory) so a typical
 * Mediterranean 0.7 kn does not alarm the reader. The intermediate range is
 * spread so 1-3 kn (Atlantic coastal current) reads visibly hotter than the
 * Mediterranean baseline without reaching extreme colours.
 */
export function currentsLevel(kn: number): number {
  if (kn < 0.3) return 0;
  if (kn < 1.0) return 1;
  if (kn < 2.0) return 2;
  if (kn < 3.0) return 3;
  if (kn < 4.0) return 4;
  if (kn < 5.0) return 5;
  if (kn < 7.0) return 6;
  if (kn < 10.0) return 7;
  return 8;
}

// ── Tide ─────────────────────────────────────────────────────────────────────

/**
 * Tidal range under which the tide is not worth surfacing, same mirror as
 * `CURRENT_RELEVANCE_THRESHOLD_KN`. The Mediterranean rarely clears it; the
 * Manche clears it by an order of magnitude.
 */
export const TIDE_RANGE_RELEVANCE_THRESHOLD_M = 0.5;

/**
 * Tide band, by magnitude: the height oscillates around zero, so high water
 * and low water deserve to be equally salient. Takes an absolute value.
 */
export function tidesLevel(absM: number): number {
  if (absM < 0.5) return 1;
  if (absM < 1.5) return 2;
  if (absM < 3.0) return 4;
  if (absM < 5.0) return 6;
  return 8;
}

// Wave period is informational (chop versus swell) rather than a hazard axis:
// a 4 s period at 0.6 m Hs is benign wind chop, not danger. Its row is left
// uncoloured on purpose, so it has no band here.

// ── Passage complexity ───────────────────────────────────────────────────────

/** Complexity level 1-5 derived from the per-segment true wind speed. */
export function cxLevel(tws_kn: number): 1 | 2 | 3 | 4 | 5 {
  if (tws_kn < 10) return 1;
  if (tws_kn < 15) return 2;
  if (tws_kn < 20) return 3;
  if (tws_kn < 25) return 4;
  return 5;
}

/** Name of the `design/tokens.css` custom property painting a complexity level. */
export function cxLevelToken(level: number): string {
  return `--ow-c-${level}`;
}

/** The same, ready to drop into a CSS value. */
export function cxLevelVar(level: number): string {
  return `var(${cxLevelToken(level)})`;
}
