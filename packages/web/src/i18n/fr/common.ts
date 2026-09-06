// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** Strings shared by several screens. Anything specific to one area belongs
    to that area's file (`explore`, `plan`, `panel`, `config`). */
export const common = {
  "common.loading": "Chargement…",
  "common.close": "Fermer",
  "common.cancel": "Annuler",
  "common.back": "Retour",
  "common.retry": "Réessayer",
  "common.days.one": "{count} jour",
  "common.days.other": "{count} jours",

  // Menu de navigation : le burger et ses trois destinations
  "common.nav.open": "Ouvrir le menu",
  "common.nav.close": "Fermer le menu",
  "common.nav.label": "Navigation",
  "common.nav.explore.title": "Explorer",
  "common.nav.explore.desc": "La carte et la météo du spot",
  "common.nav.plan.title": "Planifier",
  "common.nav.plan.desc": "Simuler une route, comparer les fenêtres",
  "common.nav.compare.title": "Comparer mes spots",
  "common.nav.compare.desc": "Mes favoris côte à côte",
} as const;
