// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { common as frCommon } from "../fr/common";

export const common: Record<keyof typeof frCommon, string> = {
  "common.loading": "Caricamento…",
  "common.close": "Chiudere",
  "common.cancel": "Annullare",
  "common.back": "Indietro",
  "common.retry": "Riprovare",
  // The passing note of a request made without a network (offline/offlineNotice.ts).
  "common.offline.toast": "Offline: aggiornamento impossibile",
  "common.days.one": "{count} giorno",
  "common.days.other": "{count} giorni",

  // Forecasts kept on the device (offline): their date, and the warning.
  "common.forecast.dateAtTime": "{day} alle {time}",
  "common.forecast.from": "Previsioni del {when}",
  "common.forecast.stale":
    "Previsioni di oltre {hours} h fa: le aggiorni appena torna la rete.",

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
  "common.nav.settings": "Impostazioni",
  "common.nav.sourcesNote":
    "Previsioni Open-Meteo (CC BY 4.0). Non sono osservazioni: ascolti il bollettino prima di partire.",

  "common.version": "Versione {version}",
  "common.nav.whatsNew.title": "Novità",
  "common.nav.whatsNew.unseen": "Nuova versione",
  "common.whatsNew.intro":
    "Cosa è cambiato in OhMyWind, dalla versione più recente alla più vecchia. Il sito e il server MCP condividono lo stesso numero di versione, le app mobili hanno il loro. Le note di versione sono in inglese.",
  "common.whatsNew.current": "Versione attuale",
  "common.whatsNew.upcoming": "In preparazione",
  "common.whatsNew.allReleases": "Tutte le versioni su GitHub",

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

  "common.install.title": "OhMyWind in versione app",
  "common.install.body":
    "Aprite la mappa con un tocco dalla schermata Home, a schermo intero e senza barra degli indirizzi. Gratuita, senza account e open source.",
  "common.install.open.android": "Aprire Google Play",
  "common.install.open.ios": "Aprire l'App Store",
  "common.install.later": "Più tardi",
};
