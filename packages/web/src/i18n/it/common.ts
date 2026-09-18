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

  "common.quota.connection":
    "Il servizio meteo gratuito (Open-Meteo) ha raggiunto il limite di richieste {window} per la sua connessione. {reset}",
  "common.quota.server":
    "Il servizio meteo gratuito (Open-Meteo) ha raggiunto il limite di richieste {window} per il nostro server. Non dipende dal suo utilizzo. {reset}",
  "common.quota.window.minute": "al minuto",
  "common.quota.window.hour": "all'ora",
  "common.quota.window.day": "al giorno",
  "common.quota.reset.soon": "Si azzera tra meno di un minuto.",
  "common.quota.reset.minutes.one": "Si azzera tra {count} minuto.",
  "common.quota.reset.minutes.other": "Si azzera tra {count} minuti.",
  "common.quota.reset.hours.one": "Si azzera tra circa {count} ora.",
  "common.quota.reset.hours.other": "Si azzera tra circa {count} ore.",
};
