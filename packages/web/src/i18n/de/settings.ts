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

  // Boot: die Ansichten Boot, Mein Boot und Erweitert.
  "settings.boat.intro":
    "Diese Einstellungen fließen in jede Törnplanung ein. Für den Anfang genügt das Wesentliche.",
  "settings.boat.types.note":
    "Jeder Bootstyp bringt seine eigene Polare und seinen Am-Wind-Winkel mit. Passen Sie danach den Faktor an.",
  "settings.boat.advanced.upwind": "am Wind {deg}°",
  "settings.boat.upwind.manual": "Von Hand eingestellt",
  "settings.boat.upwind.tighter": "Am-Wind-Winkel verkleinern",
  "settings.boat.upwind.wider": "Am-Wind-Winkel vergrößern",
  "settings.boat.spi.lower": "Bergeschwelle senken",
  "settings.boat.spi.higher": "Bergeschwelle anheben",
  "settings.boat.tuning.legend":
    "Gestrichelt: die Kurve vor Ihren Anpassungen. Gelbe Punkte: angepasste Punkte. Mit der Tastatur ändern die Pfeiltasten die Geschwindigkeit eines Punkts um {step}\u00a0kn.",
  "settings.boat.point": "Winkel {twa}°, {speed}\u00a0kn",
  "settings.boat.pointTuned": "Winkel {twa}°, {speed}\u00a0kn, angepasst",

  "settings.forecast.note":
    "Die Modelle füllen die Tabelle der Karte, das Boot dient all Ihren Törnplanungen.",
  "settings.storageNote":
    "OhMyWind hat keine Konten: Ihre Einstellungen bleiben auf diesem Gerät. Ein Gerätewechsel oder das Löschen der Website-Daten lässt sie verschwinden.",
  "settings.lang.note":
    "Jede Sprache ist in ihrer eigenen Sprache geschrieben, damit Verirrte die ihre wiedererkennen.",
};
