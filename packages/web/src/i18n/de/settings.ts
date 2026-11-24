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
    "Die Modelle füllen die Tabelle der Karte und dienen in dieser Reihenfolge der Berechnung Ihrer Törnplanungen. Das Boot dient all Ihren Planungen.",
  "settings.storageNote":
    "OhMyWind hat keine Konten: Ihre Einstellungen bleiben auf diesem Gerät. Ein Gerätewechsel oder das Löschen der Website-Daten lässt sie verschwinden.",
  "settings.lang.note":
    "Jede Sprache ist in ihrer eigenen Sprache geschrieben, damit Verirrte die ihre wiedererkennen.",

  // Modèles météo : la vue des Réglages (intro, repère du tableau,
  // poignées et leurs noms accessibles, toasts, réinitialisation).
  "settings.models.intro":
    "Die ersten <b>{limit}</b> erscheinen in dieser Reihenfolge in der Tabelle. Ziehen Sie am Griff, um die Reihenfolge zu ändern: Rückt ein Modell zu ihnen auf, wandert das letzte von ihnen zu den ignorierten.",
  "settings.models.headShown": "In der App genutzt",
  "settings.models.headIgnored": "Darunter ignoriert",
  "settings.models.cut": "↑ Tabelle · Ignoriert ↓",
  "settings.models.meta": "{resolution}\u00a0km · ~{horizon} · {coverage}",
  "settings.models.position.shown": "{model}, Rang {rank}, angezeigt",
  "settings.models.position.ignored": "{model}, Rang {rank}, ignoriert",
  "settings.models.handle.role": "Ziehgriff",
  "settings.models.handle.hint":
    "Mit den Pfeiltasten nach oben und unten um einen Rang verschieben.",
  "settings.models.toast.swap":
    "{shown} angezeigt, {ignored} wird ignoriert",
  "settings.models.toast.reset": "Standardreihenfolge wiederhergestellt",
  "settings.models.reset": "Reihenfolge zurücksetzen",
};
