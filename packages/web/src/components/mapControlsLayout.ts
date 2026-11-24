// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Geometry of the round controls laid over the maps, in one place (#579,
 * #470). They form one column along the right edge of the map: the chart
 * toggle at the top, the zoom buttons under it (mouse and trackpad only),
 * the locate button at the bottom. Everything else on the map either keeps
 * out of that column (the hints, the framing of a route) or gives the map
 * the height the column needs (the drawer of the planner).
 *
 * The Tailwind classes that place each control repeat these values as
 * literals (`right-3`, `top-[68px]`, `bottom-4`): Tailwind reads them from
 * the source, it cannot compute them.
 *
 * On a page without a header (the explorer), the map runs under the status
 * bar and a bar of controls floats over its top (`MapTopBar`). The column
 * then hangs from the bottom of that bar rather than from the top of the
 * map, and its places depend on the safe-area insets, which only CSS knows:
 * they are the `.ow-chrome-*` rules of index.css, the same geometry in CSS
 * variables. `.ow-chrome-right` lines the column up under the bar's right
 * button (12 px from the edge on a phone, 18 px from lg up, under a 52 px
 * button 16 px from the edge), `.ow-chrome-slot-1` and `-2` are its first
 * two places under the bar (the chart toggle, then the zoom buttons, from lg
 * up; the zoom buttons alone on a phone, where the chart toggle is a
 * setting).
 */

/** Distance of the column from the right edge, and of the chart toggle
    from the top (`right-3`, `top-3`). */
const INSET_PX = 12;
/** A round control (`w-12 h-12`). */
const CONTROL_PX = 48;
/** Air between two controls, and between the column and anything beside it. */
const GAP_PX = 8;
/** The locate button sits this far above the bottom edge (`bottom-4`). */
const LOCATE_BOTTOM_PX = 16;
/** The zoom capsule: two 44 px halves, a 1 px rule and its 1 px border. */
const ZOOM_GROUP_PX = 2 * 44 + 1 + 2;

/** Width kept free along the right edge of the map: the column and its air.
    The hints of the planner keep out of it (`right-[68px]`), and so does
    the framing of a route. */
export const MAP_CONTROLS_GUTTER_PX = INSET_PX + CONTROL_PX + GAP_PX;

/** Top of the zoom buttons, right under the chart toggle (`top-[68px]`). */
const ZOOM_TOP_PX = INSET_PX + CONTROL_PX + GAP_PX;

/** The least height of a map that holds the chart toggle and the locate
    button one above the other without touching: below it the planner's
    drawer gives way rather than the map. */
export const MAP_MIN_PX = INSET_PX + CONTROL_PX + GAP_PX + CONTROL_PX + LOCATE_BOTTOM_PX;

/** The least height of the planner's map that also holds the zoom buttons
    between the two. Shorter, the zoom buttons stand down. */
export const ZOOM_MIN_FRAME_PX = ZOOM_TOP_PX + ZOOM_GROUP_PX + GAP_PX + CONTROL_PX + LOCATE_BOTTOM_PX;
