// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Gesture thresholds, in one place.
 *
 * The plan map, the explore map and the drag-to-reorder list each read from
 * here, so a finger is judged the same way everywhere: the same travel turns
 * a press into a pan, the same stillness turns it into a hold. The values
 * come from two constraints that do not move: Chrome withholds `touchmove`
 * until its own slop (8 dp on Android) unless `touchstart` is cancelled, so
 * nothing under that can be measured on the page; and the native context
 * menu fires at about 500 ms, so every hold has to land before it.
 */

/** A pointer down and up within this is a tap. Longer is a finger resting
    or searching, which the maps must not read as a click. Mouse presses are
    exempt: a mouse has no reason to rest on a button. */
export const TAP_MAX_MS = 300;

/** Travel beyond this within a tap means the finger meant to move. Above the
    browser slop on purpose: under it, no movement is reported at all. */
export const TAP_SLOP_PX = 10;

/** A still finger for this long lifts a row in the model list. Under the
    native context menu. */
export const HOLD_MS = 350;

/** Movement beyond this before the hold fires cancels it: the user meant
    to pan or scroll. */
export const HOLD_SLOP_PX = 10;

/** On a waypoint marker, a press shorter than this is a tap (on the × it
    removes the point) and a press held past it is a grab: the marker lifts
    and follows the finger, from the disc or from the ×. Shorter than the
    row hold above on purpose: the finger is already on the thing it wants
    to move, and every extra beat before it lifts reads as the map not
    answering. */
export const WAYPOINT_GRAB_MS = 200;

/** The explore map drops a spot after this long a press on open water. A
    touch longer than the hold above, because nothing is being picked up:
    it is a deliberate act on empty space, and 400 ms reads as deliberate
    without feeling slow. */
export const LONG_PRESS_MS = 400;

/** How long an undo stays offered after a waypoint is removed by tap. */
export const UNDO_MS = 5000;

/** A tap on a waypoint younger than this is ignored: the second tap of a
    double tap lands on the marker the first one just created, and must not
    take it straight back. */
export const MARKER_SETTLE_MS = 500;

/** Width of the invisible line that catches taps on a route segment. The
    drawn line stays 5 to 6 px; this is what a finger or a cursor has to
    land within. */
export const SEGMENT_HIT_PX = { coarse: 24, fine: 12 } as const;

/** How far the drawer's grab handle reaches up over the map. A thumb aiming
    at the handle lands above it more often than below. */
export const DRAWER_HANDLE_REACH_PX = 12;

/** Whether the primary pointer is a finger. Read at the moment the map or
    the markers are built: the answer does not change while the page lives. */
export function isCoarsePointer(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}
