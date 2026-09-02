// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The arrows drawn over the active spot, as pure geometry.
 *
 * Everything here is a function of numbers to numbers, or of numbers to an SVG
 * string. Nothing touches Leaflet, React or the DOM: `SpotMap` builds the items,
 * relaxes them, renders them to a string and hands that string to a `divIcon`.
 * Extracted from the component so the label-collision pass and the per-metric
 * scales can be read, and tested, without a map.
 *
 * ## What is drawn
 *
 * A single 300x300 SVG anchored on the spot, centre (150, 150). For `wind`,
 * one arrow and one label per forecast model. For `waves` and `currents`, a
 * single arrow from the Open-Meteo Marine series. `tides` is scalar and gets
 * no arrow at all.
 *
 * ## Conventions, which differ by metric
 *
 * Wind and wave directions come "from" (meteorological convention), so their
 * arrows are flipped 180 degrees to point where the wind blows and where the
 * waves run. A current direction is already a "to", and is drawn as-is. This
 * is the asymmetry behind issue #269, and the legend in the marine table says
 * so in words.
 */

import type { MarineHourly, ModelForecast } from "../types";

/** Centre of the arrow canvas, i.e. the spot itself. */
export const SPOT_CX = 150;
export const SPOT_CY = 150;

/** Approximate label half-width and half-height (18 px value over 13 px caption). */
const LABEL_HW = 32;
const LABEL_HH = 22;
/** Labels never slide back over the spot marker itself. */
const MIN_FROM_SPOT = 60;

export type ArrowItem = {
  rad: number;
  tipX: number;
  tipY: number;
  /** Label centre, after relaxation. */
  lblX: number;
  lblY: number;
  /** Label centre before relaxation, used to decide whether a leader is needed. */
  natLblX: number;
  natLblY: number;
  /** Top label, e.g. "15" (wind kn), "0.5m" (Hs), "1.5 kn" (current). */
  displayText: string;
  /** Bottom caption, e.g. "AROME", "8s". Empty for a single-line label. */
  caption: string;
  color: string;
};

/**
 * (angle, length) to a fully positioned item. The label sits just past the
 * tip, along the arrow, which is where it would naturally go before any
 * neighbour pushes it aside.
 */
export function buildArrowItem(
  rad: number,
  length: number,
  displayText: string,
  caption: string,
  color: string,
): ArrowItem {
  const tipX = SPOT_CX + Math.sin(rad) * length;
  const tipY = SPOT_CY - Math.cos(rad) * length;
  const natLblX = tipX + Math.sin(rad) * 26;
  const natLblY = tipY - Math.cos(rad) * 26;
  return {
    rad, tipX, tipY,
    lblX: natLblX, lblY: natLblY,
    natLblX, natLblY,
    displayText, caption, color,
  };
}

/**
 * Push overlapping labels apart, in place.
 *
 * Labels naturally sit past their arrow tip, in the arrow's direction, so two
 * models predicting a similar direction stack their numbers on top of each
 * other. A few passes of a minimum-translation push separate them; whatever
 * has drifted from its tip gets a leader line back, drawn by `leaderMarkup`.
 */
export function relaxLabels(items: ArrowItem[]): void {
  const ITERATIONS = 40;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const dx = b.lblX - a.lblX;
        const dy = b.lblY - a.lblY;
        // AABB overlap on each axis
        const overlapX = LABEL_HW * 2 - Math.abs(dx);
        const overlapY = LABEL_HH * 2 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          // push along the smaller-overlap axis (minimum-translation vector)
          if (overlapX < overlapY) {
            const push = overlapX * 0.5 * Math.sign(dx || 1);
            a.lblX -= push;
            b.lblX += push;
          } else {
            const push = overlapY * 0.5 * Math.sign(dy || 1);
            a.lblY -= push;
            b.lblY += push;
          }
          moved = true;
        }
      }
    }
    // After each pass, project labels out of the spot-marker keep-out radius.
    for (const it of items) {
      const dx = it.lblX - SPOT_CX;
      const dy = it.lblY - SPOT_CY;
      const dist = Math.hypot(dx, dy);
      if (dist < MIN_FROM_SPOT && dist > 0.001) {
        const scale = MIN_FROM_SPOT / dist;
        it.lblX = SPOT_CX + dx * scale;
        it.lblY = SPOT_CY + dy * scale;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function arrowMarkup(it: ArrowItem): string {
  // Thin shaft + narrow arrowhead. Shaft stops at the base of the head so the
  // two strokes don't pile up under the tip, which gives a sharp, single-pointed
  // look.
  const headLen = 13;
  const headAng = 0.3;
  const lx = it.tipX - headLen * Math.sin(it.rad - headAng);
  const ly = it.tipY + headLen * Math.cos(it.rad - headAng);
  const rx = it.tipX - headLen * Math.sin(it.rad + headAng);
  const ry = it.tipY + headLen * Math.cos(it.rad + headAng);
  // Where the shaft should end (midpoint of the arrowhead base, along the shaft axis).
  const baseDist = headLen * Math.cos(headAng);
  const shaftX = it.tipX - baseDist * Math.sin(it.rad);
  const shaftY = it.tipY + baseDist * Math.cos(it.rad);
  const dropColor = it.color === "#ffffff" ? "#000" : "#fff";
  return `<line x1="${SPOT_CX}" y1="${SPOT_CY}" x2="${shaftX}" y2="${shaftY}" stroke="${it.color}" stroke-width="3" stroke-linecap="round" style="filter:drop-shadow(0 0 1.5px ${dropColor})"/>
    <polygon points="${it.tipX},${it.tipY} ${lx},${ly} ${rx},${ry}" fill="${it.color}" style="filter:drop-shadow(0 0 1.5px ${dropColor})"/>`;
}

function leaderMarkup(it: ArrowItem): string {
  // Only draw a leader if the label has been displaced from its natural position.
  const drift = Math.hypot(it.lblX - it.natLblX, it.lblY - it.natLblY);
  if (drift < 6) return "";
  return `<line x1="${it.tipX}" y1="${it.tipY}" x2="${it.lblX}" y2="${it.lblY}" stroke="${it.color}" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.55"/>`;
}

function labelMarkup(it: ArrowItem): string {
  const shadow = it.color === "#ffffff"
    ? "0 0 3px #000,0 0 6px #000"
    : "0 0 3px #fff,0 0 5px #fff";
  const caption = it.caption
    ? `<text x="${it.lblX}" y="${it.lblY + 20}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#fff" style="text-shadow:0 0 3px #000,0 0 5px #000">${it.caption}</text>`
    : "";
  return `<text x="${it.lblX}" y="${it.lblY}" text-anchor="middle" dominant-baseline="middle" font-size="18" font-weight="700" fill="${it.color}" style="text-shadow:${shadow}">${it.displayText}</text>${caption}`;
}

// ── Per-metric builders ──────────────────────────────────────────────────────

/** One arrow per model, length growing with the wind, capped so a gale does
    not draw off the canvas. Direction is "from", hence the 180 degree flip. */
export function windArrowItems(
  forecasts: ModelForecast[],
  selectedHour: string,
  color: string,
): ArrowItem[] {
  const items: ArrowItem[] = [];
  for (const forecast of forecasts) {
    const timeIdx = forecast.hourly.time.indexOf(selectedHour);
    if (timeIdx === -1) continue;
    const dir = forecast.hourly.wind_direction_10m[timeIdx];
    const spd = forecast.hourly.wind_speed_10m[timeIdx];
    if (dir == null || spd == null) continue;
    const rad = ((dir + 180) * Math.PI) / 180;
    const length = Math.min(72 + spd * 4.8, 240);
    items.push(buildArrowItem(rad, length, String(Math.round(spd)), forecast.modelName, color));
  }
  return items;
}

/** A single arrow from the Marine series. Hs is scaled so a 2 m sea reads
    visually like a 20 kn wind on the wind layer; the caption is the dominant
    period, which is what separates swell from chop. Direction is "from". */
export function waveArrowItems(
  marine: MarineHourly,
  selectedHour: string,
  color: string,
): ArrowItem[] {
  const timeIdx = marine.time.indexOf(selectedHour);
  if (timeIdx === -1) return [];
  const dir = marine.wave_direction_deg[timeIdx];
  const hs = marine.wave_height_m[timeIdx];
  if (dir == null || hs == null) return [];
  const rad = ((dir + 180) * Math.PI) / 180;
  const length = Math.min(72 + hs * 50, 240);
  const period = marine.wave_period_s[timeIdx];
  const caption = period != null ? `${period.toFixed(0)}s` : "Hs";
  return [buildArrowItem(rad, length, `${hs.toFixed(1)}m`, caption, color)];
}

/** A single arrow, drawn where the current sets: the Marine direction is
    already a "to", so no flip. The scale is tuned to navigational impact
    (1 kn reads like 5 kn of wind, 4 kn like 20) rather than to the raw value,
    so a typical Mediterranean sub-knot drift is not over-dramatised. One line
    only: a current has no second axis to caption. */
export function currentArrowItems(
  marine: MarineHourly,
  selectedHour: string,
  color: string,
): ArrowItem[] {
  const timeIdx = marine.time.indexOf(selectedHour);
  if (timeIdx === -1) return [];
  const spd = marine.current_speed_kn[timeIdx];
  const dir = marine.current_direction_to_deg[timeIdx];
  if (spd == null || dir == null) return [];
  const rad = (dir * Math.PI) / 180;
  const length = Math.min(60 + spd * 25, 180);
  return [buildArrowItem(rad, length, `${spd.toFixed(1)} kn`, "", color)];
}

/**
 * The finished `<svg>` for a set of items, or an empty string when there is
 * nothing to draw. Relaxes the labels on the way, since no caller wants the
 * unrelaxed form. Render order matters: arrows behind, then leader lines,
 * then labels on top.
 */
export function arrowsSvg(items: ArrowItem[]): string {
  if (items.length === 0) return "";
  relaxLabels(items);
  let content = "";
  for (const it of items) content += arrowMarkup(it);
  for (const it of items) content += leaderMarkup(it);
  for (const it of items) content += labelMarkup(it);
  return `<svg width="300" height="300" viewBox="0 0 300 300" style="overflow:visible;pointer-events:none">${content}</svg>`;
}
