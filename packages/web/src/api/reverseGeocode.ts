// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Naming a point on the water, from Nominatim.
 *
 * Used once per spot creation: a long press on the map opens the "new spot"
 * dialog pre-filled with the nearest place name, so the user validates a name
 * instead of typing coordinates.
 *
 * ## Nominatim usage policy
 *
 * The public instance at nominatim.openstreetmap.org is free and asks three
 * things of us (https://operations.osmfoundation.org/policies/nominatim/):
 *
 * 1. **Identify the application.** A browser refuses to let a page set
 *    `User-Agent`, so the two levers we have are the `Referer` header, which
 *    Chrome, Firefox and Safari all send by default from `ohmywind.fr`, and
 *    the officially supported `email` parameter. We send both: the parameter
 *    carries the project's published contact address, which already ships in
 *    the privacy page, and survives a `Referrer-Policy` stricter than ours.
 * 2. **At most one request per second.** One long press cannot beat that, and
 *    the cache below removes the repeat lookups that a user pressing around
 *    the same bay would otherwise generate.
 * 3. **Cache results.** Hence the in-memory map. It is per tab and per
 *    session on purpose: the answer is a place name, cheap to refetch, and
 *    persisting it would mean one more storage key to version.
 *
 * A failure of any kind falls back to the coordinates. Naming a spot is a
 * convenience; a network hiccup must not stop the user from saving a point.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

/** Published project address, per the "identify your application" clause. */
const CONTACT_EMAIL = "contact@ohmywind.fr";

/** Past this, a slow answer is worse than the coordinates it would replace:
    the dialog is already open and waiting on it. */
const TIMEOUT_MS = 4000;

/** Rounding the cache key to ~100 m: two presses that close deserve the same
    name, and it is the resolution `zoom=10` answers at anyway. */
const KEY_DECIMALS = 3;

/** One entry per distinct place looked up in this tab. A few dozen at most in
    a long session, so no eviction beyond the cap. */
const CACHE_MAX = 200;
const cache = new Map<string, string>();

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(KEY_DECIMALS)},${lon.toFixed(KEY_DECIMALS)}`;
}

/** What we fall back to, and what a cacheless caller sees on failure. */
export function coordinateName(lat: number, lon: number): string {
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
}

interface NominatimReverse {
  address?: NominatimAddress;
  display_name?: string;
}

/** The most specific place name the answer carries, largest-scale first. */
function pickName(data: NominatimReverse, lat: number, lon: number): string {
  const addr = data.address ?? {};
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    data.display_name?.split(",")[0] ||
    coordinateName(lat, lon)
  );
}

/**
 * Nearest place name for a point, or its coordinates if none can be had.
 *
 * `signal` lets the caller drop a lookup whose dialog has been dismissed. An
 * abort resolves to the coordinates rather than throwing: every caller wants
 * a name, and none of them wants to handle two failure modes.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string> {
  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  // The timeout is ours; the caller's signal is theirs. `AbortSignal.any`
  // gives the fetch a single signal that both can trip.
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    const res = await fetch(
      `${NOMINATIM_URL}?format=json&lat=${lat}&lon=${lon}&zoom=10` +
        `&email=${encodeURIComponent(CONTACT_EMAIL)}`,
      { headers: { "Accept-Language": "fr" }, signal: combined },
    );
    if (!res.ok) return coordinateName(lat, lon);
    const name = pickName((await res.json()) as NominatimReverse, lat, lon);
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, name);
    return name;
  } catch {
    // Network error, abort, timeout or malformed JSON: same answer.
    return coordinateName(lat, lon);
  }
}

/** Test seam: the module-level cache would otherwise leak between cases. */
export function clearReverseGeocodeCache(): void {
  cache.clear();
}
