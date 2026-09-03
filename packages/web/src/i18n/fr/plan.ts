// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Le coeur du planificateur `/plan` : la page, ses etats, la carte, le
 * selecteur de mode, la bande des pas, la lecture de l'URL et les erreurs de
 * l'API passage. Le panneau lui-meme (`plan/sidebar/`) porte ses cles dans
 * `panel`.
 */
export const plan = {
  // ── PlanPage ──────────────────────────────────────────────────────────────
  "plan.page.urlError.title": "URL invalide",
  "plan.page.urlError.back": "← Explorer la météo",
  "plan.page.backToExplore": "Retour à l'exploration",
  "plan.page.hint.placeStart": "Cliquez pour placer le départ",
  "plan.page.hint.drawRoute": "Cliquez pour tracer votre route",
  "plan.panel.resize": "Redimensionner le panneau",

  // ── Totaux : bloc du panneau et bandeau mobile ────────────────────────────
  "plan.hero.distance": "Distance",
  "plan.hero.duration": "Durée",
  "plan.hero.arrival": "Arrivée",
  "plan.hero.openDetail": "Voir le détail du passage",

  // ── Barre des segments, sous les totaux ───────────────────────────────────
  "plan.segmentBar.groupLabel": "Pas du passage, un clic ouvre le pas",
  "plan.segmentBar.progressLabel": "Distribution du vent par segment",
  "plan.segmentBar.stepLabel":
    "Tronçon {from}→{to}, pas {index} sur {total}, {start} → {end}, {tws} kn",
  "plan.segmentBar.timeLabel": "{start} → {end}, {tws} kn",

  // ── Etats du panneau ──────────────────────────────────────────────────────
  "plan.states.empty.title": "Tracez votre trajet",
  "plan.states.empty.body":
    "Cliquez sur la carte pour placer un départ et une arrivée. Vous pourrez ensuite simuler le temps du trajet ou comparer plusieurs créneaux de départ.",
  "plan.states.picker.title": "Que voulez-vous faire ?",
  "plan.states.picker.single.body":
    "Vous savez quand partir. OhMyWind calcule le temps du trajet, l'ETA et les conditions sur chaque segment.",
  "plan.states.picker.single.example": "Ex. : « Si je pars samedi 17:00, j'arrive quand ? »",
  "plan.states.picker.compare.body":
    "Vous savez où aller. OhMyWind teste plusieurs heures de départ et classe les créneaux par confort.",
  "plan.states.picker.compare.example":
    "Ex. : « Quel est le meilleur départ entre samedi et lundi ? »",
  "plan.states.error.title": "Erreur",
  "plan.recap.edit": "Modifier",

  // ── Selecteur de mode et ancrage horaire ──────────────────────────────────
  "plan.mode.tablist": "Mode de planification",
  "plan.mode.single.title": "Simuler ma route",
  "plan.mode.single.sub": "Combien de temps pour ce trajet ?",
  "plan.mode.compare.title": "Comparer les fenêtres",
  "plan.mode.compare.sub": "Le meilleur créneau pour partir ?",
  "plan.timeAnchor.tablist": "Ancrage horaire",
  "plan.timeAnchor.departure.title": "Définir le départ",
  "plan.timeAnchor.departure.sub": "Comprendre le temps de trajet",
  "plan.timeAnchor.arrival.title": "Définir l'arrivée",
  "plan.timeAnchor.arrival.sub": "Quand partir au plus tard ?",

  // ── Bande des pas d'un tronçon ────────────────────────────────────────────
  "plan.steps.groupLabel": "Pas de calcul du tronçon",
  "plan.steps.stepLabel": "Pas {index} sur {total}, {time}",
  "plan.steps.viewToggle.label": "Affichage du tronçon",
  "plan.steps.viewToggle.average": "Moyenne",
  "plan.steps.viewToggle.detail": "Détail",

  // ── Carte ─────────────────────────────────────────────────────────────────
  "plan.map.waypoint.remove": "Supprimer ce point",

  // ── Validation de la fenêtre de comparaison ───────────────────────────────
  "plan.sweep.errors.missingWindow": "Renseignez une fenêtre de départ.",
  "plan.sweep.errors.invalidDates": "Dates invalides.",
  "plan.sweep.errors.latestBeforeEarliest":
    "Le « plus tard » doit être après le « plus tôt ».",
  "plan.sweep.errors.beyondHorizon":
    "La météo n'est fiable que sur {days} jours. Choisissez une date plus tôt.",
  "plan.sweep.errors.tooManyWindows":
    "Trop de créneaux à comparer ({windows}). Réduisez la fenêtre ou augmentez le pas.",

  // ── Lecture de l'URL ──────────────────────────────────────────────────────
  "plan.url.errors.tooFewWaypoints": "Au moins 2 waypoints requis",
  "plan.url.errors.invalidWaypoint": 'waypoint invalide: "{value}"',
  "plan.url.errors.latitudeOutOfRange": "latitude hors plage: {value}",
  "plan.url.errors.longitudeOutOfRange": "longitude hors plage: {value}",
  "plan.url.errors.invalidWaypoints": "Waypoints invalides: {detail}",

  // ── Erreurs de l'API passage ──────────────────────────────────────────────
  "plan.api.errors.retryDelay.vague": "Patientez quelques minutes avant de relancer.",
  "plan.api.errors.retryDelay.seconds.one": "Patientez {count} seconde avant de relancer.",
  "plan.api.errors.retryDelay.seconds.other": "Patientez {count} secondes avant de relancer.",
  "plan.api.errors.retryDelay.minutes.one": "Patientez {count} minute avant de relancer.",
  "plan.api.errors.retryDelay.minutes.other": "Patientez {count} minutes avant de relancer.",
  "plan.api.errors.serverStatus": "Erreur serveur {status}",
  "plan.api.errors.forecastHorizon":
    "Le service météo n'a pas pu couvrir cette période. Choisissez une date plus proche (jusqu'à environ 10 jours selon le modèle). Pour préserver votre planification, ne rechargez pas la page tant que vous n'avez pas ajusté la date.",
  "plan.api.errors.tooFewWaypoints":
    "Placez au moins 2 waypoints sur la carte pour calculer une route.",
  "plan.api.errors.waypointOutOfRange":
    "Un waypoint est hors des coordonnées valides. Replacez-le sur la carte.",
  "plan.api.errors.tooManyWaypoints":
    "Trop de waypoints sur cette route. Retirez-en quelques-uns pour la simplifier.",
  "plan.api.errors.rateLimited": "Trop de calculs lancés coup sur coup. {delay}",
  "plan.api.errors.unknownArchetype":
    "Type de bateau inconnu. Sélectionnez un archétype dans la liste.",
  "plan.api.errors.invalidDatetime": "Date invalide. Vérifiez le format des champs date.",
  "plan.api.errors.naiveDatetime": "L'heure d'arrivée doit inclure le fuseau horaire.",
  "plan.api.errors.sweepTooLarge":
    "Trop de créneaux à comparer. Réduisez la fenêtre ou augmentez le pas d'échantillonnage.",
  "plan.api.errors.upstreamTimeout":
    "Le service météo a mis trop de temps à répondre. Réessayez dans quelques instants.",
  "plan.api.errors.upstreamRateLimited":
    "Le service météo limite temporairement nos requêtes. Ce n'est pas lié à votre usage, réessayez dans quelques minutes.",
  "plan.api.errors.upstreamUnavailable":
    "Le serveur est momentanément injoignable, il redémarre peut-être. {delay}",
  "plan.api.errors.bodyTooLarge":
    "La route est trop détaillée pour être envoyée. Retirez quelques waypoints ou raccourcissez la période.",
  "plan.api.errors.invalidForecastCache":
    "Les données météo préparées par le navigateur ont été refusées. Réessayez : le calcul repartira des données du serveur.",
  "plan.api.errors.serverUnavailable":
    "Le serveur météo est indisponible. Réessayez dans quelques instants.",
  "plan.api.errors.networkUnreachable":
    "Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.",
  "plan.api.errors.invalidResponse":
    "Le serveur a renvoyé une réponse inattendue. Réessayez dans quelques instants.",
} as const;
