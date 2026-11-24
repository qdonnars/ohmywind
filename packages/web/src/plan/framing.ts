// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Whether the camera frames the route when results land.
 *
 * The rule is « only at the user's request » (Calculer, Comparer): a
 * computation the reader did not ask for leaves the camera where they put
 * it. One exception: a route these results retraced at sea. It is not the
 * route the camera framed, it rounds a headland the straight line cut, and on
 * a link opened from elsewhere nobody pressed Calculer.
 *
 * `repair` is the session's repair as the results land, `knownRepair` the one
 * the page held before them: the same object means these results retraced
 * nothing.
 */
export function framesOnResults<Repair extends object>(
  requested: boolean,
  repair: Repair | null,
  knownRepair: Repair | null,
): boolean {
  return requested || (repair !== null && repair !== knownRepair);
}
