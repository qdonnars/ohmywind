// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { compare as frCompare } from "../fr/compare";

export const compare: Record<keyof typeof frCompare, string> = {
  "compare.empty.title": "Kein Spot zum Vergleichen",
  "compare.empty.body":
    "Speichern Sie Spots unter Erkunden, mit langem Druck auf die Karte oder per Rechtsklick: Sie erscheinen hier nebeneinander.",
  "compare.empty.cta": "Karte erkunden",

  "compare.table.empty": "Keine Daten für Ihre Spots verfügbar.",
  "compare.table.offline":
    "Offline: Die Vorhersagen können nicht geladen werden. Verbinden Sie sich erneut und öffnen Sie diese Seite noch einmal.",
  "compare.row.focus": "Karte auf {name} zentrieren",
  "compare.row.open": "{name} unter Erkunden öffnen",
  "compare.row.noData": "Außerhalb der Abdeckung",
};
