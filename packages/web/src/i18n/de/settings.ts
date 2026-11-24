// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { settings as frSettings } from "../fr/settings";

export const settings: Record<keyof typeof frSettings, string> = {
  "settings.done": "Fertig",
  "settings.group.device": "Gerät",
  "settings.group.map": "Karte",
  "settings.group.forecast": "Vorhersagen",
  "settings.theme.label": "Design",
  "settings.theme.auto": "Auto",
  "settings.theme.light": "Hell",
  "settings.theme.dark": "Dunkel",
  "settings.device.note": "Auto folgt der hellen oder dunklen Einstellung des Geräts.",
  "settings.keepAwake.subtitle": "Solange ein berechneter Plan angezeigt wird",
  "settings.seamarks.label": "Seezeichen",
  "settings.seamarks.subtitle": "Tonnen, Baken und Leuchttürme (OpenSeaMap)",
  "settings.seamarks.always": "Immer",
  "settings.seamarks.never": "Nie",
  "settings.map.note": "Auf beiden Karten, Wetter und Planer.",
  "settings.models.summary": "Tabelle: {models}",
  "settings.boat.summary": "{boat} · {percent}\u00a0%",
  "settings.boat.summaryMotor": "Motor unter {speed}\u00a0kn",
  "settings.boat.summaryImported": "importierte Polare",
  "settings.forecast.note":
    "Die Modelle füllen die Tabelle der Karte, das Boot dient all Ihren Törnplanungen.",
  "settings.storageNote":
    "OhMyWind hat keine Konten: Ihre Einstellungen bleiben auf diesem Gerät. Ein Gerätewechsel oder das Löschen der Website-Daten lässt sie verschwinden.",
  "settings.lang.note":
    "Jede Sprache ist in ihrer eigenen Sprache geschrieben, damit Verirrte die ihre wiedererkennen.",
};
