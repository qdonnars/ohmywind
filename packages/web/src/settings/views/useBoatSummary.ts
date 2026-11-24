// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { ARCHETYPE_LABELS, isImportedActive } from "../../config/polarConfig";
import { usePolarConfig } from "../../config/usePolarConfig";
import { getLocale, useT } from "../../i18n";

/**
 * The subtitle of « Bateau › » on the root view: the boat, its performance
 * coefficient, the engine when both of its speeds are set (the rule the
 * planner applies, see `PolarConfig.motorThresholdKn`), and the imported
 * polar when it is the one planned on. Every figure is read from the stored
 * configuration. Belongs to the Boat view's lot.
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
