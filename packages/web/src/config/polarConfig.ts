// User-customized polar diagram, persisted in localStorage.
//
// V1 scope: the user picks a base archetype (one of the bundled JSON polars),
// optionally scales every speed uniformly (size multiplier) and/or hand-tunes
// individual TWS/TWA cells. This config is NOT yet sent to the MCP server's
// `plan_passage` — a future sprint will extend the contract to accept a
// custom polar payload. For now the editor is local-only.

import catamaran40ft from "../data/polars/catamaran_40ft.json";
import cruiser20ft from "../data/polars/cruiser_20ft.json";
import cruiser25ft from "../data/polars/cruiser_25ft.json";
import cruiser30ft from "../data/polars/cruiser_30ft.json";
import cruiser40ft from "../data/polars/cruiser_40ft.json";
import cruiser50ft from "../data/polars/cruiser_50ft.json";
import racerCruiser from "../data/polars/racer_cruiser.json";

const STORAGE_KEY = "ow_polar_config_v1";

export interface PolarData {
  name: string;
  length_ft: number;
  type: string;
  category: string;
  examples: string[];
  performance_class: string;
  tws_kn: number[];
  twa_deg: number[];
  // [tws_idx][twa_idx] -> boat speed in knots.
  boat_speed_kn: number[][];
}

// Strong-typed re-exports of the bundled archetype polars. Imports go through
// a `as PolarData` cast because Vite types JSON as `Record<string, unknown>`.
export const BASE_POLARS: Readonly<Record<string, PolarData>> = {
  cruiser_20ft: cruiser20ft as PolarData,
  cruiser_25ft: cruiser25ft as PolarData,
  cruiser_30ft: cruiser30ft as PolarData,
  cruiser_40ft: cruiser40ft as PolarData,
  cruiser_50ft: cruiser50ft as PolarData,
  racer_cruiser: racerCruiser as PolarData,
  catamaran_40ft: catamaran40ft as PolarData,
};

export const ARCHETYPE_LABELS: Readonly<Record<string, string>> = {
  cruiser_20ft: "Croiseur 20 pieds",
  cruiser_25ft: "Croiseur 25 pieds",
  cruiser_30ft: "Croiseur 30 pieds",
  cruiser_40ft: "Croiseur 40 pieds",
  cruiser_50ft: "Croiseur 50 pieds",
  racer_cruiser: "Racer-cruiser",
  catamaran_40ft: "Catamaran 40 pieds",
};

export const DEFAULT_BASE = "cruiser_30ft";

// Range of the uniform scale slider. 0.5 - 1.5 covers the realistic envelope
// (heavy/light load, well/badly trimmed) without producing absurd values.
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 1.5;
export const SCALE_STEP = 0.01;

// Default multiplier — neutral (1.0) because the multiplier represents a
// structural delta vs the chosen archetype ("is my boat faster/slower than
// the reference cruiser 30ft?"), NOT the day-of efficiency (which the server
// applies separately via plan_passage's `efficiency` arg, default 0.75 in
// cruising). Two concepts, two knobs; keep them decoupled.
export const SCALE_DEFAULT = 1;

// Plan_passage default efficiency (kept in sync with the server / CLAUDE.md).
// Surfaced here purely to display a UI banner reminding the user that this
// coefficient is applied at plan time, on top of the polar they edit here.
export const SERVER_DEFAULT_EFFICIENCY = 0.75;

export type SpiKind = "off" | "asymmetric" | "symmetric";

export interface PolarConfig {
  // Archetype the user started from. Determines the (tws_kn, twa_deg) grid.
  base: string;
  // Uniform multiplier applied to every cell of the base polar.
  scale: number;
  // Spinnaker selection: asymmetric (reaching) or symmetric (running). Applies
  // a per-TWA multiplier on top of `scale` across all TWS curves. Overrides
  // still win over the boost.
  spi: SpiKind;
  // Sparse cell overrides keyed by `${twsIdx},${twaIdx}` -> absolute boat speed
  // in knots. Overrides win over scale + spi, so the user's hand-tune sticks
  // even when other sliders/toggles move.
  overrides: Record<string, number>;
}

interface PersistedConfig {
  v: 1;
  base: string;
  scale: number;
  spi?: SpiKind | boolean;
  overrides: Record<string, number>;
}

// Per-TWA multipliers. Values derived from sailmaker performance ranges
// (North Sails, Yachting World, sail forums): asymmetric peaks on the reach
// 110-135 deg and stays usable up to 150 deg by heating up; symmetric is
// dead at beam reach but excels at broad reach + run (135-165 deg).
export const ASYMMETRIC_BOOST_BY_TWA: Readonly<Record<number, number>> = {
  40: 1.0,
  50: 1.0,
  60: 1.0,
  75: 1.0,
  90: 1.1,
  110: 1.2,
  135: 1.2,
  150: 1.1,
  165: 1.05,
};

export const SYMMETRIC_BOOST_BY_TWA: Readonly<Record<number, number>> = {
  40: 1.0,
  50: 1.0,
  60: 1.0,
  75: 1.0,
  90: 1.0,
  110: 1.1,
  135: 1.2,
  150: 1.25,
  165: 1.22,
};

function boostMap(kind: SpiKind): Readonly<Record<number, number>> | null {
  if (kind === "asymmetric") return ASYMMETRIC_BOOST_BY_TWA;
  if (kind === "symmetric") return SYMMETRIC_BOOST_BY_TWA;
  return null;
}

export function defaultPolarConfig(): PolarConfig {
  return { base: DEFAULT_BASE, scale: SCALE_DEFAULT, spi: "off", overrides: {} };
}

function isValidBase(x: unknown): x is string {
  return typeof x === "string" && x in BASE_POLARS;
}

function clampScale(x: number): number {
  if (Number.isNaN(x)) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, x));
}

function sanitizeOverrides(raw: unknown, base: PolarData): Record<string, number> {
  if (raw == null || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  const twsLen = base.tws_kn.length;
  const twaLen = base.twa_deg.length;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val !== "number" || !Number.isFinite(val)) continue;
    const parts = key.split(",");
    if (parts.length !== 2) continue;
    const twsIdx = Number(parts[0]);
    const twaIdx = Number(parts[1]);
    if (!Number.isInteger(twsIdx) || !Number.isInteger(twaIdx)) continue;
    if (twsIdx < 0 || twsIdx >= twsLen) continue;
    if (twaIdx < 0 || twaIdx >= twaLen) continue;
    // Clamp speeds into a defensible range; 30 kn upper bound is generous
    // even for a fast catamaran in 25 kn of breeze.
    if (val < 0 || val > 30) continue;
    out[`${twsIdx},${twaIdx}`] = Math.round(val * 10) / 10;
  }
  return out;
}

export function loadPolarConfig(): PolarConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPolarConfig();
    const parsed = JSON.parse(raw) as PersistedConfig;
    if (parsed.v !== 1) return defaultPolarConfig();
    const base = isValidBase(parsed.base) ? parsed.base : DEFAULT_BASE;
    // Tolerate legacy boolean `spi` from earlier dev builds: `true` maps to
    // the asymmetric profile (closest match to the original single-mode
    // boost shape), `false` to off.
    let spi: SpiKind;
    if (parsed.spi === "asymmetric" || parsed.spi === "symmetric" || parsed.spi === "off") {
      spi = parsed.spi;
    } else if (parsed.spi === true) {
      spi = "asymmetric";
    } else {
      spi = "off";
    }
    return {
      base,
      scale: clampScale(typeof parsed.scale === "number" ? parsed.scale : SCALE_DEFAULT),
      spi,
      overrides: sanitizeOverrides(parsed.overrides, BASE_POLARS[base]),
    };
  } catch {
    return defaultPolarConfig();
  }
}

export function savePolarConfig(cfg: PolarConfig): void {
  try {
    const payload: PersistedConfig = {
      v: 1,
      base: cfg.base,
      scale: cfg.scale,
      spi: cfg.spi,
      overrides: cfg.overrides,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage unavailable / full — silent miss; next load returns default.
  }
}

// Compute the effective polar matrix: base × scale × spi-boost, then overrides win.
export function effectivePolar(cfg: PolarConfig): PolarData {
  const base = BASE_POLARS[cfg.base] ?? BASE_POLARS[DEFAULT_BASE];
  const boost = boostMap(cfg.spi);
  const matrix = base.boat_speed_kn.map((row, twsIdx) =>
    row.map((v, twaIdx) => {
      const key = `${twsIdx},${twaIdx}`;
      if (key in cfg.overrides) return cfg.overrides[key];
      const twa = base.twa_deg[twaIdx];
      const spiMult = boost ? boost[twa] ?? 1 : 1;
      return Math.round(v * cfg.scale * spiMult * 10) / 10;
    }),
  );
  return { ...base, boat_speed_kn: matrix };
}

export function hasOverrides(cfg: PolarConfig): boolean {
  return Object.keys(cfg.overrides).length > 0;
}

// True when the polar deviates from the default for `archetype` — i.e. the
// editor's base differs, the scale is non-neutral, a spi mode is selected, or
// any cell has been hand-tuned. Used to decide whether to push the custom
// matrix to the planner; when false, the server's bundled polar suffices.
export function isPolarCustomized(cfg: PolarConfig, archetype: string): boolean {
  return (
    cfg.base !== archetype ||
    cfg.scale !== SCALE_DEFAULT ||
    cfg.spi !== "off" ||
    hasOverrides(cfg)
  );
}

// Compact key capturing every input that affects effectivePolar(). Used to
// invalidate the lastSimulation cache so a /config tweak doesn't leave stale
// results on /plan.
export function polarFingerprint(cfg: PolarConfig): string {
  const overrideKey = Object.keys(cfg.overrides)
    .sort()
    .map((k) => `${k}=${cfg.overrides[k]}`)
    .join(",");
  return `${cfg.base}|${cfg.scale}|${cfg.spi}|${overrideKey}`;
}
