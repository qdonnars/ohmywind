// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { compare as frCompare } from "../fr/compare";

export const compare: Record<keyof typeof frCompare, string> = {
  "compare.empty.title": "Kein Spot zum Vergleichen",
  "compare.empty.body":
    "Fügen Sie einen Spot über die Suche hinzu oder speichern Sie einen unter Erkunden mit langem Druck auf die Karte: Sie erscheinen hier nebeneinander.",
  "compare.none.title": "Kein Spot angehakt",
  "compare.none.body": "Haken Sie mindestens einen Spot in der Liste an, um ihn hier zu lesen.",
  "compare.table.empty": "Keine Daten für Ihre Spots verfügbar.",
  "compare.table.offline":
    "Offline: Die Vorhersagen können nicht geladen werden. Verbinden Sie sich erneut und öffnen Sie diese Seite noch einmal.",

  "compare.row.focus": "Karte auf {name} zentrieren",
  "compare.row.noData": "Außerhalb der Abdeckung",

  "compare.controls.resLabel": "Zeitschritt",
  "compare.controls.res": "{hours} h",
  "compare.controls.windPlus": "Wind +",
  "compare.controls.waves": "Wellen",
  "compare.window.label": "Zeitfenster",
  "compare.window.chip": "{start}–{end} h",
  "compare.window.start": "Von",
  "compare.window.end": "Bis",
  "compare.window.hour": "{hour}h",

  "compare.spots.chip": "Spots",
  "compare.spots.chipCount": "{picked}/{total}",
  "compare.spots.title": "Verglichene Spots",
  "compare.spots.checkAll": "Alle anhaken",
  "compare.spots.uncheckAll": "Alle abwählen",
  "compare.spots.add": "Spot hinzufügen",
  "compare.spots.toggle": "{name} vergleichen",
  "compare.spots.count.one": "{count} Spot",
  "compare.spots.count.other": "{count} Spots",

  "compare.sheet.expand": "Tabelle ausklappen",
  "compare.sheet.collapse": "Tabelle einklappen",
  "compare.map.recentre": "Karte auf die Spots ausrichten",
  "compare.header.now": "Aktuelle Stunde",

  "compare.cell.aria.range": "{lo} bis {hi}",
  "compare.cell.aria.wind": "Wind {wind} Knoten",
  "compare.cell.aria.windGusts": "Wind {wind} Knoten, Böen {gusts}",
  "compare.cell.aria.windDirection": "Wind {wind} Knoten, Richtung {direction}°",
  "compare.cell.aria.windGustsDirection":
    "Wind {wind} Knoten, Böen {gusts}, Richtung {direction}°",
  "compare.cell.aria.wave": "See {hs} m, Periode {period} s",
  "compare.cell.aria.waveFrom": "See {hs} m aus {dir}°, Periode {period} s",
};
