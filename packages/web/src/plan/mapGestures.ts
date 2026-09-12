// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { TAP_MAX_MS, TAP_SLOP_PX } from "../domain/gestures";

/**
 * The pure part of the plan map's gestures: which segment a tap meant, and
 * whether the click Leaflet is about to hand us came from a clean tap.
 * Nothing here touches Leaflet or the DOM, so it is tested on its own.
 */

export interface XY {
  x: number;
  y: number;
}

/**
 * Closest point of a polyline to `p`, all in screen pixels: which segment,
 * the point on it, and how far `p` was from it.
 *
 * Chosen by perpendicular distance rather than by distance to the segment
 * midpoints, which the plan map used to do: with one 3 nm leg next to a 40
 * nm one, a tap in the long leg's first third was closer to the short leg's
 * midpoint and inserted the waypoint in the wrong leg. The point returned is
 * the projection, so a tap 10 px off the line inserts a waypoint on the
 * line, not a kink beside it.
 */
export function closestOnPolyline(
  points: XY[],
  p: XY,
): { segIdx: number; point: XY; distPx: number } | null {
  let best: { segIdx: number; point: XY; distPx: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    const distPx = Math.hypot(p.x - point.x, p.y - point.y);
    if (!best || distPx < best.distPx) best = { segIdx: i, point, distPx };
  }
  return best;
}

export interface PointerStart {
  pointerId: number;
  x: number;
  y: number;
  /** Milliseconds, any monotonic clock; compared with the matching end. */
  t: number;
  /** The pointer went down inside the map container. */
  inside: boolean;
  /** The pointer went down on a waypoint marker: that tap belongs to the
      marker, never to the map behind it. */
  onMarker: boolean;
  /** Mouse presses have no duration limit; a finger resting does. */
  mouse: boolean;
  /** Mouse button; anything but the main one is not a click. */
  button: number;
}

export interface PointerEnd {
  pointerId: number;
  x: number;
  y: number;
  t: number;
}

/**
 * Decides whether the `click` Leaflet fires on the map, or on a route
 * segment, came from a clean tap: one pointer, started inside the map and
 * not on a marker, under the slop, and (for a finger) short.
 *
 * Why this exists: on Chrome a touch that travels less than the browser slop
 * is a click no matter how long it lasted, and Leaflet's own tolerance never
 * sees it, because the browser withholds `touchmove` inside the slop. A
 * thumb reaching for the drawer handle and landing on the map a few pixels
 * above it therefore added a waypoint (#389). Pointer events are delivered
 * inside the slop, so the page can measure what the click cannot.
 *
 * Feed every pointer event of the window in, then ask `acceptClick` from
 * the click handler. The verdict is consumed by the first click that reads
 * it, and expires: a click with no pointer gesture behind it, or one whose
 * gesture ended elsewhere, is refused.
 */
export class TapGuard {
  private pointers = 0;
  private gesture: (PointerStart & { travel: number; crowded: boolean }) | null = null;
  private verdict: { at: number; clean: boolean } | null = null;

  private readonly maxMs: number;
  private readonly slopPx: number;
  /** A click follows its pointerup at once; anything later is not it. */
  private readonly clickWindowMs: number;

  constructor(maxMs = TAP_MAX_MS, slopPx = TAP_SLOP_PX, clickWindowMs = 700) {
    this.maxMs = maxMs;
    this.slopPx = slopPx;
    this.clickWindowMs = clickWindowMs;
  }

  pointerDown(p: PointerStart): void {
    this.pointers += 1;
    if (this.pointers > 1) {
      // A second finger during a gesture (a pinch starting) spoils it.
      if (this.gesture) this.gesture.crowded = true;
      return;
    }
    this.gesture = { ...p, travel: 0, crowded: false };
  }

  pointerMove(p: PointerEnd): void {
    const g = this.gesture;
    if (!g || g.pointerId !== p.pointerId) return;
    g.travel = Math.max(g.travel, Math.hypot(p.x - g.x, p.y - g.y));
  }

  pointerUp(p: PointerEnd): void {
    this.pointers = Math.max(0, this.pointers - 1);
    const g = this.gesture;
    if (!g || g.pointerId !== p.pointerId) return;
    const travel = Math.max(g.travel, Math.hypot(p.x - g.x, p.y - g.y));
    const clean =
      g.inside &&
      !g.onMarker &&
      !g.crowded &&
      g.button === 0 &&
      travel <= this.slopPx &&
      (g.mouse || p.t - g.t <= this.maxMs);
    this.verdict = { at: p.t, clean };
    this.gesture = null;
  }

  pointerCancel(p: PointerEnd): void {
    this.pointers = Math.max(0, this.pointers - 1);
    const g = this.gesture;
    if (!g || g.pointerId !== p.pointerId) return;
    this.verdict = { at: p.t, clean: false };
    this.gesture = null;
  }

  /** Whether the click arriving now is the tail of a clean tap. Consumes
      the verdict either way. */
  acceptClick(now: number): boolean {
    const v = this.verdict;
    this.verdict = null;
    return !!v && v.clean && now - v.at <= this.clickWindowMs;
  }
}
