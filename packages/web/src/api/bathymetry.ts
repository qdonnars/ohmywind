// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Sounding at a point, from the EMODnet Bathymetry DTM.
 *
 * Why EMODnet and not OpenSeaMap: the OpenSeaMap depth server is
 * crowd-sourced sonar and has no usable coverage on the French coast.
 * EMODnet is the European reference grid, keyless, CORS-open, and
 * referenced to Lowest Astronomical Tide, i.e. the same chart datum a
 * sounding on a paper chart uses. So the number means to a sailor what
 * they expect it to mean.
 *
 * What it is NOT: the grid is 1/16 arc minute, about 115 m. That is fine
 * for "how much water is there on this leg" and blind to the isolated rock
 * between two grid nodes. Every surface that shows these values must say
 * so, the same way the 8 km SMOC currents are flagged as unfit for narrow
 * passes.
 *
 * Called straight from the browser, like the Open-Meteo forecasts: one
 * request per user rather than a proxy we would have to keep alive.
 */

const WMS = "https://ows.emodnet-bathymetry.eu/wms";

/** The full-resolution mean-depth layer. Positive values are land
    elevation, negative values are metres below chart datum. */
const LAYER = "emodnet:mean";

/** Half-width of the queried box, in degrees. Small enough that the single
    pixel we read back lands inside one DTM cell. */
const BOX_HALF_DEG = 0.0005;

const TIMEOUT_MS = 8000;

/**
 * Identifies the DTM cell a point falls in, at ~110 m, matching the grid.
 * Rounding finer would only turn cache hits into extra requests for the
 * same grid node, and nudging a waypoint by 20 m cannot change the answer.
 *
 * Exported because callers key their own state on it: a lookup and its
 * result have to agree on what counts as the same point.
 */
export function depthGridKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/** Resolved lookups, for the whole session. The DTM is a static product:
    a value never changes under us, so there is nothing to invalidate. */
const cache = new Map<string, number | null>();

/** Requests in flight, so two waypoints on the same grid node (or a
    re-render mid-fetch) share one call instead of racing. */
const inFlight = new Map<string, Promise<number | null>>();

function buildUrl(lat: number, lon: number): string {
  const bbox = [lat - BOX_HALF_DEG, lon - BOX_HALF_DEG, lat + BOX_HALF_DEG, lon + BOX_HALF_DEG];
  // WMS 1.3.0 with EPSG:4326 takes the bbox in lat,lon order, not lon,lat.
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetFeatureInfo",
    layers: LAYER,
    query_layers: LAYER,
    crs: "EPSG:4326",
    bbox: bbox.join(","),
    width: "1",
    height: "1",
    i: "0",
    j: "0",
    info_format: "application/json",
    styles: "",
  });
  return `${WMS}?${params.toString()}`;
}

/**
 * Metres of water below chart datum at this point, or null when there is
 * no sounding to show.
 *
 * Null covers three cases the caller must not tell apart, because none of
 * them is a depth:
 *  - the point is on land, which EMODnet answers with a positive elevation;
 *  - the point is outside the surveyed area, which it answers with a flat
 *    zero rather than a null, so an exact zero is read as "no data". A
 *    waypoint landing on the 0.000 m contour to the millimetre is not a
 *    case worth preserving, and printing "0 m" where we mean "unknown" is
 *    the dangerous way to be wrong;
 *  - the request failed. A sounding is a bonus on this map, never a reason
 *    to surface an error at someone mid-route.
 */
export async function fetchDepthM(lat: number, lon: number): Promise<number | null> {
  const key = depthGridKey(lat, lon);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async (): Promise<number | null> => {
    try {
      const res = await fetch(buildUrl(lat, lon), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        features?: { properties?: { Depth?: unknown } }[];
      };
      const raw = json.features?.[0]?.properties?.Depth;
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw >= 0) return null;
      return -raw;
    } catch {
      return null;
    }
  })();

  inFlight.set(key, request);
  const depth = await request;
  inFlight.delete(key);
  cache.set(key, depth);
  return depth;
}

/** Test seam: the module-level cache would otherwise leak between cases. */
export function __resetDepthCache(): void {
  cache.clear();
  inFlight.clear();
}
