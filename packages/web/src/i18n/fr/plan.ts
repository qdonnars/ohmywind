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
  "plan.page.hint.placeStart": "Cliquez pour placer le départ",
  "plan.page.hint.drawRoute": "Cliquez pour tracer votre route",
  "plan.panel.resize": "Redimensionner le panneau",

  // ── Totaux : bloc du panneau et bandeau mobile ────────────────────────────
  "plan.hero.distance": "Distance",
  "plan.hero.duration": "Durée",
  "plan.hero.arrival": "Arrivée",

  // ── Barre des segments, sous les totaux ───────────────────────────────────
  "plan.segmentBar.groupLabel": "Pas du passage, un clic ouvre le pas",
  "plan.segmentBar.progressLabel": "Distribution du vent par segment",
  "plan.segmentBar.stepLabel":
    "Tronçon {from}→{to}, pas {index} sur {total}, {start} → {end}, {tws} kn",
  "plan.segmentBar.timeLabel": "{start} → {end}, {tws} kn",

  // ── Etats du panneau ──────────────────────────────────────────────────────
  "plan.states.empty.title": "Tracez votre trajet",
  "plan.states.empty.body":
    "Cliquez sur la carte pour placer un départ et une arrivée. Vous pourrez ensuite calculer le passage, puis comparer d'autres départs ou d'autres itinéraires.",
  "plan.states.error.title": "Erreur",
  "plan.states.waking.title": "Le serveur météo se réveille",
  "plan.states.waking.body":
    "Il était en veille : le calcul repart tout seul dans {seconds} s (essai {attempt} sur {max}).",
  "plan.states.waking.retryNow": "Réessayer maintenant",
  "plan.recap.edit": "Modifier",

  // ── Selecteur de mode et ancrage horaire ──────────────────────────────────
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
  "plan.map.waypoint.removed": "Point {n} retiré",
  "plan.map.waypoint.undo": "Annuler",

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
  // The passage engine's warnings, by the code the server sends with each
  // one (see plan/notices.ts). Word for word the sentences the server itself
  // writes in French, so a French reader sees no change; the values are the
  // server's, already formatted.
  "plan.notice.passage.long_route":
    "trajet long ({route_nm} nm) : {points} points météo échantillonnés (~{spacing_nm} nm entre points) au lieu de {requested_nm} nm pour limiter les requêtes API.",
  "plan.notice.passage.light_wind":
    "vent faible : vitesse mini {min_speed_kn} kn, passage très lent",
  "plan.notice.passage.model_fallback":
    "modèle {model} sans données sur {fallback_count}/{total} points (probable hors zone de couverture) ; fallback automatique sur {others}",
  "plan.notice.currents.tidal_gap": "courants de marée probablement forts ({zones}) et non résolus par nos sources : les courants annoncés viennent d'un modèle global à 8 km qui ne les voit pas. Nous travaillons à élargir la couverture, mais les données ne sont pas toutes en libre accès.",
  "plan.notice.complexity.wind.3": "Vent soutenu : TWS {tws_range} kn sur {nm} nm",
  "plan.notice.complexity.wind.4": "Vent fort : TWS {tws_range} kn sur {nm} nm",
  "plan.notice.complexity.wind.5": "Vent très fort : TWS {tws_range} kn sur {nm} nm",
  "plan.notice.complexity.sea.3": "Mer agitée : Hs {hs_range} m sur {nm} nm",
  "plan.notice.complexity.sea.4": "Mer forte : Hs {hs_range} m sur {nm} nm",
  "plan.notice.complexity.sea.5": "Mer très forte : Hs {hs_range} m sur {nm} nm",
  "plan.notice.complexity.current":
    "Vent contre courant : courant {current_range} kt opposé sur {nm} nm, mer hachée probable",
  "plan.notice.complexity.chop_short":
    "Clapot court : Hs {hs_range} m à Tp {tp_range} s sur {nm} nm, mer désagréable",
  "plan.notice.complexity.chop_following":
    "Clapot suiveur : Hs {hs_range} m à Tp {tp_range} s sur {nm} nm",
  "plan.notice.sweep.widened_interval":
    "pas d'échantillonnage élargi à {effective_h} h (au lieu de {requested_h} h) : la route compte {segments} tronçons, trop pour simuler autant de créneaux.",
  "plan.notice.sweep.skipped_windows":
    "{skipped} fenêtre(s) ignorée(s) faute de couverture météo (horizon dépassé) : affichage des {kept} restantes.",
  "plan.notice.sweep.no_window_near_eta":
    "aucune fenêtre n'arrive dans ±2h de target_eta={target_eta} ; toutes les {count} fenêtres retournées",
} as const;
