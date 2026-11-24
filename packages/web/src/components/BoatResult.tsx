// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import { useT } from "../i18n";
import type { PolarConfig } from "../config/polarConfig";
import { PolarDiagram, TwsPills } from "./PolarDiagram";
import { resultPolar } from "./resultPolar";

// The resulting polar, read-only — rendered AFTER both tiles so it reflects
// every setting above it (Essentiel and Avancé alike): effective matrix
// (imported file or archetype × spi × overrides) scaled by the coefficient,
// i.e. the speeds the planner will actually work from (see resultPolar).
export function BoatResult({ config }: { config: PolarConfig }) {
  const { t } = useT();
  const [selectedTwsIdx, setSelectedTwsIdx] = useState(0);
  const result = resultPolar(config);

  return (
    <>
      <TwsPills
        twsKn={result.effective.tws_kn}
        selectedIdx={selectedTwsIdx}
        onSelect={setSelectedTwsIdx}
        label={t("config.polar.curveShown")}
      />
      <PolarDiagram
        title={result.title}
        subtitle={result.subtitle}
        twsKn={result.effective.tws_kn}
        twaDeg={result.effective.twa_deg}
        matrix={result.matrix}
        selectedTwsIdx={selectedTwsIdx}
        minUpwindDeg={result.minUpwind}
      />
    </>
  );
}
