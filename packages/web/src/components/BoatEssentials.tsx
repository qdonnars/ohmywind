// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";

import { useT } from "../i18n";
import {
  ARCHETYPE_LABELS,
  COEFF_MAX,
  COEFF_MIN,
  COEFF_STEP,
  MOTOR_MAX_KN,
  MOTOR_SPEED_MIN_KN,
  isImportedActive,
  type PolarConfig,
} from "../config/polarConfig";
import { motorWarnings, withBase, withMotorField, type MotorField } from "../config/boatEdits";

// "Essentiel" tile: the three settings every sailor needs — which boat,
// when the engine takes over, how close to the polar they actually sail.
// The resulting polar renders separately, after the tiles (BoatResult).
interface BoatEssentialsProps {
  config: PolarConfig;
  onChange: (next: PolarConfig) => void;
}

export function BoatEssentials({ config, onChange }: BoatEssentialsProps) {
  const { t } = useT();
  const importedActive = isImportedActive(config);
  // True after a typed motor value got clamped to MOTOR_MAX_KN. Transient UI
  // state: the stored config only ever holds valid values, so the clamp event
  // itself has to be remembered here to be explainable to the user.
  const [motorClamped, setMotorClamped] = useState(false);

  function setBase(base: string) {
    const next = withBase(config, base);
    if (next) onChange(next);
  }

  function setCoefficient(coefficient: number) {
    onChange({ ...config, coefficient });
  }

  function setMotorField(field: MotorField, raw: string) {
    const result = withMotorField(config, field, raw);
    if (!result) return;
    setMotorClamped(result.clamped);
    onChange(result.next);
  }

  const { halfSet: motorHalfSet, inverted: motorInverted } = motorWarnings(config);

  return (
    <>
      <div className="grid sm:grid-cols-[1fr_1fr] gap-4 items-end">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider opacity-70">
          {t("config.boat.essentials.myBoat")}
          <select
            className="polar-select"
            value={config.base}
            onChange={(e) => setBase(e.target.value)}
            disabled={importedActive}
          >
            {Object.entries(ARCHETYPE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          {importedActive && (
            <span className="text-[10px] opacity-60 normal-case tracking-normal">
              {t("config.boat.essentials.importedActive")}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider opacity-70">
          {t("config.boat.essentials.coefficient", {
            percent: Math.round(config.coefficient * 100),
          })}
          <input
            type="range"
            min={COEFF_MIN}
            max={COEFF_MAX}
            step={COEFF_STEP}
            value={config.coefficient}
            onChange={(e) => setCoefficient(parseFloat(e.target.value))}
            className="polar-range"
          />
        </label>
      </div>
      {/* Single source of truth for the recommended value: the slider label.
          The hint explains the scale but never repeats a number that could
          drift from COEFF_DEFAULT. */}
      <p className="polar-hint">
        {t("config.boat.essentials.coefficientHint")}
        {importedActive && <> {t("config.boat.essentials.coefficientHintImported")}</>}
      </p>

      {/* Motor (optional) — switches segments with sail speed under the
          threshold to a fixed motor speed. Both fields must be filled for
          the override to apply; the backend ignores partial configs, which
          is why, with the keyboard up, the two are brought into sight
          together (data-ow-keyboard-reveal, see viewport/visibleViewport). */}
      <fieldset className="polar-motor" data-ow-keyboard-reveal>
        <legend className="polar-motor-legend">{t("config.boat.motor.legend")}</legend>
        <div className="polar-motor-grid">
          <label className="polar-motor-label">
            <span>{t("config.boat.motor.thresholdLabel")}</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              max={MOTOR_MAX_KN}
              placeholder={t("config.boat.motor.thresholdPlaceholder")}
              value={config.motorThresholdKn ?? ""}
              onChange={(e) => setMotorField("motorThresholdKn", e.target.value)}
              className="polar-motor-input"
            />
          </label>
          <label className="polar-motor-label">
            <span>{t("config.boat.motor.speedLabel")}</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={MOTOR_SPEED_MIN_KN}
              max={MOTOR_MAX_KN}
              placeholder={t("config.boat.motor.speedPlaceholder")}
              value={config.motorSpeedKn ?? ""}
              onChange={(e) => setMotorField("motorSpeedKn", e.target.value)}
              className="polar-motor-input"
            />
          </label>
        </div>
        <p className="polar-motor-hint">
          {t("config.boat.motor.hint", { max: MOTOR_MAX_KN })}
        </p>
        {motorClamped && (
          <p className="polar-motor-warn">{t("config.boat.motor.clamped", { max: MOTOR_MAX_KN })}</p>
        )}
        {motorHalfSet && (
          <p className="polar-motor-warn">{t("config.boat.motor.halfSet")}</p>
        )}
        {motorInverted && (
          <p className="polar-motor-warn">{t("config.boat.motor.inverted")}</p>
        )}
      </fieldset>
    </>
  );
}
