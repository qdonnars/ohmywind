// User-customized polar diagram, persisted in localStorage.
//
// Two sources, one active at a time:
// - "archetype": the user picks a bundled archetype, optionally scales every
//   speed uniformly (size multiplier) and/or hand-tunes individual TWS/TWA
//   cells;
// - "imported": a polar file uploaded by the user (see polarImport.ts)
//   replaces the archetype-derived matrix wholesale.
// The effective matrix is pushed to `plan_passage` whenever it deviates from
// the plain archetype default (see PlanPage's resolveOverrides).

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
  // Optional motor configuration. When both are set, the planner switches
  // segments with sail speed under `motor_threshold_kn` to `motor_speed_kn`.
  // Matches BoatPolar (Python) — keep snake_case here so the payload sent
  // to `plan_passage` deserialises with no remapping in `_parse_polar`.
  motor_threshold_kn?: number;
  motor_speed_kn?: number;
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

export type PolarSource = "archetype" | "imported";

// A polar uploaded by the user, stored verbatim (already validated and
// transposed by polarImport.ts). `name` is the file name without extension,
// used as the display title of the diagram.
export interface ImportedPolar {
  name: string;
  tws_kn: number[];
  twa_deg: number[];
  // [tws_idx][twa_idx] -> boat speed in knots.
  boat_speed_kn: number[][];
}

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
  // Optional motor config. Both must be set together to take effect: when the
  // polar-derived boat speed falls under `motorThresholdKn`, the planner runs
  // the segment at `motorSpeedKn` instead. Either one alone is treated as
  // "no motor" so a half-filled form never silently changes simulations.
  motorThresholdKn?: number;
  motorSpeedKn?: number;
  // Which polar feeds the planner. "imported" is only effective while
  // `imported` is non-null; the archetype editor state is kept alongside so
  // the user can flip back without losing their hand-tuning.
  source: PolarSource;
  imported: ImportedPolar | null;
  // The "coefficient de plaisance": whether plan_passage should still apply
  // its cruising efficiency coefficient (SERVER_DEFAULT_EFFICIENCY) on top of
  // an imported polar. Designer polars are theoretical → keep it (true);
  // polars reflecting real-world logged performance → skip it (false, the
  // plan request then pins efficiency to 1.0). Only consulted while the
  // imported polar is active.
  applyEfficiency: boolean;
}

interface PersistedConfig {
  v: 1 | 2;
  base: string;
  scale: number;
  spi?: SpiKind | boolean;
  overrides: Record<string, number>;
  motorThresholdKn?: number;
  motorSpeedKn?: number;
  // v2 fields — absent in payloads written before the polar-import feature.
  source?: PolarSource;
  imported?: ImportedPolar | null;
  applyEfficiency?: boolean;
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
  return {
    base: DEFAULT_BASE,
    scale: SCALE_DEFAULT,
    spi: "off",
    overrides: {},
    source: "archetype",
    imported: null,
    applyEfficiency: true,
  };
}

// Motor speed sanity bounds — keep generous enough for a fast trawler-style
// auxiliary (8 kn) without admitting absurd values typed by accident.
const MOTOR_SPEED_MAX = 12;
const MOTOR_THRESHOLD_MAX = 10;

function sanitizeMotorField(raw: unknown, maxKn: number): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (raw <= 0 || raw > maxKn) return undefined;
  return Math.round(raw * 10) / 10;
}

function isValidBase(x: unknown): x is string {
  return typeof x === "string" && x in BASE_POLARS;
}

// Re-validate a persisted imported polar. localStorage can be edited by hand
// or corrupted; the rules mirror the server's `_parse_polar` (ascending grids,
// matrix dims matching, speeds in [0, 30]) so a config that loads is a config
// that plans.
function sanitizeImported(raw: unknown): ImportedPolar | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name.length === 0 || o.name.length > 120) return null;
  const tws = o.tws_kn;
  const twa = o.twa_deg;
  const matrix = o.boat_speed_kn;
  if (!Array.isArray(tws) || !Array.isArray(twa) || !Array.isArray(matrix)) return null;
  if (tws.length < 2 || twa.length < 2) return null;
  const ascending = (xs: unknown[]): xs is number[] =>
    xs.every(
      (v, i) =>
        typeof v === "number" && Number.isFinite(v) && (i === 0 || v > (xs[i - 1] as number)),
    );
  if (!ascending(tws) || !ascending(twa)) return null;
  if (twa[0] < 0 || twa[twa.length - 1] > 180) return null;
  if (matrix.length !== tws.length) return null;
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== twa.length) return null;
    for (const v of row) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 30) return null;
    }
  }
  return {
    name: o.name,
    tws_kn: tws,
    twa_deg: twa,
    boat_speed_kn: matrix as number[][],
  };
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
    // v1 payloads (pre polar-import) load fine: the v2 fields just fall back
    // to their defaults below.
    if (parsed.v !== 1 && parsed.v !== 2) return defaultPolarConfig();
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
    const imported = sanitizeImported(parsed.imported);
    return {
      base,
      scale: clampScale(typeof parsed.scale === "number" ? parsed.scale : SCALE_DEFAULT),
      spi,
      overrides: sanitizeOverrides(parsed.overrides, BASE_POLARS[base]),
      motorThresholdKn: sanitizeMotorField(parsed.motorThresholdKn, MOTOR_THRESHOLD_MAX),
      motorSpeedKn: sanitizeMotorField(parsed.motorSpeedKn, MOTOR_SPEED_MAX),
      // A source of "imported" without a valid imported polar would silently
      // plan on the archetype while the UI claims otherwise — snap back.
      source: parsed.source === "imported" && imported !== null ? "imported" : "archetype",
      imported,
      applyEfficiency: parsed.applyEfficiency !== false,
    };
  } catch {
    return defaultPolarConfig();
  }
}

export function savePolarConfig(cfg: PolarConfig): void {
  try {
    const payload: PersistedConfig = {
      v: 2,
      base: cfg.base,
      scale: cfg.scale,
      spi: cfg.spi,
      overrides: cfg.overrides,
      motorThresholdKn: cfg.motorThresholdKn,
      motorSpeedKn: cfg.motorSpeedKn,
      source: cfg.source,
      imported: cfg.imported,
      applyEfficiency: cfg.applyEfficiency,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage unavailable / full — silent miss; next load returns default.
  }
}

// True when planning runs on the uploaded polar file rather than the
// archetype editor. Both conditions: a bare `source: "imported"` left behind
// after the file was deleted must not change anything.
export function isImportedActive(cfg: PolarConfig): boolean {
  return cfg.source === "imported" && cfg.imported !== null;
}

// The `efficiency` to send to plan_passage, or undefined to let the server
// default (SERVER_DEFAULT_EFFICIENCY) apply. Pinning 1.0 only makes sense for
// an imported polar the user declared as already reflecting real-world
// performance — the archetype polars are theoretical by construction.
export function planEfficiency(cfg: PolarConfig): number | undefined {
  if (isImportedActive(cfg) && !cfg.applyEfficiency) return 1.0;
  return undefined;
}

// Compute the effective polar matrix. Imported source: the uploaded file wins
// wholesale (scale / spi / overrides are archetype-editor concepts and do not
// apply); motor config still does, being rig-independent. Archetype source:
// base × scale × spi-boost, then overrides win.
export function effectivePolar(cfg: PolarConfig): PolarData {
  const motorActiveImported =
    typeof cfg.motorThresholdKn === "number" && typeof cfg.motorSpeedKn === "number";
  if (isImportedActive(cfg)) {
    const imp = cfg.imported as ImportedPolar;
    return {
      name: imp.name,
      length_ft: 0,
      type: "imported",
      category: "imported",
      examples: [],
      performance_class: "custom",
      tws_kn: imp.tws_kn,
      twa_deg: imp.twa_deg,
      boat_speed_kn: imp.boat_speed_kn,
      motor_threshold_kn: motorActiveImported ? cfg.motorThresholdKn : undefined,
      motor_speed_kn: motorActiveImported ? cfg.motorSpeedKn : undefined,
    };
  }
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
  // Only propagate motor fields when BOTH are present — matches the backend
  // contract (`_apply_motor` ignores half-set configs) and keeps the payload
  // minimal when the user hasn't opted in.
  const motorActive =
    typeof cfg.motorThresholdKn === "number" && typeof cfg.motorSpeedKn === "number";
  return {
    ...base,
    boat_speed_kn: matrix,
    motor_threshold_kn: motorActive ? cfg.motorThresholdKn : undefined,
    motor_speed_kn: motorActive ? cfg.motorSpeedKn : undefined,
  };
}

export function hasOverrides(cfg: PolarConfig): boolean {
  return Object.keys(cfg.overrides).length > 0;
}

// True when the polar deviates from the default for `archetype` — i.e. the
// editor's base differs, the scale is non-neutral, a spi mode is selected, or
// any cell has been hand-tuned. Used to decide whether to push the custom
// matrix to the planner; when false, the server's bundled polar suffices.
export function isPolarCustomized(cfg: PolarConfig, archetype: string): boolean {
  if (isImportedActive(cfg)) return true;
  const motorActive =
    typeof cfg.motorThresholdKn === "number" && typeof cfg.motorSpeedKn === "number";
  return (
    cfg.base !== archetype ||
    cfg.scale !== SCALE_DEFAULT ||
    cfg.spi !== "off" ||
    hasOverrides(cfg) ||
    motorActive
  );
}

// Cheap content hash (djb2) so two different files with the same name and
// dimensions still produce distinct fingerprints.
function hashMatrix(imp: ImportedPolar): string {
  const s = JSON.stringify([imp.tws_kn, imp.twa_deg, imp.boat_speed_kn]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// Compact key capturing every input that affects effectivePolar() and the
// plan-time efficiency. Used to invalidate the lastSimulation cache so a
// /config tweak doesn't leave stale results on /plan.
export function polarFingerprint(cfg: PolarConfig): string {
  const motorKey = `${cfg.motorThresholdKn ?? ""}/${cfg.motorSpeedKn ?? ""}`;
  if (isImportedActive(cfg)) {
    const imp = cfg.imported as ImportedPolar;
    const effKey = cfg.applyEfficiency ? "eff" : "raw";
    return `imported:${imp.name}:${hashMatrix(imp)}|${effKey}|${motorKey}`;
  }
  const overrideKey = Object.keys(cfg.overrides)
    .sort()
    .map((k) => `${k}=${cfg.overrides[k]}`)
    .join(",");
  return `${cfg.base}|${cfg.scale}|${cfg.spi}|${overrideKey}|${motorKey}`;
}
