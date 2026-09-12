// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { common as frCommon } from "../fr/common";

export const common: Record<keyof typeof frCommon, string> = {
  "common.loading": "Caricamento…",
  "common.close": "Chiudere",
  "common.cancel": "Annullare",
  "common.back": "Indietro",
  "common.retry": "Riprovare",
  "common.days.one": "{count} giorno",
  "common.days.other": "{count} giorni",

  // Navigation menu
  "common.nav.open": "Aprire il menu",
  "common.nav.close": "Chiudere il menu",
  "common.nav.label": "Navigazione",
  "common.nav.explore.title": "Esplorare",
  "common.nav.explore.desc": "La mappa e il meteo dello spot",
  "common.nav.plan.title": "Pianificare",
  "common.nav.plan.desc": "Simulare una rotta, confrontare le finestre",
  "common.nav.compare.title": "Confrontare i miei spot",
  "common.nav.compare.desc": "I miei preferiti fianco a fianco",
};
