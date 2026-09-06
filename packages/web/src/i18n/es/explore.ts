// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { explore as frExplore } from "../fr/explore";

export const explore: Record<keyof typeof frExplore, string> = {
  // App
  "explore.emptyState.touch":
    "Toque el mapa para ver la previsión, mantenga pulsado para guardar un spot",
  "explore.emptyState.click":
    "Haga clic en el mapa para ver la previsión, clic derecho para guardar un spot",
  "explore.planFab.title": "Planificar una travesía",

  // Header
  "explore.header.settings": "Ajustes",

  // Theme toggle (design/theme)
  "explore.theme.toDark": "Cambiar al tema oscuro",
  "explore.theme.toLight": "Cambiar al tema claro",

  // Offline banner
  "explore.offlineBanner.message": "Sin conexión: las previsiones no se pueden actualizar.",

  // Info button
  "explore.infoButton.title": "Acerca de",

  // Info panel
  "explore.infoPanel.title": "Acerca de OhMyWind",
  "explore.infoPanel.disclaimer.title": "Una ayuda a la decisión, no un instrumento de navegación.",
  "explore.infoPanel.disclaimer.body":
    "OhMyWind no sustituye ni al boletín meteorológico marino oficial, ni a unas cartas actualizadas, ni a su criterio como patrón. Los modelos se equivocan a veces: la responsabilidad de su navegación sigue siendo suya.",
  "explore.infoPanel.project.title": "El proyecto",
  "explore.infoPanel.project.body":
    "OhMyWind pone una meteorología marina de calidad al alcance de los navegantes a vela. Los modelos AROME, ICON, GFS, ECMWF y los datos de olas, corrientes y mareas son públicos y gratuitos. Esta app los reúne en una vista legible, sin cuenta ni instalación.",
  "explore.infoPanel.privacy.title": "Sus datos",
  "explore.infoPanel.privacy.body":
    "Sin rastreo, sin cuenta, sin ningún dato registrado sobre usted. Todo funciona en su navegador, es una página de pura consulta. Las peticiones meteorológicas van directamente a las API públicas.",
  "explore.infoPanel.sources.title": "Fuentes de datos y metodología",
  "explore.infoPanel.sources.body":
    "Modelos de viento (AROME, ICON, ECMWF, GFS), olas y nivel del mar (Open-Meteo Marine, WaveWatch III), corrientes en cascada (SHOM Atlas C2D en los pasos críticos, MARC PREVIMER en la plataforma atlántica, SMOC Copernicus como respaldo global), convenciones, ecuaciones de planificación de la travesía y valoración de la complejidad: todo está detallado en la página de metodología.",
  "explore.infoPanel.sources.link": "Ver la metodología completa",
  "explore.infoPanel.sources.basemap":
    "Mapas base: <osm>© los colaboradores de OpenStreetMap</osm> (datos con licencia ODbL), teselas <ofm>OpenFreeMap</ofm> sobre el esquema <omt>© OpenMapTiles</omt>. Balizamiento (boyas, balizas, faros, luces): <seamap>© los colaboradores de OpenSeaMap</seamap>, teselas con licencia CC BY-SA sobre datos de OpenStreetMap. Esta capa es una ayuda a la preparación, no un documento de navegación: no sustituye ni a las cartas oficiales del SHOM ni a los avisos a los navegantes. Búsqueda de lugares: <photon>Photon</photon> y Open-Meteo Geocoding, ambos sobre datos de OpenStreetMap.",
  "explore.infoPanel.sources.bathymetry":
    "Sondas bajo los waypoints: <emodnet>EMODnet Bathymetry</emodnet> (CC BY 4.0), referidas al cero hidrográfico como en una carta náutica. La retícula mide unos 115 m: responde bien a «cuánta agua hay en este tramo», y es ciega a la piedra aislada entre dos nodos. No debe utilizarse para la navegación.",
  "explore.infoPanel.sources.privacy":
    "Sin cuenta, sin rastreadores: <a>política de privacidad</a>.",
  "explore.infoPanel.licence.title": "Licencia y marca",
  "explore.infoPanel.licence.body":
    "El código de OhMyWind es open source, bajo <licence>licencia AGPL-3.0</licence>. Puede hacer un fork, modificarlo y redistribuirlo. Si expone en la red una versión modificada, debe publicar sus fuentes. En cambio, el nombre «OhMyWind» es objeto de un registro de marca en el INPI, y la identidad visual (logotipo, iconos) sigue protegida por el derecho de autor: un fork se publica con su propio nombre y sus propios iconos. Detalles en la <trademark>política de marca</trademark>.",
  "explore.infoPanel.support.title": "Apoyar el proyecto",
  "explore.infoPanel.support.body":
    "Si esta app le gusta tanto como a mí, sepa que pronto harán falta servidores dedicados para mantenerla. No me apetece meter publicidad en esta app. Si a usted tampoco, no dude en ayudarme.",
  "explore.infoPanel.support.cta": "Apoyar en Ko-fi",

  // Metric pills
  "explore.pills.groupLabel": "Tipo de previsión",
  "explore.pills.wind": "Viento",
  "explore.pills.waves": "Olas",
  "explore.pills.tides": "Mareas",
  "explore.pills.currents": "Corrientes",

  // Wind table
  "explore.windTable.empty": "No hay datos disponibles para este punto.",
  "explore.windTable.offline":
    "Sin conexión: no se pueden obtener las previsiones. Vuelva a conectarse y toque de nuevo este punto.",
  "explore.windTable.fallbackTitle":
    "{description} (mostrado en lugar de {model}, que no cubre este punto).",
  "explore.windTable.fallbackBadge": "fallback desde {model}",

  // Wind cell
  "explore.windCell.aria.speed": "{speed} nudos",
  "explore.windCell.aria.speedGusts": "{speed} nudos, rachas {gusts}",
  "explore.windCell.aria.speedDirection": "{speed} nudos, dirección {direction}°",
  "explore.windCell.aria.speedGustsDirection":
    "{speed} nudos, rachas {gusts}, dirección {direction}°",

  // Marine table
  "explore.marineTable.row.hs": "Hs",
  "explore.marineTable.row.direction": "Dir",
  "explore.marineTable.row.period": "T",
  "explore.marineTable.row.tide": "Marea",
  "explore.marineTable.row.current": "Corr.",
  "explore.marineTable.aria.hs": "Hs {value} m",
  "explore.marineTable.aria.hsFrom": "Hs {value} m, procedente de {dir}°",
  "explore.marineTable.aria.waveDirection": "Dirección de las olas, procedente de {dir}°",
  "explore.marineTable.aria.currentDirection": "Corriente que tira hacia {dir}°",
  "explore.marineTable.aria.wavePeriod": "Periodo de las olas {value} s",
  "explore.marineTable.aria.tide": "Marea {value} {unit}",
  "explore.marineTable.aria.tideRising": "Marea {value} {unit}, creciente",
  "explore.marineTable.aria.tideFalling": "Marea {value} {unit}, vaciante",
  "explore.marineTable.aria.current": "Corriente {value} kn",

  // Tide curve
  "explore.tideChart.curve": "Curva de marea",

  // Onboarding
  "explore.onboarding.title": "¿Planificar una ruta?",
  "explore.onboarding.body":
    "Para trazar un trayecto entre dos spots y estimar la duración, haga clic en el compás.",
  "explore.onboarding.dismiss": "Entendido",

  // Spot search
  "explore.spotSearch.label": "Buscar un lugar",
  "explore.spotSearch.placeholder": "Puerto, cabo, canal o coordenadas",
  "explore.spotSearch.results": "Resultados de la búsqueda",
  "explore.spotSearch.searching": "Buscando...",
  "explore.spotSearch.failed": "Búsqueda no disponible. Compruebe su conexión.",
  "explore.spotSearch.empty": "No se ha encontrado ningún lugar.",
  "explore.spotSearch.goToPosition": "Ir a esta posición",

  // Spot dialogs
  "explore.spotDialogs.options": "Opciones del spot",
  "explore.spotDialogs.rename": "Renombrar",
  "explore.spotDialogs.delete": "Eliminar",
  "explore.spotDialogs.renameTitle": "Renombrar el spot",
  "explore.spotDialogs.createTitle": "Nuevo spot",
  "explore.spotDialogs.nameLabel": "Nombre del spot",
  "explore.spotDialogs.create": "Crear",

  // Quick spots
  "explore.quickSpots.remove": "Eliminar",
  "explore.quickSpots.save": "+ Guardar {name}",

  // Locate button
  "explore.locate.label": "Centrar en mi posición",
  "explore.locate.dismiss": "Cerrar este mensaje",

  // Sea marks button
  "explore.seamarks.show": "Mostrar el balizamiento: boyas, balizas y faros",
  "explore.seamarks.hide": "Ocultar el balizamiento",

  // Geolocation
  "explore.geoloc.denied":
    "Posición denegada. Autorice la localización en los ajustes de su navegador.",
  "explore.geoloc.unavailable":
    "Posición no disponible. Compruebe que la localización está activada en su dispositivo.",
  "explore.geoloc.timeout": "La posición tarda demasiado en llegar. Inténtelo de nuevo.",

  // Place results
  "explore.places.saved": "Spot guardado",
  "explore.places.distanceUnderOne": "a menos de 1 nm",
  "explore.places.distance": "a {value} nm",

  // Coordinates typed into the search box
  "explore.coordinates.north": "N",
  "explore.coordinates.south": "S",
  "explore.coordinates.east": "E",
  "explore.coordinates.west": "O",

  // Place kinds returned by the geocoder
  "explore.geocoding.context": "{feature}, {admin}",
  "explore.geocoding.feature.fairway": "Canal",
  "explore.geocoding.feature.strait": "Estrecho",
  "explore.geocoding.feature.cape": "Cabo",
  "explore.geocoding.feature.bay": "Bahía",
  "explore.geocoding.feature.reef": "Arrecife",
  "explore.geocoding.feature.shoal": "Bajío",
  "explore.geocoding.feature.peninsula": "Península",
  "explore.geocoding.feature.beach": "Playa",
  "explore.geocoding.feature.island": "Isla",
  "explore.geocoding.feature.islet": "Islote",
  "explore.geocoding.feature.archipelago": "Archipiélago",
};
