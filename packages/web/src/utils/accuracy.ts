// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** Below this the accuracy disc is smaller than the position dot itself, so
    drawing it adds nothing. */
const MIN_ACCURACY_M = 25;
/** Above this we are almost certainly on a desktop IP-derived fix. A disc
    that size would swamp the coastline the user is trying to read, so we
    keep the dot and drop the halo. */
const MAX_ACCURACY_M = 20_000;

/**
 * Whether the accuracy halo is worth drawing for this fix.
 *
 * Lives apart from the Leaflet layer so the threshold policy stays testable
 * without a DOM.
 */
export function shouldDrawAccuracy(accuracyM: number): boolean {
  return (
    Number.isFinite(accuracyM) &&
    accuracyM >= MIN_ACCURACY_M &&
    accuracyM <= MAX_ACCURACY_M
  );
}
