// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { explore as frExplore } from "../fr/explore";

export const explore: Record<keyof typeof frExplore, string> = {
  // App
  "explore.emptyState.touch":
    "Karte antippen für das Wetter, lange drücken zum Speichern eines Spots",
  "explore.emptyState.click":
    "Karte klicken für das Wetter, Rechtsklick zum Speichern eines Spots",
  "explore.planFab.title": "Törn planen",

  // Header
  "explore.header.settings": "Einstellungen",

  // Theme toggle (design/theme)
  "explore.theme.toDark": "Zum dunklen Design wechseln",
  "explore.theme.toLight": "Zum hellen Design wechseln",

  // Offline banner
  "explore.offlineBanner.message": "Offline: Vorhersagen können nicht aktualisiert werden.",

  // Info button
  "explore.infoButton.title": "Über",

  // Info panel
  "explore.infoPanel.title": "Über OhMyWind",
  "explore.infoPanel.disclaimer.title": "Entscheidungshilfe, kein Navigationsinstrument.",
  "explore.infoPanel.disclaimer.body":
    "OhMyWind ersetzt weder den amtlichen Seewetterbericht noch aktuelle Seekarten noch Ihr eigenes Urteil als Skipper. Modelle liegen manchmal falsch: Die Verantwortung für Ihre Navigation bleibt bei Ihnen.",
  "explore.infoPanel.project.title": "Das Projekt",
  "explore.infoPanel.project.body":
    "OhMyWind macht gutes Seewetter für Segler zugänglich. Die Modelle AROME, ICON, GFS und ECMWF sowie die Daten zu Wellen, Strom und Tiden sind öffentlich und kostenlos. Diese App bringt sie in einer lesbaren Ansicht zusammen, ohne Konto und ohne Installation.",
  "explore.infoPanel.privacy.title": "Ihre Daten",
  "explore.infoPanel.privacy.body":
    "Kein Tracking, kein Konto, keine über Sie gespeicherten Daten. Alles läuft in Ihrem Browser, dies ist eine reine Leseseite. Die Wetteranfragen gehen direkt an die öffentlichen APIs.",
  "explore.infoPanel.sources.title": "Datenquellen und Methodik",
  "explore.infoPanel.sources.body":
    "Windmodelle (AROME, ICON, ECMWF, GFS), Wellen und Meeresspiegel (Open-Meteo Marine, WaveWatch III), Strom in Kaskade (SHOM Atlas C2D an den kritischen Passagen, MARC PREVIMER über dem atlantischen Schelf, SMOC Copernicus als globaler Fallback), Konventionen, Gleichungen der Törnplanung und Komplexitätsbewertung: Das alles steht ausführlich auf der Seite zur Methodik.",
  "explore.infoPanel.sources.link": "Die vollständige Methodik lesen",
  "explore.infoPanel.sources.basemap":
    "Kartengrundlagen: <osm>© OpenStreetMap-Mitwirkende</osm> (Daten unter der Lizenz ODbL), Kacheln <ofm>OpenFreeMap</ofm> nach dem Schema <omt>© OpenMapTiles</omt>. Seezeichen (Tonnen, Baken, Leuchttürme, Feuer): <seamap>© OpenSeaMap-Mitwirkende</seamap>, Kacheln unter der Lizenz CC BY-SA auf OpenStreetMap-Daten. Diese Ebene hilft bei der Vorbereitung, sie ist kein Navigationsdokument: Sie ersetzt weder die amtlichen Seekarten des SHOM noch die Nachrichten für Seefahrer. Ortssuche: <photon>Photon</photon> und Open-Meteo Geocoding, beide auf OpenStreetMap-Daten.",
  "explore.infoPanel.sources.bathymetry":
    "Wassertiefen unter den Wegpunkten: <emodnet>EMODnet Bathymetry</emodnet> (CC BY 4.0), bezogen auf Kartennull wie auf einer Seekarte. Das Gitter misst rund 115 m: Es beantwortet gut „wie viel Wasser auf diesem Schlag“, und es ist blind für den einzelnen Felsen zwischen zwei Gitterpunkten. Nicht für die Navigation verwenden.",
  "explore.infoPanel.sources.privacy":
    "Kein Konto, kein Tracker: <a>Datenschutzerklärung</a>.",
  "explore.infoPanel.licence.title": "Lizenz und Marke",
  "explore.infoPanel.licence.body":
    "Der Code von OhMyWind ist Open Source, unter der <licence>Lizenz AGPL-3.0</licence>. Sie dürfen ihn forken, ändern und weitergeben. Wenn Sie eine geänderte Fassung über das Netz bereitstellen, müssen Sie deren Quelltext veröffentlichen. Der Name „OhMyWind“ ist dagegen als Marke beim INPI angemeldet, und die visuelle Identität (Logo, Symbole) bleibt urheberrechtlich geschützt: Ein Fork erscheint unter eigenem Namen und mit eigenen Symbolen. Einzelheiten in der <trademark>Markenrichtlinie</trademark>.",
  "explore.infoPanel.support.title": "Das Projekt unterstützen",
  "explore.infoPanel.support.body":
    "Wenn Sie diese App so mögen wie ich, sollten Sie wissen, dass es bald eigene Server braucht, um sie am Laufen zu halten. Ich möchte keine Werbung in dieser App. Wenn es Ihnen genauso geht, helfen Sie mir gern dabei.",
  "explore.infoPanel.support.cta": "Auf Ko-fi unterstützen",

  // Metric pills
  "explore.pills.groupLabel": "Art der Vorhersage",
  "explore.pills.wind": "Wind",
  "explore.pills.waves": "Wellen",
  "explore.pills.tides": "Tiden",
  "explore.pills.currents": "Strom",

  // Wind table
  "explore.windTable.empty": "Für diesen Punkt sind keine Daten verfügbar.",
  "explore.windTable.offline":
    "Offline: Die Vorhersagen können nicht abgerufen werden. Stellen Sie die Verbindung wieder her und tippen Sie diesen Punkt erneut an.",
  "explore.windTable.fallbackTitle":
    "{description} (anstelle von {model} angezeigt, das diesen Punkt nicht abdeckt).",
  "explore.windTable.fallbackBadge": "Fallback von {model}",

  // Wind cell
  "explore.windCell.aria.speed": "{speed} Knoten",
  "explore.windCell.aria.speedGusts": "{speed} Knoten, Böen {gusts}",
  "explore.windCell.aria.speedDirection": "{speed} Knoten, Richtung {direction}°",
  "explore.windCell.aria.speedGustsDirection":
    "{speed} Knoten, Böen {gusts}, Richtung {direction}°",

  // Marine table
  "explore.marineTable.row.hs": "Hs",
  "explore.marineTable.row.direction": "Ri.",
  "explore.marineTable.row.period": "T",
  "explore.marineTable.row.tide": "Tide",
  "explore.marineTable.row.current": "Str.",
  "explore.marineTable.aria.hs": "Hs {value} m",
  "explore.marineTable.aria.hsFrom": "Hs {value} m, aus {dir}°",
  "explore.marineTable.aria.waveDirection": "Wellenrichtung, aus {dir}°",
  "explore.marineTable.aria.currentDirection": "Strom setzt nach {dir}°",
  "explore.marineTable.aria.wavePeriod": "Wellenperiode {value} s",
  "explore.marineTable.aria.tide": "Tide {value} {unit}",
  "explore.marineTable.aria.tideRising": "Tide {value} {unit}, auflaufend",
  "explore.marineTable.aria.tideFalling": "Tide {value} {unit}, ablaufend",
  "explore.marineTable.aria.current": "Strom {value} kn",

  // Tide curve
  "explore.tideChart.curve": "Tidenkurve",

  // Onboarding
  "explore.onboarding.title": "Eine Route planen?",
  "explore.onboarding.body":
    "Um einen Weg zwischen zwei Spots zu zeichnen und die Dauer abzuschätzen, klicken Sie auf den Kompass.",
  "explore.onboarding.dismiss": "Verstanden",

  // Spot search
  "explore.spotSearch.label": "Ort suchen",
  "explore.spotSearch.placeholder": "Hafen, Kap, Fahrwasser oder Koordinaten",
  "explore.spotSearch.results": "Suchergebnisse",
  "explore.spotSearch.searching": "Suche...",
  "explore.spotSearch.failed": "Suche nicht verfügbar. Prüfen Sie Ihre Verbindung.",
  "explore.spotSearch.empty": "Kein Ort gefunden.",
  "explore.spotSearch.goToPosition": "Zu dieser Position springen",

  // Spot dialogs
  "explore.spotDialogs.options": "Spot-Optionen",
  "explore.spotDialogs.rename": "Umbenennen",
  "explore.spotDialogs.delete": "Löschen",
  "explore.spotDialogs.renameTitle": "Spot umbenennen",
  "explore.spotDialogs.createTitle": "Neuer Spot",
  "explore.spotDialogs.nameLabel": "Name des Spots",
  "explore.spotDialogs.create": "Erstellen",

  // Quick spots
  "explore.quickSpots.remove": "Löschen",
  "explore.quickSpots.save": "+ {name} speichern",

  // Locate button
  "explore.locate.label": "Auf meine Position zentrieren",
  "explore.locate.dismiss": "Diese Meldung schließen",

  // Sea marks button
  "explore.seamarks.show": "Seezeichen anzeigen: Tonnen, Baken und Leuchttürme",
  "explore.seamarks.hide": "Seezeichen ausblenden",

  // Geolocation
  "explore.geoloc.denied":
    "Standort abgelehnt. Erlauben Sie die Standortbestimmung in den Einstellungen Ihres Browsers.",
  "explore.geoloc.unavailable":
    "Standort nicht verfügbar. Prüfen Sie, ob die Standortbestimmung auf Ihrem Gerät aktiviert ist.",
  "explore.geoloc.timeout": "Der Standort braucht zu lange. Versuchen Sie es erneut.",

  // Place results
  "explore.places.saved": "Gespeicherter Spot",
  "explore.places.distanceUnderOne": "weniger als 1 nm entfernt",
  "explore.places.distance": "{value} nm entfernt",

  // Coordinates typed into the search box
  "explore.coordinates.north": "N",
  "explore.coordinates.south": "S",
  "explore.coordinates.east": "E",
  "explore.coordinates.west": "W",

  // Place kinds returned by the geocoder
  "explore.geocoding.context": "{feature}, {admin}",
  "explore.geocoding.feature.fairway": "Fahrwasser",
  "explore.geocoding.feature.strait": "Meerenge",
  "explore.geocoding.feature.cape": "Kap",
  "explore.geocoding.feature.bay": "Bucht",
  "explore.geocoding.feature.reef": "Riff",
  "explore.geocoding.feature.shoal": "Untiefe",
  "explore.geocoding.feature.peninsula": "Halbinsel",
  "explore.geocoding.feature.beach": "Strand",
  "explore.geocoding.feature.island": "Insel",
  "explore.geocoding.feature.islet": "Eiland",
  "explore.geocoding.feature.archipelago": "Archipel",
};
