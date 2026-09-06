// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** La page `/comparer` : les spots enregistrés côte à côte, une ligne par
    spot sur la même frise horaire que la table du vent. */
export const compare = {
  // Aucun spot enregistré
  "compare.empty.title": "Aucun spot à comparer",
  "compare.empty.body":
    "Enregistrez vos spots depuis Explorer, par un appui long sur la carte ou un clic droit : ils s'afficheront ici côte à côte.",
  "compare.empty.cta": "Explorer la carte",

  // Table
  "compare.table.empty": "Aucune donnée disponible pour vos spots.",
  "compare.table.offline":
    "Hors connexion : impossible de récupérer les prévisions. Reconnectez-vous puis rouvrez cette page.",
  "compare.row.focus": "Centrer la carte sur {name}",
  "compare.row.open": "Ouvrir {name} dans Explorer",
  "compare.row.noData": "Hors couverture",
} as const;
