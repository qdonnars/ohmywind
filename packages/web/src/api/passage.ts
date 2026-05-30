import type { PassageResponse, PassageByEtaResponse, MultiWindowResponse, Archetype } from "../plan/types";
import type { ModelName } from "../config/modelConfig";
import type { PolarData } from "../config/polarConfig";

// Plan-time overrides driven by the user's /config preferences. Both are
// optional — when omitted, the server falls back to its bundled archetype
// polar and the hard-coded AUTO model chain. The shape mirrors what the
// HF Space's `_parse_polar` and `_translate_models` helpers expect.
export interface PlanOverrides {
  models?: ModelName[];
  polar?: PolarData;
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://qdonnars-openwind-mcp.hf.space";

// Translate known backend error messages to actionable French. Returns the
// original string if no rule matches, so unknown errors stay debuggable.
export function friendlyError(raw: string): string {
  if (/forecast horizon exceeded/i.test(raw)) {
    // Cause la plus fréquente : date > today+15 (cap Open-Meteo). Mais peut
    // aussi survenir transitoirement quand un modèle de la chaîne tombe ;
    // d'où la formulation prudente.
    return "Le service météo n'a pas pu couvrir cette période. Essayez une date plus proche, ou réessayez dans quelques instants.";
  }
  if (/at least 2 waypoints/i.test(raw)) {
    return "Placez au moins 2 waypoints sur la carte pour calculer une route.";
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
}): Promise<PassageResponse> {
  const body: Record<string, unknown> = {
    waypoints: params.waypoints,
    departure: params.departure,
    archetype: params.archetype,
    efficiency: params.efficiency ?? 0.75,
  };
  if (params.overrides?.models?.length) body["models"] = params.overrides.models;
  if (params.overrides?.polar) body["polar"] = params.overrides.polar;
  const res = await fetch(`${API_BASE}/api/v1/passage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(err["error"] ?? `Erreur serveur ${res.status}`);
  }
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

  const res = await fetch(`${API_BASE}/api/v1/passage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(err["error"] ?? `Erreur serveur ${res.status}`);
  }
  return res.json() as Promise<MultiWindowResponse>;
}

export async function fetchPassageByEta(params: {
  waypoints: [number, number][];
  targetArrival: string;
  archetype: string;
  efficiency?: number;
  overrides?: PlanOverrides;
}): Promise<PassageByEtaResponse> {
  const body: Record<string, unknown> = {
    waypoints: params.waypoints,
    target_arrival: params.targetArrival,
    archetype: params.archetype,
    efficiency: params.efficiency ?? 0.75,
  };
  if (params.overrides?.models?.length) body["models"] = params.overrides.models;
  if (params.overrides?.polar) body["polar"] = params.overrides.polar;

  const res = await fetch(`${API_BASE}/api/v1/passage-by-eta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(err["error"] ?? `Erreur serveur ${res.status}`);
  }
  return res.json() as Promise<PassageByEtaResponse>;
}

export async function fetchArchetypes(): Promise<Archetype[]> {
  const res = await fetch(`${API_BASE}/api/v1/archetypes`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Archetype[]>;
}
