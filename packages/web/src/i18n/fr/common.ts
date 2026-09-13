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

  // Quota gratuit d'Open-Meteo épuisé : quel compteur, pour qui, et quand il
  // revient. Le fragment {window} est une locution prépositionnelle dans les
  // cinq langues, d'où une seule phrase par côté au lieu de trois.
  "common.quota.connection":
    "Le service météo gratuit (Open-Meteo) a atteint sa limite de requêtes {window} pour votre connexion. {reset}",
  "common.quota.server":
    "Le service météo gratuit (Open-Meteo) a atteint sa limite de requêtes {window} pour notre serveur. Ce n'est pas lié à votre usage. {reset}",
  "common.quota.window.minute": "par minute",
  "common.quota.window.hour": "par heure",
  "common.quota.window.day": "par jour",
  "common.quota.reset.soon": "Réinitialisation dans moins d'une minute.",
  "common.quota.reset.minutes.one": "Réinitialisation dans {count} minute.",
  "common.quota.reset.minutes.other": "Réinitialisation dans {count} minutes.",
  "common.quota.reset.hours.one": "Réinitialisation dans {count} heure environ.",
  "common.quota.reset.hours.other": "Réinitialisation dans {count} heures environ.",
} as const;
