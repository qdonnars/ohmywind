// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { PassageResponse, PassageByEtaResponse, MultiWindowResponse, Archetype } from "../plan/types";
import type { ModelName } from "../config/modelConfig";
import type { PolarData } from "../config/polarConfig";
import { API_BASE } from "./config";
import type { ForecastCache } from "./forecastCache";
import {
  ApiShapeError,
  parseArchetypes,
  parseMultiWindowResponse,
  parsePassageByEtaResponse,
  parsePassageResponse,
} from "./parse";

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

/**
 * The failures the API can report.
 *
 * ## Stable error codes
 *
 * The server answers `{ error, code, retry_after? }`. `code` is the machine
 * half of the contract and the one this module keys its French copy on;
 * `error` stays for compatibility and for debugging. The codes we expect, and
 * the situations they name:
 *
 * | code | situation |
 * |---|---|
 * | `forecast_horizon` | date past what the weather models cover |
 * | `too_few_waypoints` | fewer than two points |
 * | `waypoint_out_of_range` | a latitude or longitude outside its range |
 * | `too_many_waypoints` | route too long to sample |
 * | `rate_limited` | our own limiter, with `retry_after` in seconds |
 * | `unknown_archetype` | boat slug absent from the catalogue |
 * | `invalid_datetime` | an unparseable date field |
 * | `naive_datetime` | a date without a timezone where one is required |
 * | `sweep_too_large` | the sweep would produce too many windows |
 * | `upstream_timeout` | the weather service did not answer in time |
 * | `upstream_rate_limited` | the weather service is throttling *us* |
 * | `body_too_large` | request body over the cap |
 * | `invalid_forecast_cache` | the attached corridor did not check out |
 *
 * Until the server ships them, `code` is absent and `friendlyError` falls back
 * to matching the English text of `error`, exactly as it did before. Nothing
 * changes for the user on the day one side lands without the other.
 */
export class ApiError extends Error {
  /** Stable machine code, once the server sends one. */
  readonly code: string | null;
  /** Seconds to wait, from `retry_after` or from the `Retry-After` header. */
  readonly retryAfter: number | null;

  constructor(message: string, code: string | null, retryAfter: number | null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function parseSeconds(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw.trim());
  return null;
}

// Extract the error from a non-OK response. The Retry-After delay still
// travels inside the message string as ", retry in Ns": the text path is the
// fallback while the server has no `code`, and the two must agree.
async function toError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const message =
    typeof body["error"] === "string" ? body["error"] : `Erreur serveur ${res.status}`;
  const code = typeof body["code"] === "string" ? body["code"] : null;
  const retryAfter =
    parseSeconds(body["retry_after"]) ??
    (res.status === 429 ? parseSeconds(res.headers.get("Retry-After")) : null);
  const withDelay = retryAfter !== null ? `${message}, retry in ${retryAfter}s` : message;
  return new ApiError(withDelay, code, retryAfter);
}

/**
 * Turn a failure into a sentence the reader can act on.
 *
 * Two paths, in this order:
 *
 * 1. the stable `code` of the error contract, when the server sent one;
 * 2. otherwise a match on the English text of `error`, which is what this
 *    function has always done. It stays as the fallback so nothing changes
 *    the day the server ships codes, or the day a deployment predating them
 *    answers.
 *
 * Both paths land on the same French sentences: the copy lives in
 * `ERROR_COPY`, keyed by code, and the regexes only pick a key.
 *
 * Unknown failures return their own text, so nothing becomes undebuggable.
 */
export function friendlyError(raw: string | Error): string {
  if (typeof raw === "string") return matchErrorText(raw);
  if (raw instanceof ApiError && raw.code !== null && raw.code in ERROR_COPY) {
    return ERROR_COPY[raw.code](raw.retryAfter);
  }
  if (raw instanceof ApiShapeError) return ERROR_COPY.invalid_response(null);
  return matchErrorText(raw.message);
}

/** French copy per stable code. `retryAfter` is only read by `rate_limited`. */
const ERROR_COPY: Record<string, (retryAfter: number | null) => string> = {
  // Cause la plus fréquente : date > today+15 (cap Open-Meteo). Mais peut
  // aussi survenir transitoirement quand un modèle de la chaîne tombe ;
  // d'où la formulation prudente. On rappelle l'horizon approximatif et on
  // demande explicitement de ne pas recharger la page (sinon la
  // planification en cours est perdue).
  forecast_horizon: () =>
    "Le service météo n'a pas pu couvrir cette période. Choisissez une date plus proche (jusqu'à environ 10 jours selon le modèle). Pour préserver votre planification, ne rechargez pas la page tant que vous n'avez pas ajusté la date.",
  too_few_waypoints: () =>
    "Placez au moins 2 waypoints sur la carte pour calculer une route.",
  waypoint_out_of_range: () =>
    "Un waypoint est hors des coordonnées valides. Replacez-le sur la carte.",
  too_many_waypoints: () =>
    "Trop de waypoints sur cette route. Retirez-en quelques-uns pour la simplifier.",
  // The server owns the delay: the window is configurable per environment,
  // so never hard-code one here. The previous copy promised "une minute"
  // against a 300 s window, so the user waited, retried, and got the exact
  // same error. When the delay is missing we stay vague rather than lie.
  rate_limited: (retryAfter) =>
    `Trop de calculs lancés coup sur coup. ${formatRetryDelay(retryAfter)}`,
  unknown_archetype: () =>
    "Type de bateau inconnu. Sélectionnez un archétype dans la liste.",
  invalid_datetime: () => "Date invalide. Vérifiez le format des champs date.",
  naive_datetime: () => "L'heure d'arrivée doit inclure le fuseau horaire.",
  sweep_too_large: () =>
    "Trop de créneaux à comparer. Réduisez la fenêtre ou augmentez le pas d'échantillonnage.",
  // Open-Meteo timed out (ReadTimeout / ConnectTimeout). Usually transient —
  // HF Spaces' shared egress is jittery and Open-Meteo occasionally pauses.
  upstream_timeout: () =>
    "Le service météo a mis trop de temps à répondre. Réessayez dans quelques instants.",
  // Open-Meteo throttling US, not the user throttling us. Deliberately worded
  // so nobody reads it as "you clicked too fast": the quota is counted per
  // egress IP and can be spent by an unrelated tenant of the same host, so
  // slowing down changes nothing. Distinct from `rate_limited` above, which
  // is our own limiter and IS about the caller's pace.
  upstream_rate_limited: () =>
    "Le service météo limite temporairement nos requêtes. Ce n'est pas lié à votre usage, réessayez dans quelques minutes.",
  body_too_large: () =>
    "La route est trop détaillée pour être envoyée. Retirez quelques waypoints ou raccourcissez la période.",
  invalid_forecast_cache: () =>
    "Les données météo préparées par le navigateur ont été refusées. Réessayez : le calcul repartira des données du serveur.",
  server_unavailable: () =>
    "Le serveur météo est indisponible. Réessayez dans quelques instants.",
  // Not a server code: a 200 whose body is not the contract (see parse.ts).
  invalid_response: () =>
    "Le serveur a renvoyé une réponse inattendue. Réessayez dans quelques instants.",
};

// Fallback path: recognise the English text the server sends today. Each rule
// only picks a key of ERROR_COPY, so the copy itself is never duplicated.
function matchErrorText(raw: string): string {
  if (/forecast horizon exceeded/i.test(raw)) {
    return ERROR_COPY.forecast_horizon(null);
  }
  if (/at least 2 waypoints/i.test(raw)) return ERROR_COPY.too_few_waypoints(null);
  if (/waypoint \d+: (lat|lon)=.* out of range/i.test(raw)) {
    return ERROR_COPY.waypoint_out_of_range(null);
  }
  if (/too many waypoints/i.test(raw)) return ERROR_COPY.too_many_waypoints(null);
  if (/rate limit exceeded/i.test(raw)) {
    // The delay suffix is appended by `toError` and is not adjacent to the
    // server's own wording ("rate limit exceeded, retry shortly"), so it is
    // matched separately rather than as an optional tail of the pattern above.
    const retryIn = /retry in (\d+)s/i.exec(raw);
    return ERROR_COPY.rate_limited(retryIn ? Number(retryIn[1]) : null);
  }
  if (/unknown archetype/i.test(raw)) return ERROR_COPY.unknown_archetype(null);
  if (/invalid (departure|latest_departure|target_eta|target_arrival)/i.test(raw)) {
    return ERROR_COPY.invalid_datetime(null);
  }
  if (/target_arrival must be timezone-aware/i.test(raw)) {
    return ERROR_COPY.naive_datetime(null);
  }
  if (/sweep would produce \d+ windows/i.test(raw)) return ERROR_COPY.sweep_too_large(null);
  if (/upstream weather service did not respond in time/i.test(raw)) {
    return ERROR_COPY.upstream_timeout(null);
  }
  if (/upstream weather service rate limit/i.test(raw)) {
    return ERROR_COPY.upstream_rate_limited(null);
  }
  if (/Erreur serveur 5\d\d/.test(raw) || /HTTP 5\d\d/.test(raw)) {
    return ERROR_COPY.server_unavailable(null);
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
  return parsePassageResponse(await res.json());
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
  return parseMultiWindowResponse(await res.json());
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
  return parsePassageByEtaResponse(await res.json());
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
    return parseArchetypes(await res.json());
  })();
  // A failure must not be remembered: the Space may simply have been cold, and
  // the next mount deserves a real attempt rather than the same rejection.
  promise.catch(() => archetypesInFlight.delete(url));
  archetypesInFlight.set(url, promise);
  return promise;
}
