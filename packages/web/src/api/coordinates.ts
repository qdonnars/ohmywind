// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Recognise coordinates typed straight into the search box.
 *
 * Sailors routinely carry a position off a chart, a logbook or another crew's
 * message rather than a place name, most often in degrees plus decimal
 * minutes. Making those first-class saves a detour through a converter.
 *
 * Supported: decimal pairs ("48.39, -4.49", French comma decimals included),
 * and degrees/minutes/seconds or degrees/decimal-minutes carrying explicit
 * hemisphere letters ("48°23.4'N 4°29.7'W", "N 48 23 24 W 004 29 42").
 * Anything else falls through to an ordinary text search.
 */

import { t } from "../i18n";
import { num1 } from "../plan/format";

export interface ParsedCoordinates {
  lat: number;
  lon: number;
}

const num = (raw: string): number => Number(raw.replace(",", "."));

/** "48.39, -4.49" or "48,39 -4,49". Rejects out-of-range values. */
const DECIMAL_PAIR =
  /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;

/**
 * Numbers, and hemisphere letters standing on their own.
 *
 * The lookarounds are what keep "Route 66" and "Oléron" from being read as
 * positions: a letter glued to other letters is part of a word, never a
 * hemisphere. Matching them case-insensitively without that guard would turn
 * every "o" in a place name into a heading west.
 */
const TOKEN = /(\d{1,3}(?:[.,]\d+)?)|(?<!\p{L})([NSEWO])(?!\p{L})/giu;

/** Degrees, then optional minutes, then optional seconds. */
function componentToDecimal(parts: string[], hemisphere: string): number {
  const [deg, min, sec] = parts;
  const value = num(deg) + (min ? num(min) / 60 : 0) + (sec ? num(sec) / 3600 : 0);
  // "O" is the French "Ouest"; charts and crews use it interchangeably with W.
  const negative = hemisphere === "S" || hemisphere === "W" || hemisphere === "O";
  return negative ? -value : value;
}

/**
 * Walk the tokens and group the numbers under the hemisphere letter they
 * belong to, whichever side it sits on. A single regex cannot do this: in
 * "N 48 23.4 W 004 29.7" the W is both the closing letter of nothing and the
 * opening letter of the longitude, and a greedy pattern swallows it as the
 * latitude's suffix.
 */
function collectComponents(input: string): { value: number; axis: "lat" | "lon" }[] {
  const components: { value: number; axis: "lat" | "lon" }[] = [];
  let pendingLetter: string | null = null;
  let numbers: string[] = [];

  const push = (letter: string) => {
    if (!numbers.length) return;
    const hemisphere = letter.toUpperCase();
    components.push({
      value: componentToDecimal(numbers, hemisphere),
      axis: hemisphere === "N" || hemisphere === "S" ? "lat" : "lon",
    });
    numbers = [];
  };

  TOKEN.lastIndex = 0;
  for (const [, digits, letter] of input.matchAll(TOKEN)) {
    if (digits) {
      numbers.push(digits);
      continue;
    }
    if (numbers.length) {
      // Numbers seen already: they belong to the letter that opened them if
      // there was one, otherwise to this closing letter.
      push(pendingLetter ?? letter);
      pendingLetter = pendingLetter ? letter : null;
    } else {
      pendingLetter = letter;
    }
  }
  if (pendingLetter) push(pendingLetter);
  return components;
}

function inRange(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

export function parseCoordinates(input: string): ParsedCoordinates | null {
  const decimal = DECIMAL_PAIR.exec(input);
  if (decimal) {
    const lat = num(decimal[1]);
    const lon = num(decimal[2]);
    return inRange(lat, lon) ? { lat, lon } : null;
  }

  // A hemisphere letter is required. Without one the input is far more
  // likely to be a place name that happens to contain digits.
  const components = collectComponents(input);
  const lat = components.find((c) => c.axis === "lat");
  const lon = components.find((c) => c.axis === "lon");
  if (!lat || !lon) return null;
  return inRange(lat.value, lon.value) ? { lat: lat.value, lon: lon.value } : null;
}

/** "48°23,4' N 4°29,7' O" — how the parsed position is echoed back. The
    hemisphere letters follow the reader's language: west is O on a French
    chart and W on an English one. */
export function formatCoordinates(lat: number, lon: number): string {
  const one = (value: number, positive: string, negative: string): string => {
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const minutes = (abs - deg) * 60;
    return `${deg}°${num1(minutes)}' ${value < 0 ? negative : positive}`;
  };
  return `${one(lat, t("explore.coordinates.north"), t("explore.coordinates.south"))} ${one(
    lon,
    t("explore.coordinates.east"),
    t("explore.coordinates.west"),
  )}`;
}
