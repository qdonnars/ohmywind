// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The edits a reader can make to their boat, as pure steps from one
 * `PolarConfig` to the next, plus the one way they are stored.
 *
 * The Bateau views of the settings (`settings/views/Boat*View`) share them.
 * Each rule lives here once: what a motor value becomes once typed, what
 * picking another boat clears, how a file is read, how far a hand-tuned
 * point may go.
 */

import { t } from "../i18n";
import {
  MIN_UPWIND_MAX,
  MIN_UPWIND_MIN,
  MOTOR_MAX_KN,
  MOTOR_SPEED_MIN_KN,
  SPI_MAX_TWS_MAX,
  SPI_MAX_TWS_MIN,
  effectiveMinUpwind,
  savePolarConfig,
  type PolarConfig,
} from "./polarConfig";
import { parsePolarFile, PolarImportError } from "./polarImport";

/**
 * Stores an edit made in a boat editor. Any touch there re-selects the perso
 * polar on /plan (its selector may have parked it in favour of a stock
 * archetype), so the stored config always carries `persoActive: true`.
 * Returns what was stored.
 */
export function saveBoatEdit(next: PolarConfig): PolarConfig {
  const activated = { ...next, persoActive: true };
  savePolarConfig(activated);
  return activated;
}

/**
 * Another boat. The hand-tuned points are cleared: they are keyed by grid
 * index (twsIdx, twaIdx) and another archetype may have another grid. The
 * coefficient and the spinnaker do not depend on the boat and are kept.
 * Null when the boat is the one already chosen.
 */
export function withBase(cfg: PolarConfig, base: string): PolarConfig | null {
  if (base === cfg.base) return null;
  return { ...cfg, base, overrides: {} };
}

export type MotorField = "motorThresholdKn" | "motorSpeedKn";

/**
 * What a motor field holds once its text is read: empty clears it, a value
 * past `MOTOR_MAX_KN` is brought back to it (and `clamped` says so, for the
 * editor to explain), the rest is rounded to a tenth, the motor speed never
 * under `MOTOR_SPEED_MIN_KN` (the API ignores a slower engine). Null when the
 * text is not a positive number: the config stays as it was.
 */
export function withMotorField(
  cfg: PolarConfig,
  field: MotorField,
  raw: string,
): { next: PolarConfig; clamped: boolean } | null {
  const val = raw.trim();
  if (val === "") return { next: { ...cfg, [field]: undefined }, clamped: false };
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num > MOTOR_MAX_KN) return { next: { ...cfg, [field]: MOTOR_MAX_KN }, clamped: true };
  const rounded = Math.round(num * 10) / 10;
  const floor = field === "motorSpeedKn" ? MOTOR_SPEED_MIN_KN : 0;
  return { next: { ...cfg, [field]: Math.max(floor, rounded) }, clamped: false };
}

/**
 * The two motor mistakes worth a word. `halfSet`: one field filled, the
 * other empty, which the planner treats as no motor at all. `inverted`: a
 * threshold above the motor speed, so between the two the engine would slow
 * the boat down (the simulation still applies it as configured).
 */
export function motorWarnings(cfg: PolarConfig): { halfSet: boolean; inverted: boolean } {
  const threshold = cfg.motorThresholdKn;
  const speed = cfg.motorSpeedKn;
  return {
    halfSet: (typeof threshold === "number") !== (typeof speed === "number"),
    inverted: typeof threshold === "number" && typeof speed === "number" && threshold > speed,
  };
}

/** A real polar file weighs a few kB: past this size it is the wrong file,
    refused before it is read. */
const IMPORT_MAX_BYTES = 512 * 1024;

export interface ImportNotice {
  kind: "ok" | "error";
  text: string;
}

/**
 * Reads a polar file. A fresh file is trusted as it is: no spinnaker over
 * it, and the upwind angle derived again from its grid (a pin made for the
 * previous file no longer applies). `next` is absent when the file was
 * refused; the notice says why, or what was read.
 */
export async function importPolarFile(
  cfg: PolarConfig,
  file: File,
): Promise<{ next?: PolarConfig; notice: ImportNotice }> {
  if (file.size > IMPORT_MAX_BYTES) {
    return { notice: { kind: "error", text: t("config.polarImport.tooLarge") } };
  }
  try {
    const parsed = parsePolarFile(await file.text());
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || t("config.polarImport.defaultName");
    const next: PolarConfig = {
      ...cfg,
      imported: {
        name,
        tws_kn: parsed.tws_kn,
        twa_deg: parsed.twa_deg,
        boat_speed_kn: parsed.boat_speed_kn,
      },
      source: "imported",
      spi: "off",
      minUpwindDeg: undefined,
    };
    const done = t("config.polarImport.ok", {
      name,
      tws: parsed.tws_kn.length,
      twa: parsed.twa_deg.length,
    });
    // The parser's warnings are whole sentences of their own, already
    // translated: they follow the confirmation, they are not woven into it.
    const suffix = parsed.warnings.length > 0 ? ` ${parsed.warnings.join(" ")}` : "";
    return { next, notice: { kind: "ok", text: `${done}${suffix}` } };
  } catch (e) {
    return {
      notice: {
        kind: "error",
        text: e instanceof PolarImportError ? e.message : t("config.polarImport.unreadable"),
      },
    };
  }
}

/** The imported file dropped: back on the archetype. */
export function withoutImported(cfg: PolarConfig): PolarConfig {
  return { ...cfg, imported: null, source: "archetype" };
}

/** Highest boat speed a hand-tuned point may take, the system-wide ceiling
    (imported polars and the server's `_parse_polar` stop there too). */
const OVERRIDE_MAX_KN = 30;

/** One step of the keyboard on a point of the editable diagram. */
export const TUNE_STEP_KN = 0.1;

/** A point of the polar set by hand, rounded to a tenth of a knot and kept
    between zero and the ceiling. */
export function withOverride(
  cfg: PolarConfig,
  twsIdx: number,
  twaIdx: number,
  speedKn: number,
): PolarConfig {
  const clamped = Math.max(0, Math.min(OVERRIDE_MAX_KN, Math.round(speedKn * 10) / 10));
  return { ...cfg, overrides: { ...cfg.overrides, [`${twsIdx},${twaIdx}`]: clamped } };
}

/** The minimum upwind angle one degree tighter or wider, from the angle in
    effect (the automatic one until the reader pins it), within its range. */
export function stepMinUpwind(cfg: PolarConfig, delta: number): PolarConfig {
  const next = Math.min(MIN_UPWIND_MAX, Math.max(MIN_UPWIND_MIN, effectiveMinUpwind(cfg) + delta));
  return { ...cfg, minUpwindDeg: next };
}

/** The spinnaker's dousing threshold one knot lower or higher, within its
    range. */
export function stepSpiMaxTws(cfg: PolarConfig, delta: number): PolarConfig {
  const next = Math.min(SPI_MAX_TWS_MAX, Math.max(SPI_MAX_TWS_MIN, cfg.spiMaxTwsKn + delta));
  return { ...cfg, spiMaxTwsKn: next };
}
