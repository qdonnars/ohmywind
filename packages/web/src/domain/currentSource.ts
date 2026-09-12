// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Which source the currents on screen come from, and what to say about it.
 *
 * The cascade behind ``/api/v1/marine/marc`` is SHOM Atlas C2D when one of
 * its points lies within 500 m, MARC PREVIMER inside its grids, Open-Meteo
 * SMOC otherwise. Each answers a different question and ignores different
 * things: SHOM and MARC are tidal streams only (no wind, no general
 * circulation), SMOC folds tide, circulation and Stokes drift together on an
 * 8 km grid. The caption under the currents table says which, with the one
 * number that qualifies the value: the distance to the SHOM point sampled,
 * or the size of the MARC cell.
 *
 * The web only ever sees ``current_source`` when the overlay merged
 * (``mergeMarcOverlay``); on the plain Open-Meteo path the field is absent,
 * and ``null`` once it went through the forecast cache. Anything unknown
 * lands on SMOC, the most cautious wording.
 */

export type CurrentSourceKind =
  | { kind: "smoc" }
  | { kind: "marc"; resolutionM: number }
  | { kind: "shom"; nearestKm: number | null };

export function describeCurrentSource(
  source: string | null | undefined,
  marcResolutionM: number | null | undefined,
  shomNearestKm: number | null | undefined,
): CurrentSourceKind {
  if (!source) return { kind: "smoc" };
  if (source.startsWith("shom_c2d_")) {
    return { kind: "shom", nearestKm: shomNearestKm ?? null };
  }
  if (source.startsWith("marc_")) {
    // ``marc_<atlas>_<res>m``: the suffix is the fallback when the overlay
    // did not carry ``atlas_resolution_m`` separately.
    const fromLabel = /_(\d+)m$/.exec(source);
    const res = marcResolutionM ?? (fromLabel ? Number(fromLabel[1]) : null);
    if (res != null && res > 0) return { kind: "marc", resolutionM: res };
  }
  return { kind: "smoc" };
}

/**
 * A grid size for the caption: "250 m", "700 m", "2 km". Whole kilometres
 * only; no MARC atlas sits in between, and a decimal here would need the
 * locale's separator for one case that does not exist.
 */
export function formatGridSize(resolutionM: number): string {
  if (resolutionM >= 1000 && resolutionM % 1000 === 0) return `${resolutionM / 1000} km`;
  return `${Math.round(resolutionM)} m`;
}

/**
 * The SHOM sampling distance in metres, rounded to 10 m: what "relevé à
 * 300 m" reads from. Anything under 50 m is the point itself for the
 * caption's purposes (the caller words that case separately).
 */
export function shomDistanceM(nearestKm: number): number {
  return Math.round((nearestKm * 1000) / 10) * 10;
}
