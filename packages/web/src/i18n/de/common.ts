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

  "common.quota.connection":
    "Der kostenlose Wetterdienst (Open-Meteo) hat sein Anfragelimit {window} für Ihre Verbindung erreicht. {reset}",
  "common.quota.server":
    "Der kostenlose Wetterdienst (Open-Meteo) hat sein Anfragelimit {window} für unseren Server erreicht. Das hat nichts mit Ihrer Nutzung zu tun. {reset}",
  "common.quota.window.minute": "pro Minute",
  "common.quota.window.hour": "pro Stunde",
  "common.quota.window.day": "pro Tag",
  "common.quota.reset.soon": "Zurücksetzung in weniger als einer Minute.",
  "common.quota.reset.minutes.one": "Zurücksetzung in {count} Minute.",
  "common.quota.reset.minutes.other": "Zurücksetzung in {count} Minuten.",
  "common.quota.reset.hours.one": "Zurücksetzung in etwa {count} Stunde.",
  "common.quota.reset.hours.other": "Zurücksetzung in etwa {count} Stunden.",
};
