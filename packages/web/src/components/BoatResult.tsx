// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useState } from "react";
import { useT } from "../i18n";
import {
  ARCHETYPE_LABELS,
  effectiveMinUpwind,
  effectivePolar,
  isImportedActive,
  type PolarConfig,
} from "../config/polarConfig";
import { PolarDiagram, TwsPills } from "./PolarDiagram";

// The resulting polar, read-only — rendered AFTER both tiles so it reflects
// every setting above it (Essentiel and Avancé alike): effective matrix
// (imported file or archetype × spi × overrides) scaled by the coefficient,
// i.e. the speeds the planner will actually work from.
export function BoatResult({ config }: { config: PolarConfig }) {
  const { t } = useT();
  const [selectedTwsIdx, setSelectedTwsIdx] = useState(0);
  const importedActive = isImportedActive(config);

  const effective = useMemo(() => effectivePolar(config), [config]);
  const displayMatrix = useMemo(
    () =>
      effective.boat_speed_kn.map((row) =>
        row.map((v) => Math.round(v * config.coefficient * 100) / 100),
      ),
    [effective, config.coefficient],
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

  return (
    <>
      <TwsPills
        twsKn={effective.tws_kn}
        selectedIdx={selectedTwsIdx}
        onSelect={setSelectedTwsIdx}
        label={t("config.polar.curveShown")}
      />
      <PolarDiagram
        title={importedActive ? effective.name : ARCHETYPE_LABELS[config.base]}
        subtitle={`${t("config.boat.result.subtitle", {
          coefficient: config.coefficient.toFixed(2),
          upwind: minUpwind,
        })}${spiNote}`}
        twsKn={effective.tws_kn}
        twaDeg={effective.twa_deg}
        matrix={displayMatrix}
        selectedTwsIdx={selectedTwsIdx}
        minUpwindDeg={minUpwind}
      />
    </>
  );
}
