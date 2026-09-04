// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { plan as frPlan } from "../fr/plan";

export const plan: Record<keyof typeof frPlan, string> = {
  // ── PlanPage ──────────────────────────────────────────────────────────────
  "plan.page.urlError.title": "URL non valido",
  "plan.page.urlError.back": "← Esplorare il meteo",
  "plan.page.backToExplore": "Tornare all'esplorazione",
  "plan.page.hint.placeStart": "Cliccare per posizionare la partenza",
  "plan.page.hint.drawRoute": "Cliccare per tracciare la rotta",
  "plan.panel.resize": "Ridimensionare il pannello",

  // ── Totals: panel block and mobile strip ──────────────────────────────────
  "plan.hero.distance": "Distanza",
  "plan.hero.duration": "Durata",
  "plan.hero.arrival": "Arrivo",
  "plan.hero.openDetail": "Vedere il dettaglio della traversata",

  // ── Segment bar, under the totals ─────────────────────────────────────────
  "plan.segmentBar.groupLabel": "Tappe della traversata, un clic apre la tappa",
  "plan.segmentBar.progressLabel": "Distribuzione del vento per segmento",
  "plan.segmentBar.stepLabel":
    "Tratta {from}→{to}, tappa {index} di {total}, {start} → {end}, {tws} kn",
  "plan.segmentBar.timeLabel": "{start} → {end}, {tws} kn",

  // ── Panel states ──────────────────────────────────────────────────────────
  "plan.states.empty.title": "Tracciare il percorso",
  "plan.states.empty.body":
    "Cliccare sulla mappa per posizionare una partenza e un arrivo. Sarà poi possibile simulare la durata del percorso oppure confrontare più finestre di partenza.",
  "plan.states.picker.title": "Cosa desidera fare?",
  "plan.states.picker.single.body":
    "Sa quando partire. OhMyWind calcola la durata del percorso, l'ETA e le condizioni su ogni segmento.",
  "plan.states.picker.single.example": "Es.: «Se parto sabato alle 17:00, quando arrivo?»",
  "plan.states.picker.compare.body":
    "Sa dove andare. OhMyWind prova più orari di partenza e classifica le finestre per comfort.",
  "plan.states.picker.compare.example": "Es.: «Qual è la partenza migliore tra sabato e lunedì?»",
  "plan.states.error.title": "Errore",
  "plan.recap.edit": "Modificare",

  // ── Mode picker and time anchor ───────────────────────────────────────────
  "plan.mode.tablist": "Modalità di pianificazione",
  "plan.mode.single.title": "Simulare la mia rotta",
  "plan.mode.single.sub": "Quanto dura questo percorso?",
  "plan.mode.compare.title": "Confrontare le finestre",
  "plan.mode.compare.sub": "La finestra migliore per partire?",
  "plan.timeAnchor.tablist": "Ancoraggio orario",
  "plan.timeAnchor.departure.title": "Definire la partenza",
  "plan.timeAnchor.departure.sub": "Capire la durata del percorso",
  "plan.timeAnchor.arrival.title": "Definire l'arrivo",
  "plan.timeAnchor.arrival.sub": "Quando partire al più tardi?",

  // ── Steps of a leg ────────────────────────────────────────────────────────
  "plan.steps.groupLabel": "Tappe di calcolo della tratta",
  "plan.steps.stepLabel": "Tappa {index} di {total}, {time}",
  "plan.steps.viewToggle.label": "Visualizzazione della tratta",
  "plan.steps.viewToggle.average": "Media",
  "plan.steps.viewToggle.detail": "Dettaglio",

  // ── Map ───────────────────────────────────────────────────────────────────
  "plan.map.waypoint.remove": "Eliminare questo punto",

  // ── Comparison window validation ──────────────────────────────────────────
  "plan.sweep.errors.missingWindow": "Indicare una finestra di partenza.",
  "plan.sweep.errors.invalidDates": "Date non valide.",
  "plan.sweep.errors.latestBeforeEarliest":
    "Il «più tardi» deve essere successivo al «più presto».",
  "plan.sweep.errors.beyondHorizon":
    "Le previsioni sono affidabili solo su {days} giorni. Scegliere una data più vicina.",
  "plan.sweep.errors.tooManyWindows":
    "Troppe finestre da confrontare ({windows}). Ridurre la finestra o aumentare il passo.",

  // ── URL parsing ───────────────────────────────────────────────────────────
  "plan.url.errors.tooFewWaypoints": "Servono almeno 2 waypoint",
  "plan.url.errors.invalidWaypoint": 'waypoint non valido: "{value}"',
  "plan.url.errors.latitudeOutOfRange": "latitudine fuori intervallo: {value}",
  "plan.url.errors.longitudeOutOfRange": "longitudine fuori intervallo: {value}",
  "plan.url.errors.invalidWaypoints": "Waypoint non validi: {detail}",

  // ── Passage API errors ────────────────────────────────────────────────────
  "plan.api.errors.retryDelay.vague": "Attendere qualche minuto prima di rilanciare il calcolo.",
  "plan.api.errors.retryDelay.seconds.one":
    "Attendere {count} secondo prima di rilanciare il calcolo.",
  "plan.api.errors.retryDelay.seconds.other":
    "Attendere {count} secondi prima di rilanciare il calcolo.",
  "plan.api.errors.retryDelay.minutes.one":
    "Attendere {count} minuto prima di rilanciare il calcolo.",
  "plan.api.errors.retryDelay.minutes.other":
    "Attendere {count} minuti prima di rilanciare il calcolo.",
  "plan.api.errors.serverStatus": "Errore del server {status}",
  "plan.api.errors.forecastHorizon":
    "Il servizio meteo non ha potuto coprire questo periodo. Scegliere una data più vicina (fino a circa 10 giorni a seconda del modello). Per non perdere la pianificazione, non ricaricare la pagina prima di aver corretto la data.",
  "plan.api.errors.tooFewWaypoints":
    "Posizionare almeno 2 waypoint sulla mappa per calcolare una rotta.",
  "plan.api.errors.waypointOutOfRange":
    "Un waypoint è fuori dalle coordinate valide. Riposizionarlo sulla mappa.",
  "plan.api.errors.tooManyWaypoints":
    "Troppi waypoint su questa rotta. Toglierne alcuni per semplificarla.",
  "plan.api.errors.rateLimited": "Troppi calcoli lanciati uno dopo l'altro. {delay}",
  "plan.api.errors.unknownArchetype":
    "Tipo di barca sconosciuto. Selezionare un tipo di barca dall'elenco.",
  "plan.api.errors.invalidDatetime": "Data non valida. Verificare il formato dei campi data.",
  "plan.api.errors.naiveDatetime": "L'ora di arrivo deve includere il fuso orario.",
  "plan.api.errors.sweepTooLarge":
    "Troppe finestre da confrontare. Ridurre la finestra o aumentare il passo di campionamento.",
  "plan.api.errors.upstreamTimeout":
    "Il servizio meteo ha impiegato troppo tempo a rispondere. Riprovare tra qualche istante.",
  "plan.api.errors.upstreamRateLimited":
    "Il servizio meteo limita temporaneamente le nostre richieste. Non dipende dal suo utilizzo, riprovare tra qualche minuto.",
  "plan.api.errors.upstreamUnavailable":
    "Il server è momentaneamente irraggiungibile, forse si sta riavviando. {delay}",
  "plan.api.errors.bodyTooLarge":
    "La rotta è troppo dettagliata per essere inviata. Togliere qualche waypoint o accorciare il periodo.",
  "plan.api.errors.invalidForecastCache":
    "I dati meteo preparati dal browser sono stati rifiutati. Riprovare: il calcolo ripartirà dai dati del server.",
  "plan.api.errors.serverUnavailable":
    "Il server meteo non è disponibile. Riprovare tra qualche istante.",
  "plan.api.errors.networkUnreachable":
    "Impossibile raggiungere il server. Verificare la connessione e riprovare.",
  "plan.api.errors.invalidResponse":
    "Il server ha restituito una risposta inattesa. Riprovare tra qualche istante.",
};
