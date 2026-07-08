// Pure geo helpers for the plan map. Deliberately leaflet-free: leaflet
// touches the DOM and crashes the node vitest env, and keeping these
// functions dependency-free makes them unit-testable in isolation.

/** Mean Earth radius in nautical miles (1 nm = 1852 m, R⊕ ≈ 6371 km). */
const EARTH_RADIUS_NM = 3440.065;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two lat/lon points, in nautical miles.
 * Uses the haversine formula — accurate enough for the short coastal
 * legs traced in the planner and stable near the poles.
 */
export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

/**
 * Format a distance in nautical miles for the map labels, French style:
 * comma decimal separator, one decimal below 10 nm, rounded to an integer
 * at or above 10 nm. e.g. 9.83 -> "9,8 nm", 12.4 -> "12 nm".
 */
export function fmtNm(nm: number): string {
  if (nm < 10) {
    return `${nm.toFixed(1).replace(".", ",")} nm`;
  }
  return `${Math.round(nm)} nm`;
}
