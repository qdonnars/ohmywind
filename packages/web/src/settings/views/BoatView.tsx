// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useId, useState } from "react";
import { PolarDiagram } from "../../components/PolarDiagram";
import { resultPolar } from "../../components/resultPolar";
import { motorWarnings, saveBoatEdit, withMotorField, type MotorField } from "../../config/boatEdits";
import {
  ARCHETYPE_LABELS,
  BASE_POLARS,
  COEFF_MAX,
  COEFF_MIN,
  COEFF_STEP,
  MOTOR_MAX_KN,
  MOTOR_SPEED_MIN_KN,
  defaultPolarConfig,
  isImportedActive,
} from "../../config/polarConfig";
import { usePolarConfig } from "../../config/usePolarConfig";
import { useT } from "../../i18n";
import { useSettingsNav } from "../nav";
import { SettingsGroup, SettingsGroupTitle, SettingsNote } from "../parts";
import { BoatLinkRow, CurveChips } from "./boatParts";
import { advancedSummary, sentenceCase } from "./useBoatSummary";

/**
 * « Bateau »: what every passage plan sails on. The boat and its
 * performance coefficient, the engine, the way to « Avancé », the polar the
 * planner will use, and the reset. Same data and rules as the "Bateau" tab
 * of /config (`config/boatEdits`); each change is stored as it is made and
 * re-selects the perso polar on /plan.
 */
export function BoatView() {
  const { t } = useT();
  const nav = useSettingsNav();
  const cfg = usePolarConfig();
  const importedActive = isImportedActive(cfg);
  // True after a typed motor value was brought back to MOTOR_MAX_KN: the
  // stored config only holds valid values, so the event itself is kept here
  // to be explained.
  const [motorClamped, setMotorClamped] = useState(false);
  const [curve, setCurve] = useState(0);
  const ids = useId();

  const setMotorField = (field: MotorField, raw: string) => {
    const result = withMotorField(cfg, field, raw);
    if (!result) return;
    setMotorClamped(result.clamped);
    saveBoatEdit(result.next);
  };
  const { halfSet, inverted } = motorWarnings(cfg);
  const percent = Math.round(cfg.coefficient * 100);
  const result = resultPolar(cfg);
  const examples = BASE_POLARS[cfg.base]?.examples.join(", ");

  return (
    <>
      <SettingsNote>{t("settings.boat.intro")}</SettingsNote>

      <SettingsGroupTitle>{t("config.boat.essentials.title")}</SettingsGroupTitle>
      <SettingsGroup>
        <BoatLinkRow
          label={t("config.boat.essentials.myBoat")}
          subtitle={examples}
          value={ARCHETYPE_LABELS[cfg.base]}
          onOpen={() => nav.push("boatType")}
          // An imported polar ignores the boat type: its choice applies on
          // the archetype only, and is closed meanwhile, as on /config.
          disabled={importedActive}
          describedBy={importedActive ? `${ids}-imported` : undefined}
        />
        {importedActive && (
          <p id={`${ids}-imported`} className="ow-boat-inline-warn">
            {t("config.boat.essentials.importedActive")}
          </p>
        )}
        <div className="ow-settings-row ow-boat-slider">
          <label htmlFor={`${ids}-coef`}>{t("config.boat.essentials.coefficient", { percent })}</label>
          <input
            id={`${ids}-coef`}
            type="range"
            min={COEFF_MIN}
            max={COEFF_MAX}
            step={COEFF_STEP}
            value={cfg.coefficient}
            aria-valuetext={`${percent}\u00a0%`}
            aria-describedby={`${ids}-coef-hint`}
            onChange={(e) => saveBoatEdit({ ...cfg, coefficient: parseFloat(e.target.value) })}
          />
        </div>
      </SettingsGroup>
      {/* The hint explains the scale but never repeats a number that could
          drift from COEFF_DEFAULT: the slider's label is the only figure. */}
      <p id={`${ids}-coef-hint`} className="ow-settings-note">
        {t("config.boat.essentials.coefficientHint")}
        {importedActive && <> {t("config.boat.essentials.coefficientHintImported")}</>}
      </p>

      {/* Both motor fields must be filled for the motor to apply, so with the
          keyboard up the two, and what is said about them, are brought into
          sight together (see viewport/visibleViewport). */}
      <div data-ow-keyboard-reveal>
        <SettingsGroupTitle>{t("config.boat.motor.legend")}</SettingsGroupTitle>
        <SettingsGroup>
          <MotorRow
            label={t("config.boat.motor.thresholdLabel")}
            placeholder={t("config.boat.motor.thresholdPlaceholder")}
            min={0.1}
            value={cfg.motorThresholdKn}
            onChange={(raw) => setMotorField("motorThresholdKn", raw)}
          />
          <MotorRow
            label={t("config.boat.motor.speedLabel")}
            placeholder={t("config.boat.motor.speedPlaceholder")}
            min={MOTOR_SPEED_MIN_KN}
            value={cfg.motorSpeedKn}
            onChange={(raw) => setMotorField("motorSpeedKn", raw)}
          />
        </SettingsGroup>
        <div role="status">
          {motorClamped && (
            <p className="ow-settings-note ow-boat-warn">{t("config.boat.motor.clamped", { max: MOTOR_MAX_KN })}</p>
          )}
          {halfSet && <p className="ow-settings-note ow-boat-warn">{t("config.boat.motor.halfSet")}</p>}
          {inverted && <p className="ow-settings-note ow-boat-warn">{t("config.boat.motor.inverted")}</p>}
        </div>
        <SettingsNote>{t("config.boat.motor.hint", { max: MOTOR_MAX_KN })}</SettingsNote>
      </div>

      <div className="ow-boat-spaced">
        <SettingsGroup>
          <BoatLinkRow
            label={t("config.boat.advanced.title")}
            subtitle={advancedSummary(cfg)}
            onOpen={() => nav.push("boatAdvanced")}
          />
        </SettingsGroup>
      </div>

      <SettingsGroupTitle>{t("config.boat.result.title")}</SettingsGroupTitle>
      <div className="ow-settings-group ow-boat-card">
        <CurveChips
          label={t("config.polar.curveShown")}
          twsKn={result.effective.tws_kn}
          selected={curve}
          onSelect={setCurve}
        />
        <div className="ow-boat-diagram">
          <PolarDiagram
            title={result.title}
            subtitle={result.subtitle}
            twsKn={result.effective.tws_kn}
            twaDeg={result.effective.twa_deg}
            matrix={result.matrix}
            selectedTwsIdx={curve}
            minUpwindDeg={result.minUpwind}
          />
        </div>
      </div>
      <SettingsNote>{sentenceCase(t("config.boat.result.tileSubtitle"))}</SettingsNote>

      <button
        type="button"
        className="ow-boat-danger"
        onClick={() => {
          setMotorClamped(false);
          setCurve(0);
          saveBoatEdit(defaultPolarConfig());
        }}
      >
        {t("config.boat.resetAll")}
      </button>
    </>
  );
}

/** One motor speed: its label, and the field on the right, in knots with a
    decimal keypad. Empty means unset. */
function MotorRow({ label, placeholder, min, value, onChange }: {
  label: string;
  placeholder: string;
  min: number;
  value: number | undefined;
  onChange: (raw: string) => void;
}) {
  const id = useId();
  return (
    <div className="ow-settings-row ow-boat-field">
      <label htmlFor={id} className="ow-settings-row-text">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.1"
        min={min}
        max={MOTOR_MAX_KN}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
