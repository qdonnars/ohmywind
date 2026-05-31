// Spherical geometry helpers — distances in nautical miles, angles in degrees.
// TypeScript mirror of packages/data-adapters/.../routing/geometry.py. Kept in
// sync so the client can sample the same route polyline the server segments.
// Earth radius 3440.065 NM (mean radius 6371.0088 km / 1.852).

export interface GeoPoint {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_NM = 3440.065;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

function angularDistanceRad(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);
  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return 2 * Math.asin(Math.min(1.0, Math.sqrt(h)));
}

export function haversineNm(a: GeoPoint, b: GeoPoint): number {
  return EARTH_RADIUS_NM * angularDistanceRad(a, b);
}

// Spherical linear interpolation along the great circle from a to b.
// fraction=0 returns a, fraction=1 returns b.
export function interpolateGreatCircle(
  a: GeoPoint,
  b: GeoPoint,
  fraction: number,
): GeoPoint {
  const delta = angularDistanceRad(a, b);
  if (delta < 1e-12) return { lat: a.lat, lon: a.lon };
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);
  const sinDelta = Math.sin(delta);
  const aCoef = Math.sin((1.0 - fraction) * delta) / sinDelta;
  const bCoef = Math.sin(fraction * delta) / sinDelta;
  const x =
    aCoef * Math.cos(lat1) * Math.cos(lon1) +
    bCoef * Math.cos(lat2) * Math.cos(lon2);
  const y =
    aCoef * Math.cos(lat1) * Math.sin(lon1) +
    bCoef * Math.cos(lat2) * Math.sin(lon2);
  const z = aCoef * Math.sin(lat1) + bCoef * Math.sin(lat2);
  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lon = Math.atan2(y, x);
  return { lat: toDeg(lat), lon: toDeg(lon) };
}
