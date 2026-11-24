// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { ARCHETYPE_LABELS, isImportedActive, type PolarConfig } from "../../config/polarConfig";
import { usePolarConfig } from "../../config/usePolarConfig";
import { getLocale, t, useT } from "../../i18n";

/**
 * The subtitle of « Bateau › » on the root view: the boat, its performance
 * coefficient, the engine when both of its speeds are set (the rule the
 * planner applies, see `PolarConfig.motorThresholdKn`), and the imported
 * polar when it is the one planned on. Every figure is read from the stored
 * configuration.
 */
export function useBoatSummary(): string {
  const { t } = useT();
  const cfg = usePolarConfig();
  const parts = [
    t("settings.boat.summary", {
      boat: ARCHETYPE_LABELS[cfg.base] ?? cfg.base,
      percent: Math.round(cfg.coefficient * 100),
    }),
  ];
  if (typeof cfg.motorThresholdKn === "number" && typeof cfg.motorSpeedKn === "number") {
    const speed = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(cfg.motorThresholdKn);
    parts.push(t("settings.boat.summaryMotor", { speed }));
  }
  if (isImportedActive(cfg)) parts.push(t("settings.boat.summaryImported"));
  return parts.join(" · ");
}

/** A list item of the dictionary starts lower case (it is read inside a
    sentence elsewhere); alone at the head of a line, it takes a capital. */
export function sentenceCase(text: string): string {
  return text.charAt(0).toLocaleUpperCase(getLocale()) + text.slice(1);
}

/**
 * The subtitle of « Avancé › » on the Bateau view: what is set there and
 * changes the plans, the imported polar in use, a pinned upwind angle, the
 * spinnaker and the hand-tuned points (the last two only count on the
 * archetype: an imported polar ignores them). With nothing set, what the
 * view holds. Called while rendering a component that reads `useT()`, so a
 * language switch reaches it.
 */
export function advancedSummary(cfg: PolarConfig): string {
  const importedActive = isImportedActive(cfg);
  const parts: string[] = [];
  if (importedActive) parts.push(t("settings.boat.summaryImported"));
  if (cfg.minUpwindDeg !== undefined) parts.push(t("settings.boat.advanced.upwind", { deg: cfg.minUpwindDeg }));
  if (!importedActive && cfg.spi !== "off") {
    parts.push(
      t(cfg.spi === "asymmetric" ? "config.boat.result.spiAsymmetric" : "config.boat.result.spiSymmetric", {
        tws: cfg.spiMaxTwsKn,
      }),
    );
  }
  const tuned = Object.keys(cfg.overrides).length;
  if (!importedActive && tuned > 0) parts.push(t("config.boat.advanced.tunedPoints", { count: tuned }));
  return sentenceCase(parts.length > 0 ? parts.join(" · ") : t("config.boat.advanced.subtitle"));
}
