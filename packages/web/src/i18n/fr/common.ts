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

  // Prévisions gardées sur l'appareil (hors connexion) : leur date, et
  // l'avertissement au-delà du seuil de offline/freshness.ts.
  "common.forecast.dateAtTime": "{day} à {time}",
  "common.forecast.from": "Prévisions du {when}",
  "common.forecast.stale":
    "Prévisions vieilles de plus de {hours} h : actualisez-les dès que le réseau revient.",

  // Menu de navigation : le burger, le tiroir et ses entrées
  "common.nav.open": "Ouvrir le menu",
  "common.nav.close": "Fermer le menu",
  "common.nav.label": "Navigation",
  "common.nav.explore.title": "Explorer",
  "common.nav.explore.desc": "La carte et la météo du spot",
  "common.nav.plan.title": "Planifier",
  "common.nav.plan.desc": "Simuler une route, comparer les fenêtres",
  "common.nav.compare.title": "Comparer mes spots",
  "common.nav.compare.desc": "Mes favoris côte à côte",
  "common.nav.settings": "Réglages",
  "common.nav.sourcesNote":
    "Prévisions Open-Meteo (CC BY 4.0). Ce ne sont pas des observations : écoutez le bulletin avant de partir.",

  // Quoi de neuf : l'entrée du menu, la page /nouveautes et la version
  "common.version": "Version {version}",
  "common.nav.whatsNew.title": "Quoi de neuf",
  "common.nav.whatsNew.unseen": "Nouvelle version",
  "common.whatsNew.intro":
    "Ce qui a changé dans OhMyWind, de la version la plus récente à la plus ancienne. Le site et le serveur MCP partagent un même numéro de version, les applications mobiles ont le leur.",
  "common.whatsNew.current": "Version actuelle",
  "common.whatsNew.upcoming": "En préparation",
  "common.whatsNew.allReleases": "Toutes les versions sur GitHub",

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

  // Invitation à installer l'application, sur le site ouvert depuis un
  // téléphone. Jamais montrée dans les applications elles-mêmes.
  "common.install.title": "OhMyWind en application",
  "common.install.body":
    "Ouvrez la carte d'un geste depuis votre écran d'accueil, en plein écran, sans barre d'adresse. Gratuite, sans compte et open source.",
  "common.install.open.android": "Ouvrir Google Play",
  "common.install.open.ios": "Ouvrir l'App Store",
  "common.install.later": "Plus tard",
} as const;
