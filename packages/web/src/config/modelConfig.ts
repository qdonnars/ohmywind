// Persisted ordering of the wind models the app fetches from Open-Meteo.
// The top `ACTIVE_LIMIT` models in the order are the ones actually fetched
// and shown as rows in the forecast table; the rest are kept in the catalog
// (visible in /config, greyed out) so the user can promote them later
// without losing their place.
//
// Only affects the web client. Server-side `plan_passage` still uses its own
// `model="auto"` chain.

const STORAGE_KEY = "ow_model_config_v1";

export const ACTIVE_LIMIT = 4;

export type ModelName =
  | "AROME"
  | "ARPEGE_EU"
  | "ARPEGE_W"
  | "ICON"
  | "ICON_GLOBAL"
  | "ICON_D2"
  | "ECMWF"
  | "ECMWF_AIFS"
  | "GFS"
  | "UKMO"
  | "UKMO_UK"
  | "GEM"
  | "DMI_HARMONIE"
  | "METNO_NORDIC";

export const ALL_MODELS: readonly ModelName[] = [
  "AROME",
  "ARPEGE_EU",
  "ARPEGE_W",
  "ICON",
  "ICON_GLOBAL",
  "ICON_D2",
  "ECMWF",
  "ECMWF_AIFS",
  "GFS",
  "UKMO",
  "UKMO_UK",
  "GEM",
  "DMI_HARMONIE",
  "METNO_NORDIC",
];

// Default ranking — the four historical models stay active out of the box so
// existing users see no change, the rest appended (greyed) for opt-in promotion.
export const DEFAULT_ORDER: readonly ModelName[] = [
  "AROME",
  "ICON",
  "ECMWF",
  "GFS",
  "ARPEGE_EU",
  "ARPEGE_W",
  "ICON_GLOBAL",
  "ICON_D2",
  "ECMWF_AIFS",
  "UKMO",
  "UKMO_UK",
  "GEM",
  "DMI_HARMONIE",
  "METNO_NORDIC",
];

export interface ModelConfig {
  order: ModelName[];
}

interface PersistedConfig {
  v: 1;
  order: string[];
}

export interface ModelMeta {
  label: string;
  provider: string;
  resolutionKm: number;
  horizonHours: number;
  coverage: string;
  description: string;
  // Native time step used to mask the timeline cells in WindTable.
  nativeStepHours: number;
}

export const MODEL_META: Record<ModelName, ModelMeta> = {
  AROME: {
    label: "AROME HD",
    provider: "Météo-France",
    resolutionKm: 1.5,
    horizonHours: 51,
    coverage: "France",
    description: "Haute résolution Météo-France, capte les effets thermiques et l'abri côtier.",
    nativeStepHours: 1,
  },
  ARPEGE_EU: {
    label: "ARPEGE EU",
    provider: "Météo-France",
    resolutionKm: 10,
    horizonHours: 96,
    coverage: "Europe",
    description: "Modèle français moyenne échéance, prolonge AROME.",
    nativeStepHours: 1,
  },
  ARPEGE_W: {
    label: "ARPEGE Monde",
    provider: "Météo-France",
    resolutionKm: 50,
    horizonHours: 102,
    coverage: "Global",
    description: "Pilote global de Météo-France, basse résolution.",
    nativeStepHours: 3,
  },
  ICON: {
    label: "ICON-EU",
    provider: "DWD (Allemagne)",
    resolutionKm: 7,
    horizonHours: 120,
    coverage: "Europe",
    description: "Modèle régional européen, bon compromis portée / précision.",
    nativeStepHours: 3,
  },
  ICON_GLOBAL: {
    label: "ICON Global",
    provider: "DWD (Allemagne)",
    resolutionKm: 13,
    horizonHours: 180,
    coverage: "Global",
    description: "Version globale d'ICON, portée étendue.",
    nativeStepHours: 3,
  },
  ICON_D2: {
    label: "ICON D2",
    provider: "DWD (Allemagne)",
    resolutionKm: 2,
    horizonHours: 48,
    coverage: "Allemagne + frontières",
    description: "Très haute résolution DWD, marges utiles sur l'est français.",
    nativeStepHours: 1,
  },
  ECMWF: {
    label: "ECMWF",
    provider: "Centre européen",
    resolutionKm: 25,
    horizonHours: 240,
    coverage: "Global",
    description: "Référence à moyenne échéance, résolution plus grossière.",
    nativeStepHours: 6,
  },
  ECMWF_AIFS: {
    label: "ECMWF AIFS",
    provider: "Centre européen",
    resolutionKm: 25,
    horizonHours: 240,
    coverage: "Global (IA)",
    description: "Modèle IA d'ECMWF, performances proches de l'IFS.",
    nativeStepHours: 6,
  },
  GFS: {
    label: "GFS",
    provider: "NOAA (États-Unis)",
    resolutionKm: 25,
    horizonHours: 384,
    coverage: "Global",
    description: "Très longue portée, rafales peu fiables en faible vent.",
    nativeStepHours: 3,
  },
  UKMO: {
    label: "UKMO Global",
    provider: "Met Office (UK)",
    resolutionKm: 10,
    horizonHours: 168,
    coverage: "Global",
    description: "Modèle global du Met Office, bon sur l'Atlantique nord.",
    nativeStepHours: 1,
  },
  UKMO_UK: {
    label: "UKMO UK",
    provider: "Met Office (UK)",
    resolutionKm: 2,
    horizonHours: 120,
    coverage: "Îles Britanniques + Manche",
    description: "Haute résolution UK, utile sur la Manche occidentale.",
    nativeStepHours: 1,
  },
  GEM: {
    label: "GEM",
    provider: "Env. Canada",
    resolutionKm: 15,
    horizonHours: 240,
    coverage: "Global",
    description: "Modèle global canadien, complément utile.",
    nativeStepHours: 3,
  },
  DMI_HARMONIE: {
    label: "DMI Harmonie",
    provider: "DMI (Danemark)",
    resolutionKm: 2,
    horizonHours: 60,
    coverage: "Europe du Nord + Manche",
    description: "Haute résolution scandinave, utile en Manche et Mer du Nord.",
    nativeStepHours: 1,
  },
  METNO_NORDIC: {
    label: "METNO Nordic",
    provider: "MET Norway",
    resolutionKm: 1,
    horizonHours: 60,
    coverage: "Scandinavie + Mer du Nord",
    description: "Modèle norvégien très haute résolution sur la Mer du Nord.",
    nativeStepHours: 1,
  },
};

function isModelName(x: unknown): x is ModelName {
  return typeof x === "string" && (ALL_MODELS as readonly string[]).includes(x);
}

function normalize(order: ModelName[]): ModelConfig {
  // Dedupe while preserving order, then append any missing models so the
  // config always contains every known model (new models added later show up
  // at the end, greyed out, until the user promotes them).
  const seen = new Set<ModelName>();
  const deduped: ModelName[] = [];
  for (const m of order) {
    if (isModelName(m) && !seen.has(m)) {
      deduped.push(m);
      seen.add(m);
    }
  }
  for (const m of ALL_MODELS) {
    if (!seen.has(m)) deduped.push(m);
  }
  return { order: deduped };
}

export function defaultConfig(): ModelConfig {
  return normalize([...DEFAULT_ORDER]);
}

export function loadModelConfig(): ModelConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw) as PersistedConfig;
    if (parsed.v !== 1) return defaultConfig();
    const order = (parsed.order ?? []).filter(isModelName);
    return normalize(order);
  } catch {
    return defaultConfig();
  }
}

export function saveModelConfig(cfg: ModelConfig): void {
  try {
    const payload: PersistedConfig = { v: 1, order: cfg.order };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage unavailable / full — fail silently; next load returns default.
  }
}

export function activeModels(cfg: ModelConfig): ModelName[] {
  return cfg.order.slice(0, ACTIVE_LIMIT);
}
