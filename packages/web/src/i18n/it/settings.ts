// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { settings as frSettings } from "../fr/settings";

export const settings: Record<keyof typeof frSettings, string> = {
  "settings.done": "Fine",
  "settings.group.device": "Dispositivo",
  "settings.group.map": "Mappa",
  "settings.group.forecast": "Previsioni",
  "settings.theme.label": "Tema",
  "settings.theme.auto": "Auto",
  "settings.theme.light": "Chiaro",
  "settings.theme.dark": "Scuro",
  "settings.device.note": "Auto segue l'impostazione chiara o scura del dispositivo.",
  "settings.keepAwake.subtitle": "Finché è visualizzato un piano calcolato",
  "settings.seamarks.label": "Segnalamenti marittimi",
  "settings.seamarks.subtitle": "Boe, mede e fari (OpenSeaMap)",
  "settings.seamarks.always": "Sempre",
  "settings.seamarks.never": "Mai",
  "settings.map.note": "Su entrambe le mappe, meteo e pianificatore.",
  "settings.models.summary": "Tabella: {models}",
  "settings.boat.summary": "{boat} · {percent}\u00a0%",
  "settings.boat.summaryMotor": "motore sotto {speed}\u00a0kn",
  "settings.boat.summaryImported": "polare importata",
  "settings.forecast.note":
    "I modelli riempiono la tabella della mappa; la barca serve a tutte le pianificazioni della traversata.",
  "settings.storageNote":
    "OhMyWind non ha account: le preferenze restano su questo dispositivo. Cambiare dispositivo o cancellare i dati del sito le fa sparire.",
  "settings.lang.note":
    "Ogni lingua è scritta nella propria lingua, perché chi si è perso riconosca la sua.",

  // Modèles météo : la vue des Réglages (intro, repère du tableau,
  // poignées et leurs noms accessibles, toasts, réinitialisation).
  "settings.models.intro":
    "I primi <b>{limit}</b> compaiono nella tabella, in quest'ordine. Trascinare la maniglia per riordinare: un modello portato tra loro fa scendere l'ultimo tra gli ignorati.",
  "settings.models.headShown": "Usati nell'app",
  "settings.models.headIgnored": "Ignorati sotto",
  "settings.models.cut": "↑ Tabella · Ignorati ↓",
  "settings.models.meta": "{resolution}\u00a0km · ~{horizon} · {coverage}",
  "settings.models.position.shown": "{model}, posizione {rank}, visualizzato",
  "settings.models.position.ignored": "{model}, posizione {rank}, ignorato",
  "settings.models.handle.role": "maniglia di spostamento",
  "settings.models.handle.hint":
    "Frecce su e giù per salire o scendere di una posizione.",
  "settings.models.toast.swap":
    "{shown} visualizzato, {ignored} passa tra gli ignorati",
  "settings.models.toast.reset": "Ordine predefinito ripristinato",
  "settings.models.reset": "Reimpostare l'ordine",
};
