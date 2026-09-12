// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** La page `/comparer` : les spots enregistrés côte à côte, une ligne par
    spot, les jours qui se suivent dans le défilement, le pas et la fenêtre
    horaire en réglages. */
export const compare = {
  // États vides
  "compare.empty.title": "Aucun spot à comparer",
  "compare.empty.body":
    "Ajoutez un spot par la recherche, ou enregistrez-en depuis Explorer par un appui long sur la carte : ils s'afficheront ici côte à côte.",
  "compare.none.title": "Aucun spot coché",
  "compare.none.body": "Cochez au moins un spot dans la liste pour le lire ici.",
  "compare.table.empty": "Aucune donnée disponible pour vos spots.",
  "compare.table.offline":
    "Hors connexion : impossible de récupérer les prévisions. Reconnectez-vous puis rouvrez cette page.",

  // Lignes
  "compare.row.focus": "Centrer la carte sur {name}",
  "compare.row.noData": "Hors couverture",

  // Réglages
  "compare.controls.resLabel": "Pas horaire",
  "compare.controls.res": "{hours} h",
  "compare.controls.waves": "Vagues",
  "compare.window.label": "Fenêtre horaire",
  "compare.window.chip": "{start}–{end} h",
  "compare.window.start": "Début",
  "compare.window.end": "Fin",
  "compare.window.hour": "{hour}h",

  // Choix des favoris
  "compare.spots.chip": "Spots",
  "compare.spots.chipCount": "{picked}/{total}",
  "compare.spots.title": "Spots comparés",
  "compare.spots.checkAll": "Tout cocher",
  "compare.spots.uncheckAll": "Tout décocher",
  "compare.spots.add": "Ajouter un spot",
  "compare.spots.toggle": "Comparer {name}",
  "compare.spots.count.one": "{count} spot",
  "compare.spots.count.other": "{count} spots",

  // Carte et sheet
  "compare.sheet.expand": "Déplier le tableau",
  "compare.sheet.collapse": "Replier le tableau",
  "compare.map.recentre": "Recadrer la carte sur les spots",
  "compare.header.now": "Heure actuelle",

  // Cellules lues à voix haute
  "compare.cell.aria.range": "{lo} à {hi}",
  "compare.cell.aria.wind": "Vent {wind} nœuds",
  "compare.cell.aria.windGusts": "Vent {wind} nœuds, rafales {gusts}",
  "compare.cell.aria.windDirection": "Vent {wind} nœuds, direction {direction}°",
  "compare.cell.aria.windGustsDirection":
    "Vent {wind} nœuds, rafales {gusts}, direction {direction}°",
  "compare.cell.aria.wave": "Mer {hs} m, période {period} s",
  "compare.cell.aria.waveFrom": "Mer {hs} m venant de {dir}°, période {period} s",
} as const;
