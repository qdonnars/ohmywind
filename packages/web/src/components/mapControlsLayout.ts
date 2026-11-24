// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Geometry of the round controls laid over the maps, in one place (#579).
 * They form one column along the right edge of the map: the chart toggle at
 * the top, the locate button at the bottom. Everything else on the map
 * either keeps out of that column (the hints, the framing of a route) or
 * gives the map the height the column needs (the drawer of the planner).
 *
 * The Tailwind classes that place each control repeat these values as
 * literals (`right-3`, `top-3`, `bottom-4`): Tailwind reads them from
 * the source, it cannot compute them.
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

/** Width kept free along the right edge of the map: the column and its air.
    The hints of the planner keep out of it (`right-[68px]`), and so does
    the framing of a route. */
export const MAP_CONTROLS_GUTTER_PX = INSET_PX + CONTROL_PX + GAP_PX;

/** The least height of a map that holds the chart toggle and the locate
    button one above the other without touching: below it the planner's
    drawer gives way rather than the map. */
export const MAP_MIN_PX = INSET_PX + CONTROL_PX + GAP_PX + CONTROL_PX + LOCATE_BOTTOM_PX;
