// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Persisted ordering of the wind models the app fetches from Open-Meteo.
// The top `ACTIVE_LIMIT` models in the order are the ones actually fetched
// and shown as rows in the forecast table; the rest are kept in the catalog
// (visible in /config, greyed out) so the user can promote them later
// without losing their place.
//
// Only affects the web client. Server-side `plan_passage` still uses its own
// `model="auto"` chain.

import type { Key } from "../i18n";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";

const STORAGE_KEY = LOCAL_STORAGE_KEYS.modelConfig;

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
  resolutionKm: number;
  horizonHours: number;
  // Copy, not data: the three of them are dictionary keys, translated where
  // they are rendered (/config, the model tooltip). Everything else here is
  // model metadata and reads the same in every language.
  provider: Key;
  coverage: Key;
  description: Key;
  // Native time step used to mask the timeline cells in WindTable.
  nativeStepHours: number;
}

export const MODEL_META: Record<ModelName, ModelMeta> = {
  AROME: {
    label: "AROME HD",
    provider: "config.models.provider.meteoFrance",
    resolutionKm: 1.5,
    horizonHours: 51,
    coverage: "config.models.arome.coverage",
    description: "config.models.arome.description",
    nativeStepHours: 1,
  },
  ARPEGE_EU: {
    label: "ARPEGE EU",
    provider: "config.models.provider.meteoFrance",
    resolutionKm: 10,
    horizonHours: 96,
    coverage: "config.models.arpegeEu.coverage",
    description: "config.models.arpegeEu.description",
    nativeStepHours: 1,
  },
  ARPEGE_W: {
    label: "ARPEGE Monde",
    provider: "config.models.provider.meteoFrance",
    resolutionKm: 50,
    horizonHours: 102,
    coverage: "config.models.arpegeW.coverage",
    description: "config.models.arpegeW.description",
    nativeStepHours: 3,
  },
  ICON: {
    label: "ICON-EU",
    provider: "config.models.provider.dwd",
    resolutionKm: 7,
    horizonHours: 120,
    coverage: "config.models.icon.coverage",
    description: "config.models.icon.description",
    nativeStepHours: 3,
  },
  ICON_GLOBAL: {
    label: "ICON Global",
    provider: "config.models.provider.dwd",
    resolutionKm: 13,
    horizonHours: 180,
    coverage: "config.models.iconGlobal.coverage",
    description: "config.models.iconGlobal.description",
    nativeStepHours: 3,
  },
  ICON_D2: {
    label: "ICON D2",
    provider: "config.models.provider.dwd",
    resolutionKm: 2,
    horizonHours: 48,
    coverage: "config.models.iconD2.coverage",
    description: "config.models.iconD2.description",
    nativeStepHours: 1,
  },
  ECMWF: {
    label: "ECMWF",
    provider: "config.models.provider.ecmwf",
    resolutionKm: 25,
    horizonHours: 240,
    coverage: "config.models.ecmwf.coverage",
    description: "config.models.ecmwf.description",
    nativeStepHours: 6,
  },
  ECMWF_AIFS: {
    label: "ECMWF AIFS",
    provider: "config.models.provider.ecmwf",
    resolutionKm: 25,
    horizonHours: 240,
    coverage: "config.models.ecmwfAifs.coverage",
    description: "config.models.ecmwfAifs.description",
    nativeStepHours: 6,
  },
  GFS: {
    label: "GFS",
    provider: "config.models.provider.noaa",
    resolutionKm: 25,
    horizonHours: 384,
    coverage: "config.models.gfs.coverage",
    description: "config.models.gfs.description",
    nativeStepHours: 3,
  },
  UKMO: {
    label: "UKMO Global",
    provider: "config.models.provider.metOffice",
    resolutionKm: 10,
    horizonHours: 168,
    coverage: "config.models.ukmo.coverage",
    description: "config.models.ukmo.description",
    nativeStepHours: 1,
  },
  UKMO_UK: {
    label: "UKMO UK",
    provider: "config.models.provider.metOffice",
    resolutionKm: 2,
    horizonHours: 120,
    coverage: "config.models.ukmoUk.coverage",
    description: "config.models.ukmoUk.description",
    nativeStepHours: 1,
  },
  GEM: {
    label: "GEM",
    provider: "config.models.provider.envCanada",
    resolutionKm: 15,
    horizonHours: 240,
    coverage: "config.models.gem.coverage",
    description: "config.models.gem.description",
    nativeStepHours: 3,
  },
  DMI_HARMONIE: {
    label: "DMI Harmonie",
    provider: "config.models.provider.dmi",
    resolutionKm: 2,
    horizonHours: 60,
    coverage: "config.models.dmiHarmonie.coverage",
    description: "config.models.dmiHarmonie.description",
    nativeStepHours: 1,
  },
  METNO_NORDIC: {
    label: "METNO Nordic",
    provider: "config.models.provider.metNorway",
    resolutionKm: 1,
    horizonHours: 60,
    coverage: "config.models.metnoNordic.coverage",
    description: "config.models.metnoNordic.description",
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
