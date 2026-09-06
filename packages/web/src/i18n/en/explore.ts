// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { explore as frExplore } from "../fr/explore";

export const explore: Record<keyof typeof frExplore, string> = {
  // App
  "explore.emptyState.touch":
    "Tap the map for the forecast, press and hold to save a spot",
  "explore.emptyState.click":
    "Click the map for the forecast, right-click to save a spot",
  "explore.planFab.title": "Plan a passage",

  // Header
  "explore.header.settings": "Settings",

  // Theme toggle (design/theme)
  "explore.theme.toDark": "Switch to dark theme",
  "explore.theme.toLight": "Switch to light theme",

  // Offline banner
  "explore.offlineBanner.message": "Offline: forecasts cannot be refreshed.",

  // Info button
  "explore.infoButton.title": "About",

  // Info panel
  "explore.infoPanel.title": "About OhMyWind",
  "explore.infoPanel.disclaimer.title":
    "A decision aid, not a navigation instrument.",
  "explore.infoPanel.disclaimer.body":
    "OhMyWind replaces neither the official marine weather bulletin, nor up-to-date charts, nor your own judgement as skipper. Models get it wrong sometimes: you remain responsible for your navigation.",
  "explore.infoPanel.project.title": "The project",
  "explore.infoPanel.project.body":
    "OhMyWind puts good marine weather within reach of sailors. The AROME, ICON, GFS and ECMWF models, along with wave, current and tide data, are public and free. This app brings them together in one readable view, with no account and no install.",
  "explore.infoPanel.privacy.title": "Your data",
  "explore.infoPanel.privacy.body":
    "No tracking, no account, no data recorded about you. Everything runs in your browser, this is a pure reading page. Weather requests go straight to the public APIs.",
  "explore.infoPanel.sources.title": "Data sources and methodology",
  "explore.infoPanel.sources.body":
    "Wind models (AROME, ICON, ECMWF, GFS), waves and sea level (Open-Meteo Marine, WaveWatch III), currents in cascade (SHOM Atlas C2D over the critical passes, MARC PREVIMER over the Atlantic shelf, SMOC Copernicus as the global fallback), conventions, passage planning equations and complexity scoring: it is all set out on the methodology page.",
  "explore.infoPanel.sources.link": "Read the full methodology",
  "explore.infoPanel.sources.basemap":
    "Base maps: <osm>© OpenStreetMap contributors</osm> (data under the ODbL licence), tiles <ofm>OpenFreeMap</ofm> on the <omt>© OpenMapTiles</omt> schema. Sea marks (buoys, beacons, lighthouses, lights): <seamap>© OpenSeaMap contributors</seamap>, tiles under CC BY-SA on OpenStreetMap data. This layer is an aid to preparation, not a navigation document: it replaces neither the official SHOM charts nor the notices to mariners. Place search: <photon>Photon</photon> and Open-Meteo Geocoding, both on OpenStreetMap data.",
  "explore.infoPanel.sources.bathymetry":
    "Soundings under the waypoints: <emodnet>EMODnet Bathymetry</emodnet> (CC BY 4.0), referenced to chart datum as on a nautical chart. The grid is about 115 m: it answers “how much water on this leg” well, and it is blind to the isolated rock between two nodes. Not to be used for navigation.",
  "explore.infoPanel.sources.privacy":
    "No account, no tracker: <a>privacy policy</a>.",
  "explore.infoPanel.licence.title": "Licence and trade mark",
  "explore.infoPanel.licence.body":
    "The OhMyWind code is open source, under the <licence>AGPL-3.0 licence</licence>. You may fork it, modify it and redistribute it. If you expose a modified version over the network, you must publish its sources. The name “OhMyWind”, however, is the subject of a trade mark filing with the INPI, and the visual identity (logo, icons) remains protected by copyright: a fork is published under its own name and its own icons. Details in the <trademark>trade mark policy</trademark>.",
  "explore.infoPanel.support.title": "Support the project",
  "explore.infoPanel.support.body":
    "If you love this app as much as I do, know that dedicated servers will soon be needed to keep it running. I have no wish to put adverts in it. If you feel the same, your help is welcome.",
  "explore.infoPanel.support.cta": "Support on Ko-fi",

  // Metric pills
  "explore.pills.groupLabel": "Forecast metric",
  "explore.pills.wind": "Wind",
  "explore.pills.waves": "Waves",
  "explore.pills.tides": "Tides",
  "explore.pills.currents": "Currents",

  // Wind table
  "explore.windTable.empty": "No data available for this point.",
  "explore.windTable.offline":
    "Offline: the forecasts cannot be fetched. Reconnect, then tap this point again.",
  "explore.windTable.fallbackTitle":
    "{description} (shown in place of {model}, which does not cover this point).",
  "explore.windTable.fallbackBadge": "fallback from {model}",

  // Wind cell
  "explore.windCell.aria.speed": "{speed} knots",
  "explore.windCell.aria.speedGusts": "{speed} knots, gusts {gusts}",
  "explore.windCell.aria.speedDirection": "{speed} knots, direction {direction}°",
  "explore.windCell.aria.speedGustsDirection":
    "{speed} knots, gusts {gusts}, direction {direction}°",

  // Marine table
  "explore.marineTable.row.hs": "Hs",
  "explore.marineTable.row.direction": "Dir",
  "explore.marineTable.row.period": "T",
  "explore.marineTable.row.tide": "Tide",
  "explore.marineTable.row.current": "Curr.",
  "explore.marineTable.aria.hs": "Hs {value} m",
  "explore.marineTable.aria.hsFrom": "Hs {value} m, from {dir}°",
  "explore.marineTable.aria.waveDirection": "Wave direction, from {dir}°",
  "explore.marineTable.aria.currentDirection": "Current setting towards {dir}°",
  "explore.marineTable.aria.wavePeriod": "Wave period {value} s",
  "explore.marineTable.aria.tide": "Tide {value} {unit}",
  "explore.marineTable.aria.tideRising": "Tide {value} {unit}, rising",
  "explore.marineTable.aria.tideFalling": "Tide {value} {unit}, falling",
  "explore.marineTable.aria.current": "Current {value} kn",

  // Tide curve
  "explore.tideChart.curve": "Tide curve",

  // Onboarding
  "explore.onboarding.title": "Plan a route?",
  "explore.onboarding.body":
    "To lay out a passage between two spots and estimate how long it takes, click the compass.",
  "explore.onboarding.dismiss": "Got it",

  // Spot search
  "explore.spotSearch.label": "Search for a place",
  "explore.spotSearch.placeholder": "Harbour, cape, channel or coordinates",
  "explore.spotSearch.results": "Search results",
  "explore.spotSearch.searching": "Searching...",
  "explore.spotSearch.failed": "Search unavailable. Check your connection.",
  "explore.spotSearch.empty": "No place found.",
  "explore.spotSearch.goToPosition": "Go to this position",

  // Spot dialogs
  "explore.spotDialogs.options": "Spot options",
  "explore.spotDialogs.rename": "Rename",
  "explore.spotDialogs.delete": "Delete",
  "explore.spotDialogs.renameTitle": "Rename spot",
  "explore.spotDialogs.createTitle": "New spot",
  "explore.spotDialogs.nameLabel": "Spot name",
  "explore.spotDialogs.create": "Create",

  // Quick spots
  "explore.quickSpots.remove": "Delete",
  "explore.quickSpots.save": "+ Save {name}",

  // Locate button
  "explore.locate.label": "Centre on my position",
  "explore.locate.dismiss": "Dismiss this message",

  // Sea marks button
  "explore.seamarks.show": "Show sea marks: buoys, beacons and lighthouses",
  "explore.seamarks.hide": "Hide sea marks",

  // Geolocation
  "explore.geoloc.denied":
    "Location refused. Allow location access in your browser settings.",
  "explore.geoloc.unavailable":
    "Location unavailable. Check that location services are on for your device.",
  "explore.geoloc.timeout": "The position is taking too long to arrive. Try again.",

  // Place results
  "explore.places.saved": "Saved spot",
  "explore.places.distanceUnderOne": "less than 1 nm away",
  "explore.places.distance": "{value} nm away",

  // Coordinates typed into the search box
  "explore.coordinates.north": "N",
  "explore.coordinates.south": "S",
  "explore.coordinates.east": "E",
  "explore.coordinates.west": "W",

  // Place kinds returned by the geocoder
  "explore.geocoding.context": "{feature}, {admin}",
  "explore.geocoding.feature.fairway": "Fairway",
  "explore.geocoding.feature.strait": "Strait",
  "explore.geocoding.feature.cape": "Cape",
  "explore.geocoding.feature.bay": "Bay",
  "explore.geocoding.feature.reef": "Reef",
  "explore.geocoding.feature.shoal": "Shoal",
  "explore.geocoding.feature.peninsula": "Peninsula",
  "explore.geocoding.feature.beach": "Beach",
  "explore.geocoding.feature.island": "Island",
  "explore.geocoding.feature.islet": "Islet",
  "explore.geocoding.feature.archipelago": "Archipelago",
};
