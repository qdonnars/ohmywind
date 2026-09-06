// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { explore as frExplore } from "../fr/explore";

export const explore: Record<keyof typeof frExplore, string> = {
  // App
  "explore.emptyState.touch": "Toccare la mappa per il meteo, tenere premuto per salvare uno spot",
  "explore.emptyState.click": "Cliccare sulla mappa per il meteo, clic destro per salvare uno spot",
  "explore.planFab.title": "Pianificare una traversata",

  // Header
  "explore.header.settings": "Impostazioni",

  // Theme toggle (design/theme)
  "explore.theme.toDark": "Passare al tema scuro",
  "explore.theme.toLight": "Passare al tema chiaro",

  // Offline banner
  "explore.offlineBanner.message": "Offline: le previsioni non possono essere aggiornate.",

  // Info button
  "explore.infoButton.title": "Informazioni",

  // Info panel
  "explore.infoPanel.title": "Informazioni su OhMyWind",
  "explore.infoPanel.disclaimer.title":
    "Un supporto alla decisione, non uno strumento di navigazione.",
  "explore.infoPanel.disclaimer.body":
    "OhMyWind non sostituisce né il bollettino meteo marino ufficiale, né carte aggiornate, né il suo giudizio di skipper. I modelli a volte sbagliano: la responsabilità della navigazione resta sua.",
  "explore.infoPanel.project.title": "Il progetto",
  "explore.infoPanel.project.body":
    "OhMyWind rende accessibile ai velisti un meteo marino di qualità. I modelli AROME, ICON, GFS, ECMWF e i dati di onde, correnti e maree sono pubblici e gratuiti. Questa app li riunisce in una vista leggibile, senza account né installazione.",
  "explore.infoPanel.privacy.title": "I suoi dati",
  "explore.infoPanel.privacy.body":
    "Nessun tracciamento, nessun account, nessun dato registrato che la riguardi. Tutto gira nel suo browser, è una pagina di pura consultazione. Le richieste meteo partono direttamente verso le API pubbliche.",
  "explore.infoPanel.sources.title": "Fonti dei dati e metodologia",
  "explore.infoPanel.sources.body":
    "Modelli di vento (AROME, ICON, ECMWF, GFS), onde e livello del mare (Open-Meteo Marine, WaveWatch III), correnti a cascata (SHOM Atlas C2D sui passaggi critici, MARC PREVIMER sulla piattaforma atlantica, SMOC Copernicus come ripiego globale), convenzioni, equazioni di pianificazione della traversata e valutazione della complessità: è tutto illustrato in dettaglio nella pagina della metodologia.",
  "explore.infoPanel.sources.link": "Vedere la metodologia completa",
  "explore.infoPanel.sources.basemap":
    "Sfondi cartografici: <osm>© i contributori di OpenStreetMap</osm> (dati con licenza ODbL), tile <ofm>OpenFreeMap</ofm> sullo schema <omt>© OpenMapTiles</omt>. Segnalamenti marittimi (boe, mede, fari, fanali): <seamap>© i contributori di OpenSeaMap</seamap>, tile con licenza CC BY-SA su dati OpenStreetMap. Questo livello è un aiuto alla preparazione, non un documento di navigazione: non sostituisce né le carte ufficiali dello SHOM né gli avvisi ai naviganti. Ricerca di luoghi: <photon>Photon</photon> e Open-Meteo Geocoding, entrambi su dati OpenStreetMap.",
  "explore.infoPanel.sources.bathymetry":
    "Fondali sotto i waypoint: <emodnet>EMODnet Bathymetry</emodnet> (CC BY 4.0), riferiti al livello di riferimento delle carte come su una carta nautica. La griglia è di circa 115 m: risponde bene alla domanda «quanta acqua c'è su questa tratta», ed è cieca allo scoglio isolato tra due nodi. Da non utilizzare per la navigazione.",
  "explore.infoPanel.sources.privacy":
    "Nessun account, nessun tracciatore: <a>informativa sulla privacy</a>.",
  "explore.infoPanel.licence.title": "Licenza e marchio",
  "explore.infoPanel.licence.body":
    "Il codice di OhMyWind è open source, sotto <licence>licenza AGPL-3.0</licence>. È possibile forkarlo, modificarlo e ridistribuirlo. Chi espone in rete una versione modificata ne deve pubblicare i sorgenti. Il nome «OhMyWind», invece, è oggetto di un deposito di marchio presso l'INPI, e l'identità visiva (logo, icone) resta protetta dal diritto d'autore: un fork si pubblica con un proprio nome e proprie icone. Dettagli nella <trademark>politica di marchio</trademark>.",
  "explore.infoPanel.support.title": "Sostenere il progetto",
  "explore.infoPanel.support.body":
    "Se questa app le piace quanto piace a me, sappia che presto serviranno server dedicati per mantenerla in vita. Non ho voglia di mettere pubblicità in questa app. Se nemmeno lei ne ha voglia, non esiti ad aiutarmi.",
  "explore.infoPanel.support.cta": "Sostenere su Ko-fi",

  // Metric pills
  "explore.pills.groupLabel": "Tipo di previsione",
  "explore.pills.wind": "Vento",
  "explore.pills.waves": "Onde",
  "explore.pills.tides": "Maree",
  "explore.pills.currents": "Correnti",

  // Wind table
  "explore.windTable.empty": "Nessun dato disponibile per questo punto.",
  "explore.windTable.offline":
    "Offline: impossibile recuperare le previsioni. Ricollegarsi e poi toccare di nuovo questo punto.",
  "explore.windTable.fallbackTitle":
    "{description} (visualizzato al posto di {model}, che non copre questo punto).",
  "explore.windTable.fallbackBadge": "fallback da {model}",

  // Wind cell
  "explore.windCell.aria.speed": "{speed} nodi",
  "explore.windCell.aria.speedGusts": "{speed} nodi, raffiche {gusts}",
  "explore.windCell.aria.speedDirection": "{speed} nodi, direzione {direction}°",
  "explore.windCell.aria.speedGustsDirection":
    "{speed} nodi, raffiche {gusts}, direzione {direction}°",

  // Marine table
  "explore.marineTable.row.hs": "Hs",
  "explore.marineTable.row.direction": "Dir",
  "explore.marineTable.row.period": "T",
  "explore.marineTable.row.tide": "Marea",
  "explore.marineTable.row.current": "Corr.",
  "explore.marineTable.aria.hs": "Hs {value} m",
  "explore.marineTable.aria.hsFrom": "Hs {value} m, proveniente da {dir}°",
  "explore.marineTable.aria.waveDirection": "Direzione delle onde, proveniente da {dir}°",
  "explore.marineTable.aria.currentDirection": "Corrente diretta verso {dir}°",
  "explore.marineTable.aria.wavePeriod": "Periodo delle onde {value} s",
  "explore.marineTable.aria.tide": "Marea {value} {unit}",
  "explore.marineTable.aria.tideRising": "Marea {value} {unit}, montante",
  "explore.marineTable.aria.tideFalling": "Marea {value} {unit}, calante",
  "explore.marineTable.aria.current": "Corrente {value} kn",

  // Tide curve
  "explore.tideChart.curve": "Curva di marea",

  // Onboarding
  "explore.onboarding.title": "Pianificare una rotta?",
  "explore.onboarding.body":
    "Per tracciare un percorso tra due spot e stimarne la durata, cliccare sulla bussola.",
  "explore.onboarding.dismiss": "Capito",

  // Spot search
  "explore.spotSearch.label": "Cercare un luogo",
  "explore.spotSearch.placeholder": "Porto, capo, canale o coordinate",
  "explore.spotSearch.results": "Risultati della ricerca",
  "explore.spotSearch.searching": "Ricerca in corso...",
  "explore.spotSearch.failed": "Ricerca non disponibile. Verificare la connessione.",
  "explore.spotSearch.empty": "Nessun luogo trovato.",
  "explore.spotSearch.goToPosition": "Andare a questa posizione",

  // Spot dialogs
  "explore.spotDialogs.options": "Opzioni dello spot",
  "explore.spotDialogs.rename": "Rinominare",
  "explore.spotDialogs.delete": "Eliminare",
  "explore.spotDialogs.renameTitle": "Rinominare lo spot",
  "explore.spotDialogs.createTitle": "Nuovo spot",
  "explore.spotDialogs.nameLabel": "Nome dello spot",
  "explore.spotDialogs.create": "Creare",

  // Quick spots
  "explore.quickSpots.remove": "Eliminare",
  "explore.quickSpots.save": "+ Salvare {name}",

  // Locate button
  "explore.locate.label": "Centrare sulla mia posizione",
  "explore.locate.dismiss": "Chiudere questo messaggio",

  // Sea marks button
  "explore.seamarks.show": "Mostrare i segnalamenti marittimi: boe, mede e fari",
  "explore.seamarks.hide": "Nascondere i segnalamenti marittimi",

  // Geolocation
  "explore.geoloc.denied":
    "Posizione rifiutata. Autorizzare la geolocalizzazione nelle impostazioni del browser.",
  "explore.geoloc.unavailable":
    "Posizione non disponibile. Verificare che la geolocalizzazione sia attiva sul dispositivo.",
  "explore.geoloc.timeout": "La posizione impiega troppo tempo ad arrivare. Riprovare.",

  // Place results
  "explore.places.saved": "Spot salvato",
  "explore.places.distanceUnderOne": "a meno di 1 nm",
  "explore.places.distance": "a {value} nm",

  // Coordinates typed into the search box
  "explore.coordinates.north": "N",
  "explore.coordinates.south": "S",
  "explore.coordinates.east": "E",
  "explore.coordinates.west": "O",

  // Place kinds returned by the geocoder
  "explore.geocoding.context": "{feature}, {admin}",
  "explore.geocoding.feature.fairway": "Canale",
  "explore.geocoding.feature.strait": "Stretto",
  "explore.geocoding.feature.cape": "Capo",
  "explore.geocoding.feature.bay": "Baia",
  "explore.geocoding.feature.reef": "Scogliera",
  "explore.geocoding.feature.shoal": "Secca",
  "explore.geocoding.feature.peninsula": "Penisola",
  "explore.geocoding.feature.beach": "Spiaggia",
  "explore.geocoding.feature.island": "Isola",
  "explore.geocoding.feature.islet": "Isolotto",
  "explore.geocoding.feature.archipelago": "Arcipelago",
};
