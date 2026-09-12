// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { common as frCommon } from "../fr/common";

export const common: Record<keyof typeof frCommon, string> = {
  "common.loading": "Wird geladen…",
  "common.close": "Schließen",
  "common.cancel": "Abbrechen",
  "common.back": "Zurück",
  "common.retry": "Erneut versuchen",
  "common.days.one": "{count} Tag",
  "common.days.other": "{count} Tage",

  // Navigation menu
  "common.nav.open": "Menü öffnen",
  "common.nav.close": "Menü schließen",
  "common.nav.label": "Navigation",
  "common.nav.explore.title": "Erkunden",
  "common.nav.explore.desc": "Die Karte und das Wetter am Spot",
  "common.nav.plan.title": "Planen",
  "common.nav.plan.desc": "Route simulieren, Zeitfenster vergleichen",
  "common.nav.compare.title": "Meine Spots vergleichen",
  "common.nav.compare.desc": "Meine Favoriten nebeneinander",
};
