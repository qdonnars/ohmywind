// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { Archetype } from "../types";
import {
  ARCHETYPE_LABELS,
  isImportedActive,
  isPersoActive,
  type PolarConfig,
} from "../../config/polarConfig";
import { t } from "../../i18n";

/** Longer than this, an imported file name pushes the recap onto two lines. */
const MAX_IMPORTED_NAME = 20;

/**
 * The boat, as the recap strip announces it.
 *
 * With the perso polar active it names the *provenance* of the customization:
 * the file name suffixed « importée », or `cfg.base` suffixed « ajustée ».
 * `cfg.base` and never the page's slug, which could still carry another boat
 * from a stale URL or cache (#220). Otherwise the French display label of the
 * selected stock archetype.
 *
 * The performance coefficient is deliberately absent: the Bateau tab of
 * /config stays its single indicator.
 */
export function boatLabel(
  polarConfig: PolarConfig,
  currentSlug: string,
  archetypes: Archetype[],
): string {
  if (isPersoActive(polarConfig)) {
    if (isImportedActive(polarConfig)) {
      const name = polarConfig.imported?.name ?? t("panel.boat.polarFallback");
      const short =
        name.length > MAX_IMPORTED_NAME ? `${name.slice(0, MAX_IMPORTED_NAME - 1)}…` : name;
      return t("panel.boat.recapImported", { name: short });
    }
    const base = ARCHETYPE_LABELS[polarConfig.base] ?? polarConfig.base;
    return t("panel.boat.recapAdjusted", { base });
  }
  return (
    ARCHETYPE_LABELS[currentSlug] ??
    archetypes.find((a) => a.slug === currentSlug)?.name ??
    currentSlug
  );
}
