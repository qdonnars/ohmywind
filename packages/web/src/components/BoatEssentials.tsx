// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import {
  ARCHETYPE_LABELS,
  COEFF_MAX,
  COEFF_MIN,
  COEFF_STEP,
  isImportedActive,
  type PolarConfig,
} from "../config/polarConfig";

// "Essentiel" tile: the three settings every sailor needs — which boat,
// when the engine takes over, how close to the polar they actually sail.
// The resulting polar renders separately, after the tiles (BoatResult).
interface BoatEssentialsProps {
  config: PolarConfig;
  onChange: (next: PolarConfig) => void;
}

export function BoatEssentials({ config, onChange }: BoatEssentialsProps) {
  const importedActive = isImportedActive(config);

  function setBase(base: string) {
    if (base === config.base) return;
    // Clear overrides when switching base because they're keyed by grid index
    // (twsIdx, twaIdx) and a different archetype may have a different grid.
    // Coefficient + spi are archetype-agnostic so we keep them as-is.
    onChange({ ...config, base, overrides: {} });
  }

  function setCoefficient(coefficient: number) {
    onChange({ ...config, coefficient });
  }

  function setMotorField(field: "motorThresholdKn" | "motorSpeedKn", raw: string) {
    const val = raw.trim();
    if (val === "") {
      onChange({ ...config, [field]: undefined });
      return;
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return;
    onChange({ ...config, [field]: Math.round(num * 10) / 10 });
  }

  return (
    <>
      <div className="grid sm:grid-cols-[1fr_1fr] gap-4 items-end">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider opacity-70">
          Mon bateau
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
              Polaire importée active — le choix du bateau s'applique en mode archétype.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider opacity-70">
          Coefficient de performance ({Math.round(config.coefficient * 100)} %)
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
        Les 100 % correspondent à la polaire théorique, calculée bateau à vide
        avec des voiles de course : en pratique on navigue en dessous. La valeur
        par défaut est un bon point de départ ; baissez-la si le bateau est chargé
        ou les voiles fatiguées.
        {importedActive && <> Polaire mesurée sur votre propre bateau ? Là, 100 % se justifie.</>}
      </p>

      {/* Motor (optional) — switches segments with sail speed under the
          threshold to a fixed motor speed. Both fields must be filled for
          the override to apply; the backend ignores partial configs. */}
      <fieldset className="polar-motor">
        <legend className="polar-motor-legend">Moteur (optionnel)</legend>
        <div className="polar-motor-grid">
          <label className="polar-motor-label">
            <span>Vitesse seuil (kn)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              max="10"
              placeholder="ex. 2"
              value={config.motorThresholdKn ?? ""}
              onChange={(e) => setMotorField("motorThresholdKn", e.target.value)}
              className="polar-motor-input"
            />
          </label>
          <label className="polar-motor-label">
            <span>Vitesse moteur (kn)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              max="12"
              placeholder="ex. 5"
              value={config.motorSpeedKn ?? ""}
              onChange={(e) => setMotorField("motorSpeedKn", e.target.value)}
              className="polar-motor-input"
            />
          </label>
        </div>
        <p className="polar-motor-hint">
          Sous la vitesse seuil calculée par la polaire, on bascule au moteur.
          Laissez les deux champs vides pour rester 100&nbsp;% voile (comportement par défaut).
        </p>
        {typeof config.motorThresholdKn === "number" !==
          (typeof config.motorSpeedKn === "number") && (
          <p className="polar-motor-warn">
            Renseignez les deux valeurs pour activer le moteur. Tant qu'un seul champ
            est rempli, la simulation reste 100&nbsp;% voile.
          </p>
        )}
      </fieldset>
    </>
  );
}
