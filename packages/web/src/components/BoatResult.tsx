import { useMemo, useState } from "react";
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
  const spiNote =
    !importedActive && config.spi !== "off"
      ? ` · spi ${config.spi === "asymmetric" ? "asymétrique" : "symétrique"} ≤ ${config.spiMaxTwsKn} kn`
      : "";

  return (
    <>
      <TwsPills
        twsKn={effective.tws_kn}
        selectedIdx={selectedTwsIdx}
        onSelect={setSelectedTwsIdx}
        label="Courbe affichée (TWS)"
      />
      <PolarDiagram
        title={importedActive ? effective.name : ARCHETYPE_LABELS[config.base]}
        subtitle={`polaire résultante · coefficient ×${config.coefficient.toFixed(2)} · près ${minUpwind}°${spiNote}`}
        twsKn={effective.tws_kn}
        twaDeg={effective.twa_deg}
        matrix={displayMatrix}
        selectedTwsIdx={selectedTwsIdx}
        minUpwindDeg={minUpwind}
      />
    </>
  );
}
