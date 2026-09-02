// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { PassageResponse, PassageByEtaResponse, MultiWindowResponse, Archetype } from "../plan/types";
import type { ModelName } from "../config/modelConfig";
import type { PolarData } from "../config/polarConfig";
import { API_BASE } from "./config";
import type { ForecastCache } from "./forecastCache";

// Plan-time overrides driven by the user's /config preferences. Both are
// optional — when omitted, the server falls back to its bundled archetype
// polar and the hard-coded AUTO model chain. The shape mirrors what the
// HF Space's `_parse_polar` and `_translate_models` helpers expect.
export interface PlanOverrides {
  models?: ModelName[];
  polar?: PolarData;
}

// Render a Retry-After delay as a French sentence. Rounds up: telling someone
// to wait 4 minutes when 4 min 10 s remain earns a second error message.
export function formatRetryDelay(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return "Patientez quelques minutes avant de relancer.";
  }
  if (seconds < 60) {
    return `Patientez ${Math.ceil(seconds)} secondes avant de relancer.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Patientez ${minutes} minute${minutes > 1 ? "s" : ""} avant de relancer.`;
}

// Extract the error message from a non-OK response, carrying the Retry-After
// delay along when the server sent one. It travels inside the message string
// because every call site funnels through `friendlyError(e.message)`.
async function toError(res: Response): Promise<Error> {
  const err = (await res.json().catch(() => ({}))) as Record<string, string>;
  const message = err["error"] ?? `Erreur serveur ${res.status}`;
  const retryAfter = res.status === 429 ? res.headers.get("Retry-After") : null;
  if (retryAfter && /^\d+$/.test(retryAfter.trim())) {
    return new Error(`${message}, retry in ${retryAfter.trim()}s`);
  }
  return new Error(message);
}

// Translate known backend error messages to actionable French. Returns the
// original string if no rule matches, so unknown errors stay debuggable.
export function friendlyError(raw: string): string {
  if (/forecast horizon exceeded/i.test(raw)) {
    // Cause la plus fréquente : date > today+15 (cap Open-Meteo). Mais peut
    // aussi survenir transitoirement quand un modèle de la chaîne tombe ;
    // d'où la formulation prudente. On rappelle l'horizon approximatif et on
    // demande explicitement de ne pas recharger la page (sinon la
    // planification en cours est perdue).
    return "Le service météo n'a pas pu couvrir cette période. Choisissez une date plus proche (jusqu'à environ 10 jours selon le modèle). Pour préserver votre planification, ne rechargez pas la page tant que vous n'avez pas ajusté la date.";
  }
  if (/at least 2 waypoints/i.test(raw)) {
    return "Placez au moins 2 waypoints sur la carte pour calculer une route.";
  }
  if (/waypoint \d+: (lat|lon)=.* out of range/i.test(raw)) {
    return "Un waypoint est hors des coordonnées valides. Replacez-le sur la carte.";
  }
  if (/too many waypoints/i.test(raw)) {
    return "Trop de waypoints sur cette route. Retirez-en quelques-uns pour la simplifier.";
  }
  if (/rate limit exceeded/i.test(raw)) {
    // The server owns the delay: the window is configurable per environment,
    // so never hard-code one here. The previous copy promised "une minute"
    // against a 300 s window, so the user waited, retried, and got the exact
    // same error. When the header is missing we stay vague rather than lie.
    //
    // The suffix is appended by `toError` and is not adjacent to the server's
    // own wording ("rate limit exceeded, retry shortly"), so it is matched
    // separately rather than as an optional tail of the pattern above.
    const retryIn = /retry in (\d+)s/i.exec(raw);
    const seconds = retryIn ? Number(retryIn[1]) : null;
    return `Trop de calculs lancés coup sur coup. ${formatRetryDelay(seconds)}`;
  }
  if (/unknown archetype/i.test(raw)) {
    return "Type de bateau inconnu. Sélectionnez un archétype dans la liste.";
  }
  if (/invalid (departure|latest_departure|target_eta|target_arrival)/i.test(raw)) {
    return "Date invalide. Vérifiez le format des champs date.";
  }
  if (/target_arrival must be timezone-aware/i.test(raw)) {
    return "L'heure d'arrivée doit inclure le fuseau horaire.";
  }
  if (/sweep would produce \d+ windows/i.test(raw)) {
    return "Trop de créneaux à comparer. Réduisez la fenêtre ou augmentez le pas d'échantillonnage.";
  }
  if (/upstream weather service did not respond in time/i.test(raw)) {
    // Open-Meteo timed out (ReadTimeout / ConnectTimeout). Usually transient —
    // HF Spaces' shared egress is jittery and Open-Meteo occasionally pauses.
    return "Le service météo a mis trop de temps à répondre. Réessayez dans quelques instants.";
  }
  if (/upstream weather service rate limit/i.test(raw)) {
    // Open-Meteo throttling US, not the user throttling us. Deliberately worded
    // so nobody reads it as "you clicked too fast": the quota is counted per
    // egress IP and can be spent by an unrelated tenant of the same host, so
    // slowing down changes nothing. Distinct from the /rate limit exceeded/
    // rule above, which is our own limiter and IS about the caller's pace.
    return "Le service météo limite temporairement nos requêtes. Ce n'est pas lié à votre usage, réessayez dans quelques minutes.";
  }
  if (/Erreur serveur 5\d\d/.test(raw) || /HTTP 5\d\d/.test(raw)) {
    return "Le serveur météo est indisponible. Réessayez dans quelques instants.";
  }
  return raw;
}

export async function fetchPassage(params: {
  waypoints: [number, number][];
  departure: string;
  archetype: string;
  efficiency?: number;
  overrides?: PlanOverrides;
  forecastCache?: ForecastCache;
  /** Additive: when the caller starts a newer computation, or leaves the
      page, the request in flight is dropped instead of racing the new one to
      the reducer. Omitted everywhere else, where the previous behaviour of
      never cancelling is still what is wanted. */
  signal?: AbortSignal;
}): Promise<PassageResponse> {
  const body: Record<string, unknown> = {
    waypoints: params.waypoints,
    departure: params.departure,
    archetype: params.archetype,
    efficiency: params.efficiency ?? 0.75,
  };
  if (params.overrides?.models?.length) body["models"] = params.overrides.models;
  if (params.overrides?.polar) body["polar"] = params.overrides.polar;
  if (params.forecastCache) body["forecast_cache"] = params.forecastCache;
  const res = await fetch(`${API_BASE}/api/v1/passage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<PassageResponse>;
}

export async function fetchPassageWindows(params: {
  waypoints: [number, number][];
  earliest: string;
  latest: string;
  archetype: string;
  intervalHours: number;
  targetEta?: string;
  efficiency?: number;
  overrides?: PlanOverrides;
  forecastCache?: ForecastCache;
  /** See `fetchPassage`. */
  signal?: AbortSignal;
}): Promise<MultiWindowResponse> {
  const body: Record<string, unknown> = {
    waypoints: params.waypoints,
    departure: params.earliest,
    archetype: params.archetype,
    efficiency: params.efficiency ?? 0.75,
    latest_departure: params.latest,
    sweep_interval_hours: params.intervalHours,
  };
  if (params.targetEta) body["target_eta"] = params.targetEta;
  if (params.overrides?.models?.length) body["models"] = params.overrides.models;
  if (params.overrides?.polar) body["polar"] = params.overrides.polar;
  if (params.forecastCache) body["forecast_cache"] = params.forecastCache;

  const res = await fetch(`${API_BASE}/api/v1/passage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<MultiWindowResponse>;
}

export async function fetchPassageByEta(params: {
  waypoints: [number, number][];
  targetArrival: string;
  archetype: string;
  efficiency?: number;
  overrides?: PlanOverrides;
  forecastCache?: ForecastCache;
  /** See `fetchPassage`. */
  signal?: AbortSignal;
}): Promise<PassageByEtaResponse> {
  const body: Record<string, unknown> = {
    waypoints: params.waypoints,
    target_arrival: params.targetArrival,
    archetype: params.archetype,
    efficiency: params.efficiency ?? 0.75,
  };
  if (params.overrides?.models?.length) body["models"] = params.overrides.models;
  if (params.overrides?.polar) body["polar"] = params.overrides.polar;
  if (params.forecastCache) body["forecast_cache"] = params.forecastCache;

  const res = await fetch(`${API_BASE}/api/v1/passage-by-eta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<PassageByEtaResponse>;
}

// The boat catalogue is static for the life of a deploy, yet it was refetched
// on every mount of /plan: a round trip to the Space measured at 0.6 to 0.7 s
// on mobile, paid again on every trip back from the explore map. Cached as the
// promise rather than the value so two mounts in the same frame share one
// request. Keyed by URL so a future variant cannot collide with this one.
const archetypesInFlight = new Map<string, Promise<Archetype[]>>();

export function fetchArchetypes(): Promise<Archetype[]> {
  const url = `${API_BASE}/api/v1/archetypes`;
  const cached = archetypesInFlight.get(url);
  if (cached) return cached;
  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Archetype[];
  })();
  // A failure must not be remembered: the Space may simply have been cold, and
  // the next mount deserves a real attempt rather than the same rejection.
  promise.catch(() => archetypesInFlight.delete(url));
  archetypesInFlight.set(url, promise);
  return promise;
}
