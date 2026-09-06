// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** La page d'exploration : carte, recherche de spot, tables vent et marine,
    panneau d'information. */
export const explore = {
  // App
  "explore.emptyState.touch":
    "Touchez la carte pour la météo, appui long pour enregistrer un spot",
  "explore.emptyState.click":
    "Cliquez la carte pour la météo, clic droit pour enregistrer un spot",
  "explore.planFab.title": "Planifier un passage",

  // Header
  "explore.header.settings": "Paramètres",

  // Bascule de thème (design/theme)
  "explore.theme.toDark": "Passer au thème sombre",
  "explore.theme.toLight": "Passer au thème clair",

  // Bandeau hors connexion
  "explore.offlineBanner.message":
    "Hors connexion : les prévisions ne peuvent pas être actualisées.",

  // Bouton d'information
  "explore.infoButton.title": "À propos",

  // Panneau d'information
  "explore.infoPanel.title": "À propos d'OhMyWind",
  "explore.infoPanel.disclaimer.title":
    "Aide à la décision, pas un instrument de navigation.",
  "explore.infoPanel.disclaimer.body":
    "OhMyWind ne remplace ni le bulletin météo marine officiel, ni des cartes à jour, ni votre jugement de chef de bord. Les modèles se trompent parfois : vous restez responsable de votre navigation.",
  "explore.infoPanel.project.title": "Le projet",
  "explore.infoPanel.project.body":
    "OhMyWind rend accessible une météo marine de qualité aux voileux. Les modèles AROME, ICON, GFS, ECMWF et les données de vagues, courants et marées sont publics et gratuits. Cette app les rassemble dans une vue lisible, sans compte ni installation.",
  "explore.infoPanel.privacy.title": "Vos données",
  "explore.infoPanel.privacy.body":
    "Aucun tracking, aucun compte, aucune donnée enregistrée vous concernant. Tout tourne dans votre navigateur, c'est une page de consultation pure. Les requêtes météo partent en direct vers les API publiques.",
  "explore.infoPanel.sources.title": "Sources des données et méthodologie",
  "explore.infoPanel.sources.body":
    "Modèles vent (AROME, ICON, ECMWF, GFS), vagues et niveau de la mer (Open-Meteo Marine, WaveWatch III), courants en cascade (SHOM Atlas C2D sur les passes critiques, MARC PREVIMER sur le plateau atlantique, SMOC Copernicus en repli global), conventions, équations de planification de passage et notation de complexité : tout est détaillé sur la page méthodologie.",
  "explore.infoPanel.sources.link": "Voir la méthodologie complète",
  "explore.infoPanel.sources.basemap":
    "Fonds de carte : <osm>© les contributeurs OpenStreetMap</osm> (données sous licence ODbL), tuiles <ofm>OpenFreeMap</ofm> sur le schéma <omt>© OpenMapTiles</omt>. Amers (bouées, balises, phares, feux) : <seamap>© les contributeurs OpenSeaMap</seamap>, tuiles sous licence CC BY-SA sur données OpenStreetMap. Cette couche est une aide à la préparation, pas un document de navigation : elle ne remplace pas les cartes officielles du SHOM ni les avis aux navigateurs. Recherche de lieux : <photon>Photon</photon> et Open-Meteo Geocoding, tous deux sur données OpenStreetMap.",
  "explore.infoPanel.sources.bathymetry":
    "Sondes sous les points de route : <emodnet>EMODnet Bathymetry</emodnet> (CC BY 4.0), rapportées au zéro hydrographique comme sur une carte marine. La grille fait environ 115 m : elle répond bien à « combien d'eau sur ce bord », et elle est aveugle au caillou isolé entre deux nœuds. À ne pas utiliser pour la navigation.",
  "explore.infoPanel.sources.privacy":
    "Aucun compte, aucun traqueur : <a>politique de confidentialité</a>.",
  "explore.infoPanel.licence.title": "Licence et marque",
  "explore.infoPanel.licence.body":
    "Le code d'OhMyWind est open source, sous <licence>licence AGPL-3.0</licence>. Vous pouvez le forker, le modifier et le redistribuer. Si vous exposez une version modifiée sur le réseau, vous devez en publier les sources. En revanche, le nom « OhMyWind » fait l'objet d'un dépôt de marque à l'INPI, et l'identité visuelle (logo, icônes) reste protégée par le droit d'auteur : un fork se publie sous son propre nom et ses propres icônes. Détails dans la <trademark>politique de marque</trademark>.",
  "explore.infoPanel.support.title": "Soutenir le projet",
  "explore.infoPanel.support.body":
    "Si vous adorez cette appli autant que moi, sachez qu'il faudra bientôt des serveurs dédiés pour la maintenir. Je n'ai pas envie de mettre de la pub dans cette app. Si vous non plus, n'hésitez pas à m'aider.",
  "explore.infoPanel.support.cta": "Soutenir sur Ko-fi",

  // Onglets de métrique
  "explore.pills.groupLabel": "Type de prévision",
  "explore.pills.wind": "Vent",
  "explore.pills.waves": "Vagues",
  "explore.pills.tides": "Marées",
  "explore.pills.currents": "Courants",

  // Table du vent
  "explore.windTable.empty": "Aucune donnée disponible pour ce point.",
  "explore.windTable.offline":
    "Hors connexion : impossible de récupérer les prévisions. Reconnectez-vous puis touchez à nouveau ce point.",
  "explore.windTable.fallbackTitle":
    "{description} (affiché à la place de {model}, qui ne couvre pas ce point).",
  "explore.windTable.fallbackBadge": "fallback depuis {model}",

  // Cellule de vent
  "explore.windCell.aria.speed": "{speed} nœuds",
  "explore.windCell.aria.speedGusts": "{speed} nœuds, rafales {gusts}",
  "explore.windCell.aria.speedDirection": "{speed} nœuds, direction {direction}°",
  "explore.windCell.aria.speedGustsDirection":
    "{speed} nœuds, rafales {gusts}, direction {direction}°",

  // Table marine
  "explore.marineTable.row.hs": "Hs",
  "explore.marineTable.row.direction": "Dir",
  "explore.marineTable.row.period": "T",
  "explore.marineTable.row.tide": "Marée",
  "explore.marineTable.row.current": "Cour.",
  "explore.marineTable.aria.hs": "Hs {value} m",
  "explore.marineTable.aria.hsFrom": "Hs {value} m, venant de {dir}°",
  "explore.marineTable.aria.waveDirection": "Direction des vagues, venant de {dir}°",
  "explore.marineTable.aria.currentDirection": "Courant portant vers {dir}°",
  "explore.marineTable.aria.wavePeriod": "Période des vagues {value} s",
  "explore.marineTable.aria.tide": "Marée {value} {unit}",
  "explore.marineTable.aria.tideRising": "Marée {value} {unit}, montante",
  "explore.marineTable.aria.tideFalling": "Marée {value} {unit}, descendante",
  "explore.marineTable.aria.current": "Courant {value} kn",

  // Courbe de marée
  "explore.tideChart.curve": "Courbe de marée",

  // Onboarding
  "explore.onboarding.title": "Planifier une route ?",
  "explore.onboarding.body":
    "Pour tracer un trajet entre deux spots et estimer la durée, cliquez sur le compas.",
  "explore.onboarding.dismiss": "Compris",

  // Recherche de spot
  "explore.spotSearch.label": "Rechercher un lieu",
  "explore.spotSearch.placeholder": "Port, cap, chenal ou coordonnées",
  "explore.spotSearch.results": "Résultats de recherche",
  "explore.spotSearch.searching": "Recherche...",
  "explore.spotSearch.failed": "Recherche indisponible. Vérifiez votre connexion.",
  "explore.spotSearch.empty": "Aucun lieu trouvé.",
  "explore.spotSearch.goToPosition": "Aller à cette position",

  // Dialogues de spot
  "explore.spotDialogs.options": "Options du spot",
  "explore.spotDialogs.rename": "Renommer",
  "explore.spotDialogs.delete": "Supprimer",
  "explore.spotDialogs.renameTitle": "Renommer le spot",
  "explore.spotDialogs.createTitle": "Nouveau spot",
  "explore.spotDialogs.nameLabel": "Nom du spot",
  "explore.spotDialogs.create": "Créer",

  // Spots rapides
  "explore.quickSpots.remove": "Supprimer",
  "explore.quickSpots.save": "+ Sauvegarder {name}",

  // Bouton de localisation
  "explore.locate.label": "Centrer sur ma position",
  "explore.locate.dismiss": "Fermer ce message",

  // Bouton des amers
  "explore.seamarks.show": "Afficher les amers : bouées, balises et phares",
  "explore.seamarks.hide": "Masquer les amers",

  // Géolocalisation
  "explore.geoloc.denied":
    "Position refusée. Autorisez la localisation dans les réglages de votre navigateur.",
  "explore.geoloc.unavailable":
    "Position indisponible. Vérifiez que la localisation est activée sur votre appareil.",
  "explore.geoloc.timeout": "La position met trop de temps à arriver. Réessayez.",

  // Résultats de lieux
  "explore.places.saved": "Spot enregistré",
  "explore.places.distanceUnderOne": "à moins d'1 nm",
  "explore.places.distance": "à {value} nm",

  // Coordonnées saisies dans la recherche
  "explore.coordinates.north": "N",
  "explore.coordinates.south": "S",
  "explore.coordinates.east": "E",
  "explore.coordinates.west": "O",

  // Types de lieux renvoyés par le géocodeur
  "explore.geocoding.context": "{feature}, {admin}",
  "explore.geocoding.feature.fairway": "Chenal",
  "explore.geocoding.feature.strait": "Passage",
  "explore.geocoding.feature.cape": "Cap",
  "explore.geocoding.feature.bay": "Baie",
  "explore.geocoding.feature.reef": "Récif",
  "explore.geocoding.feature.shoal": "Haut-fond",
  "explore.geocoding.feature.peninsula": "Presqu'île",
  "explore.geocoding.feature.beach": "Plage",
  "explore.geocoding.feature.island": "Île",
  "explore.geocoding.feature.islet": "Îlot",
  "explore.geocoding.feature.archipelago": "Archipel",
} as const;
