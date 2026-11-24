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

  // Barca: le viste Barca, La mia barca e Avanzato.
  "settings.boat.intro":
    "Queste impostazioni alimentano tutte le pianificazioni della traversata. L'essenziale basta per iniziare bene.",
  "settings.boat.types.note":
    "Ogni tipo di barca ha la propria polare e il proprio angolo di bolina. Regolare poi il coefficiente.",
  "settings.boat.advanced.upwind": "bolina {deg}°",
  "settings.boat.upwind.manual": "Impostato a mano",
  "settings.boat.upwind.tighter": "Stringere l'angolo di bolina",
  "settings.boat.upwind.wider": "Allargare l'angolo di bolina",
  "settings.boat.spi.lower": "Abbassare la soglia di ammainata",
  "settings.boat.spi.higher": "Alzare la soglia di ammainata",
  "settings.boat.tuning.legend":
    "Tratteggio: la curva prima delle regolazioni. Punti gialli: punti regolati. Da tastiera, le frecce cambiano la velocità di un punto di {step}\u00a0kn.",
  "settings.boat.point": "Angolo {twa}°, {speed}\u00a0kn",
  "settings.boat.pointTuned": "Angolo {twa}°, {speed}\u00a0kn, regolato",

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
