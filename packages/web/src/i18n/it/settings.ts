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
};
