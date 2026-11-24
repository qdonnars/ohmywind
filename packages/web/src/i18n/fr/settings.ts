// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** Les Réglages : la feuille (ou fenêtre) à pile de vues, sa racine et la
    liste des langues. Les vues Modèles météo et Bateau reprennent encore les
    clés `config.*` de la page /config. Le titre « Réglages » lui-même est
    `common.nav.settings`, partagé avec le menu. */
export const settings = {
  "settings.done": "OK",
  "settings.group.device": "Appareil",
  "settings.group.map": "Carte",
  "settings.group.forecast": "Prévisions",
  "settings.theme.label": "Thème",
  "settings.theme.auto": "Auto",
  "settings.theme.light": "Clair",
  "settings.theme.dark": "Sombre",
  "settings.device.note": "Auto suit le réglage clair ou sombre de l'appareil.",
  "settings.keepAwake.subtitle": "Tant qu'un plan calculé est affiché",
  "settings.seamarks.label": "Balises et amers",
  "settings.seamarks.subtitle": "Bouées, balises et phares (OpenSeaMap)",
  "settings.seamarks.always": "Toujours",
  "settings.seamarks.never": "Jamais",
  "settings.map.note": "Sur les deux cartes, météo et planificateur.",
  "settings.models.summary": "Tableau : {models}",
  "settings.boat.summary": "{boat} · {percent}\u00a0%",
  "settings.boat.summaryMotor": "moteur sous {speed}\u00a0kn",
  "settings.boat.summaryImported": "polaire importée",

  // Bateau : les vues Bateau, Mon bateau et Avancé. Le reste de leurs
  // textes reprend les clés `config.boat.*` de la page /config.
  "settings.boat.intro":
    "Ces réglages nourrissent tous vos plans de passage. L'essentiel suffit pour bien commencer.",
  "settings.boat.types.note":
    "Chaque type porte sa polaire et son angle de près. Ajustez ensuite le coefficient.",
  "settings.boat.advanced.upwind": "près {deg}°",
  "settings.boat.upwind.manual": "Réglé à la main",
  "settings.boat.upwind.tighter": "Resserrer l'angle de près",
  "settings.boat.upwind.wider": "Ouvrir l'angle de près",
  "settings.boat.spi.lower": "Abaisser le seuil d'affalage",
  "settings.boat.spi.higher": "Relever le seuil d'affalage",
  "settings.boat.tuning.legend":
    "Pointillés : la courbe avant vos ajustements. Points jaunes : points ajustés. Au clavier, les flèches changent la vitesse d'un point de {step}\u00a0kn.",
  "settings.boat.point": "Angle {twa}°, {speed}\u00a0kn",
  "settings.boat.pointTuned": "Angle {twa}°, {speed}\u00a0kn, ajusté",

  "settings.forecast.note":
    "Les modèles remplissent le tableau de la carte ; le bateau sert à tous vos plans de passage.",
  "settings.storageNote":
    "OhMyWind n'a pas de compte : vos préférences restent sur cet appareil. Changer d'appareil ou effacer les données du site les fait disparaître.",
  "settings.lang.note":
    "Chaque langue est écrite dans sa propre langue, pour qu'un lecteur perdu reconnaisse la sienne.",

  // Modèles météo : la vue des Réglages (intro, repère du tableau,
  // poignées et leurs noms accessibles, toasts, réinitialisation).
  "settings.models.intro":
    "Les <b>{limit} premiers</b> s'affichent dans le tableau, dans cet ordre. Faites glisser la poignée pour réordonner : un modèle monté parmi eux fait descendre le dernier dans les ignorés.",
  "settings.models.headShown": "Utilisés dans l'app",
  "settings.models.headIgnored": "Ignorés en dessous",
  "settings.models.cut": "↑ Tableau · Ignorés ↓",
  "settings.models.meta": "{resolution}\u00a0km · ~{horizon} · {coverage}",
  "settings.models.position.shown": "{model}, rang {rank}, affiché",
  "settings.models.position.ignored": "{model}, rang {rank}, ignoré",
  "settings.models.handle.role": "poignée de déplacement",
  "settings.models.handle.hint":
    "Flèches haut et bas pour monter ou descendre d'un rang.",
  "settings.models.toast.swap":
    "{shown} affiché, {ignored} passe en ignorés",
  "settings.models.toast.reset": "Ordre par défaut rétabli",
  "settings.models.reset": "Réinitialiser l'ordre",
} as const;
