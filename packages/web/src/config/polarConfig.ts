// User-customized polar diagram, persisted in localStorage.
//
// Two sources, one active at a time:
// - "archetype": the user picks a bundled archetype, optionally selects a spi
//   profile and/or hand-tunes individual TWS/TWA cells;
// - "imported": a polar file uploaded by the user (see polarImport.ts)
//   replaces the archetype-derived matrix wholesale.
// The effective matrix is pushed to `plan_passage` whenever it deviates from
// the plain archetype default (see PlanPage's resolveOverrides). The
// performance coefficient never touches the matrix: it travels as the
// request's `efficiency` parameter.

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
  // Minimum sailable TWA (deg) — mirrors BoatPolar (Python). Below this angle
  // the boat is in the no-go zone; the server floors its VMG sweep here.
  min_upwind_twa_deg?: number;
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

// Performance coefficient applied at plan time (the server's `efficiency`
// parameter). 100% = a race crew sailing the polar; cruising realistically
// loses ~25% (sail trim, comfort margins, helm attention). The default
// matches the server-side plan_passage default so web and MCP plans agree.
export const COEFF_MIN = 0.5;
export const COEFF_MAX = 1.0;
export const COEFF_STEP = 0.01;
export const COEFF_DEFAULT = 0.75;

// Historical plan_passage default efficiency — what pre-v3 configs implicitly
// planned with when they didn't pin 1.0. Consumed by the v1/v2 migration so
// existing users keep their ETAs; fresh installs start at COEFF_DEFAULT.
export const SERVER_DEFAULT_EFFICIENCY = 0.75;

// User override bounds for the minimum upwind angle (deg TWA). Mirrors the
// MCP-side validation range on plan_passage.
export const MIN_UPWIND_MIN = 25;
export const MIN_UPWIND_MAX = 70;

// Wind ceiling for the spinnaker boost. Above this TWS the spi is doused and
// rows keep their bare polar speeds. Default 16 kn: a cruising chute typically
// comes down at 15-18 kn true, and 16 lands exactly on an archetype grid row
// so the default gating needs no interpolation.
export const SPI_MAX_TWS_DEFAULT = 16;
export const SPI_MAX_TWS_MIN = 8;
export const SPI_MAX_TWS_MAX = 30;

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
  // Performance coefficient sent to plan_passage as `efficiency`. 1.0 = race
  // trim (sail the polar), 0.75 = typical cruising. Applies to imported polars
  // too: a file built from real logged performance should sit at 1.0.
  coefficient: number;
  // Spinnaker selection: asymmetric (reaching) or symmetric (running). Applies
  // a per-TWA multiplier across the TWS rows at or under `spiMaxTwsKn`.
  // Overrides still win over the boost.
  spi: SpiKind;
  // Douse the spi above this TWS (kn): rows above it keep bare polar speeds.
  spiMaxTwsKn: number;
  // User override of the minimum upwind angle (deg TWA). undefined = auto:
  // the archetype's JSON value, or the first sailable angle of an imported
  // grid (leading all-zero columns skipped).
  minUpwindDeg?: number;
  // Sparse cell overrides keyed by `${twsIdx},${twaIdx}` -> absolute boat speed
  // in knots. Overrides win over the spi boost, so the user's hand-tune sticks
  // even when other toggles move.
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
}

interface PersistedConfig {
  v: 1 | 2 | 3;
  base: string;
  spi?: SpiKind | boolean;
  overrides: Record<string, number>;
  motorThresholdKn?: number;
  motorSpeedKn?: number;
  source?: PolarSource;
  imported?: ImportedPolar | null;
  // v1/v2 legacy fields — consumed by the migration, no longer written.
  scale?: number;
  applyEfficiency?: boolean;
  // v3 fields.
  coefficient?: number;
  spiMaxTwsKn?: number;
  minUpwindDeg?: number;
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

// Boost at an arbitrary TWA: piecewise-linear between the map's breakpoints,
// clamped to the edge values outside them. Archetype grids hit the breakpoints
// exactly (byte-identical to a direct map lookup); imported grids can carry
// 30° or 180° rows and interpolate/clamp instead of silently getting 1.
export function spiBoostAt(kind: SpiKind, twaDeg: number): number {
  const map = boostMap(kind);
  if (!map) return 1;
  const keys = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b);
  if (twaDeg <= keys[0]) return map[keys[0]];
  const last = keys[keys.length - 1];
  if (twaDeg >= last) return map[last];
  for (let i = 1; i < keys.length; i++) {
    if (keys[i] >= twaDeg) {
      const lo = keys[i - 1];
      const hi = keys[i];
      const f = (twaDeg - lo) / (hi - lo);
      return map[lo] + f * (map[hi] - map[lo]);
    }
  }
  return 1;
}

export function defaultPolarConfig(): PolarConfig {
  return {
    base: DEFAULT_BASE,
    coefficient: COEFF_DEFAULT,
    spi: "off",
    spiMaxTwsKn: SPI_MAX_TWS_DEFAULT,
    overrides: {},
    source: "archetype",
    imported: null,
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

function clampCoefficient(x: unknown): number {
  if (typeof x !== "number" || !Number.isFinite(x)) return COEFF_DEFAULT;
  return Math.min(COEFF_MAX, Math.max(COEFF_MIN, Math.round(x * 100) / 100));
}

function sanitizeMinUpwind(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (raw < MIN_UPWIND_MIN || raw > MIN_UPWIND_MAX) return undefined;
  return Math.round(raw);
}

function clampSpiMaxTws(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return SPI_MAX_TWS_DEFAULT;
  return Math.min(SPI_MAX_TWS_MAX, Math.max(SPI_MAX_TWS_MIN, Math.round(raw)));
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
    if (parsed.v !== 1 && parsed.v !== 2 && parsed.v !== 3) return defaultPolarConfig();
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
    // A source of "imported" without a valid imported polar would silently
    // plan on the archetype while the UI claims otherwise — snap back.
    const source: PolarSource =
      parsed.source === "imported" && imported !== null ? "imported" : "archetype";
    // v1/v2 → coefficient migration: those configs planned at the server
    // default (0.75), except imported polars explicitly flagged "real-world"
    // (applyEfficiency=false) which pinned 1.0 — preserve those ETAs. The old
    // `scale` slider is dropped, not folded: a structural hull multiplier and
    // a sail-trim coefficient are different concepts.
    const coefficient =
      parsed.v === 3
        ? clampCoefficient(parsed.coefficient)
        : parsed.applyEfficiency === false && source === "imported"
          ? 1.0
          : SERVER_DEFAULT_EFFICIENCY;
    return {
      base,
      coefficient,
      spi,
      spiMaxTwsKn: parsed.v === 3 ? clampSpiMaxTws(parsed.spiMaxTwsKn) : SPI_MAX_TWS_DEFAULT,
      minUpwindDeg: parsed.v === 3 ? sanitizeMinUpwind(parsed.minUpwindDeg) : undefined,
      overrides: sanitizeOverrides(parsed.overrides, BASE_POLARS[base]),
      motorThresholdKn: sanitizeMotorField(parsed.motorThresholdKn, MOTOR_THRESHOLD_MAX),
      motorSpeedKn: sanitizeMotorField(parsed.motorSpeedKn, MOTOR_SPEED_MAX),
      source,
      imported,
    };
  } catch {
    return defaultPolarConfig();
  }
}

export function savePolarConfig(cfg: PolarConfig): void {
  try {
    const payload: PersistedConfig = {
      v: 3,
      base: cfg.base,
      coefficient: cfg.coefficient,
      spi: cfg.spi,
      spiMaxTwsKn: cfg.spiMaxTwsKn,
      minUpwindDeg: cfg.minUpwindDeg,
      overrides: cfg.overrides,
      motorThresholdKn: cfg.motorThresholdKn,
      motorSpeedKn: cfg.motorSpeedKn,
      source: cfg.source,
      imported: cfg.imported,
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

// The `efficiency` sent to plan_passage. Always explicit since v3: the
// coefficient is a first-class basic setting, not a server-side default.
export function planEfficiency(cfg: PolarConfig): number {
  return cfg.coefficient;
}

// First TWA whose column carries any real speed — mirrors the server's
// effective_min_upwind_twa (archetypes.py) so client display and server
// calculation agree on where the no-go zone ends for a given grid.
export function derivedMinUpwind(grid: {
  twa_deg: number[];
  boat_speed_kn: number[][];
}): number {
  for (let j = 0; j < grid.twa_deg.length; j++) {
    if (grid.boat_speed_kn.some((row) => row[j] > 0.1)) return grid.twa_deg[j];
  }
  return grid.twa_deg[0];
}

// The minimum upwind angle in effect: user override, else imported-grid
// derivation, else the archetype's bundled value.
export function effectiveMinUpwind(cfg: PolarConfig, archetype?: string): number {
  if (cfg.minUpwindDeg !== undefined) return cfg.minUpwindDeg;
  if (isImportedActive(cfg)) return derivedMinUpwind(cfg.imported as ImportedPolar);
  const base = BASE_POLARS[archetype ?? cfg.base] ?? BASE_POLARS[DEFAULT_BASE];
  return base.min_upwind_twa_deg ?? derivedMinUpwind(base);
}

// Compute the effective polar payload. Imported source: the uploaded file
// wins wholesale — spi and overrides are archetype-editor concepts, an
// imported polar is presumed to already reflect the boat's sail inventory
// (the UI disables the spi controls while it is active). Archetype source:
// base × spi-boost (gated by the TWS ceiling), then overrides win, capped at
// 30 kn (the server's hard bound). Both branches carry the effective min
// upwind angle.
export function effectivePolar(cfg: PolarConfig, archetype?: string): PolarData {
  const motorActive =
    typeof cfg.motorThresholdKn === "number" && typeof cfg.motorSpeedKn === "number";
  const minUpwind = effectiveMinUpwind(cfg, archetype);
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
      motor_threshold_kn: motorActive ? cfg.motorThresholdKn : undefined,
      motor_speed_kn: motorActive ? cfg.motorSpeedKn : undefined,
      min_upwind_twa_deg: minUpwind,
    };
  }
  const base = BASE_POLARS[archetype ?? cfg.base] ?? BASE_POLARS[DEFAULT_BASE];
  const matrix = base.boat_speed_kn.map((row, twsIdx) =>
    row.map((v, twaIdx) => {
      const key = `${twsIdx},${twaIdx}`;
      if (key in cfg.overrides) return cfg.overrides[key];
      const spiMult =
        base.tws_kn[twsIdx] <= cfg.spiMaxTwsKn ? spiBoostAt(cfg.spi, base.twa_deg[twaIdx]) : 1;
      return Math.min(30, Math.round(v * spiMult * 10) / 10);
    }),
  );
  // Only propagate motor fields when BOTH are present — matches the backend
  // contract (`_apply_motor` ignores half-set configs) and keeps the payload
  // minimal when the user hasn't opted in.
  return {
    ...base,
    boat_speed_kn: matrix,
    motor_threshold_kn: motorActive ? cfg.motorThresholdKn : undefined,
    motor_speed_kn: motorActive ? cfg.motorSpeedKn : undefined,
    min_upwind_twa_deg: minUpwind,
  };
}

export function hasOverrides(cfg: PolarConfig): boolean {
  return Object.keys(cfg.overrides).length > 0;
}

// True when the polar deviates from the plain archetype default — a spi mode
// is selected, the upwind angle is pinned, a cell is hand-tuned, the motor is
// configured, or an imported file is active. Used to decide whether to push
// the custom matrix to the planner; when false, the server's bundled polar
// for the requested archetype suffices. While this is true, `cfg.base` is
// the boat of record app-wide: the customization was built against ITS grid,
// and the /plan selector displays it as the active boat — so /plan seeds its
// slug from it (see initialPlanBoat) instead of trusting a URL or cached
// slug left by an earlier session (#220). The coefficient is absent from the
// check: it travels as the `efficiency` request parameter and never requires
// pushing a matrix.
export function isPolarCustomized(cfg: PolarConfig): boolean {
  if (isImportedActive(cfg)) return true;
  const motorActive =
    typeof cfg.motorThresholdKn === "number" && typeof cfg.motorSpeedKn === "number";
  return (
    cfg.spi !== "off" || cfg.minUpwindDeg !== undefined || hasOverrides(cfg) || motorActive
  );
}

// The boat slug /plan starts on. A customized polar pins the boat to
// `cfg.base` (see isPolarCustomized); otherwise the usual precedence applies:
// the shared/bookmarked URL's boat first, then the last-simulation cache,
// then the /config default.
export function initialPlanBoat(
  cfg: PolarConfig,
  urlSlug?: string | null,
  cachedSlug?: string | null,
): string {
  if (isPolarCustomized(cfg)) return cfg.base;
  return urlSlug || cachedSlug || cfg.base;
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
  const commonKey = `c${cfg.coefficient}|${cfg.spi}@${cfg.spiMaxTwsKn}|mu${effectiveMinUpwind(cfg)}|${motorKey}`;
  if (isImportedActive(cfg)) {
    const imp = cfg.imported as ImportedPolar;
    return `imported:${imp.name}:${hashMatrix(imp)}|${commonKey}`;
  }
  const overrideKey = Object.keys(cfg.overrides)
    .sort()
    .map((k) => `${k}=${cfg.overrides[k]}`)
    .join(",");
  return `${cfg.base}|${overrideKey}|${commonKey}`;
}
