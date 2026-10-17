// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Whether a spot is on land, from the server's land mask.
 *
 * Open-Meteo Marine answers from the nearest sea cell however far inland the
 * point is: a click in the Léon, ten kilometres from the coast, showed 1.5 m
 * of swell and 1.9 kt of current (#480). The server holds the land mask the
 * tidal overlay and the passage engine already use, and says land only where
 * it is sure (more than about 2 km inland).
 *
 * Never on the critical path: the spot card shows what Open-Meteo returned
 * and blanks the sea values if this answers "land" later. Every failure
 * (network, a Space that predates the route, a cold start past the timeout)
 * answers "not land", which is the card as it was before.
 */

import { API_BASE } from "./config";
import type { MarineHourly } from "../types";

const LAND_URL = `${API_BASE}/api/v1/marine/land`;

const TIMEOUT_MS = 8000;

/** About 110 m: well under the mask's kilometre, so two clicks that share a
    key share an answer. */
function landKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/** Answers and requests in flight, for the session. Land does not move; a
    failure is dropped so the next click on the same point asks again. */
const cache = new Map<string, Promise<boolean>>();

export function fetchIsLand(lat: number, lon: number): Promise<boolean> {
  const key = landKey(lat, lon);
  const known = cache.get(key);
  if (known) return known;
  const request = (async () => {
    const resp = await fetch(`${LAND_URL}?lat=${lat}&lon=${lon}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) throw new Error(`land ${resp.status}`);
    const body = (await resp.json()) as { land?: unknown };
    return body.land === true;
  })().catch(() => {
    cache.delete(key);
    return false;
  });
  cache.set(key, request);
  return request;
}

/** The spot's marine data with nothing of the sea left in it: no tab but
    the wind's survives, and the map draws no wave or current there. */
export function withoutSea(data: MarineHourly): MarineHourly {
  const none = data.time.map(() => null);
  return {
    time: data.time,
    wave_height_m: none,
    wave_period_s: none,
    wave_direction_deg: none,
    current_speed_kn: none,
    current_direction_to_deg: none,
    tide_height_m: none,
  };
}

/** Test seam: forget every answer. Not used by the app. */
export function __resetLandCache(): void {
  cache.clear();
}
