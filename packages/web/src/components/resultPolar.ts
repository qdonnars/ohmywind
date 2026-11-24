// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import {
  ARCHETYPE_LABELS,
  effectiveMinUpwind,
  effectivePolar,
  isImportedActive,
  type PolarConfig,
  type PolarData,
} from "../config/polarConfig";
import { t } from "../i18n";

/**
 * The resulting polar, as the planner will work from it: the effective
 * matrix (imported file, or archetype × spinnaker × hand-tuned points)
 * scaled by the coefficient, with the title and subtitle the diagram shows.
 * Drawn by the Bateau view of the settings.
 */
export function resultPolar(config: PolarConfig): {
  effective: PolarData;
  matrix: number[][];
  minUpwind: number;
  title: string;
  subtitle: string;
} {
  const importedActive = isImportedActive(config);
  const effective = effectivePolar(config);
  const matrix = effective.boat_speed_kn.map((row) =>
    row.map((v) => Math.round(v * config.coefficient * 100) / 100),
  );
  const minUpwind = effectiveMinUpwind(config);
  // The " · " is punctuation between two facts, not copy: the subtitle is a
  // list, and each of its items is a whole sentence of its own in the
  // dictionary.
  const spiNote =
    !importedActive && config.spi !== "off"
      ? ` · ${t(
          config.spi === "asymmetric"
            ? "config.boat.result.spiAsymmetric"
            : "config.boat.result.spiSymmetric",
          { tws: config.spiMaxTwsKn },
        )}`
      : "";
  return {
    effective,
    matrix,
    minUpwind,
    title: importedActive ? effective.name : ARCHETYPE_LABELS[config.base],
    subtitle: `${t("config.boat.result.subtitle", {
      coefficient: config.coefficient.toFixed(2),
      upwind: minUpwind,
    })}${spiNote}`,
  };
}
