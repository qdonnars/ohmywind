// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { plan as frPlan } from "../fr/plan";

export const plan: Record<keyof typeof frPlan, string> = {
  // ── PlanPage ──────────────────────────────────────────────────────────────
  "plan.page.urlError.title": "URL non valido",
  "plan.page.urlError.back": "← Esplorare il meteo",
  "plan.page.hint.placeStart": "Cliccare per posizionare la partenza",
  "plan.page.hint.drawRoute": "Cliccare per tracciare la rotta",
  "plan.panel.resize": "Ridimensionare il pannello",

  // ── Totals: panel block and mobile strip ──────────────────────────────────
  "plan.hero.distance": "Distanza",
  "plan.hero.duration": "Durata",
  "plan.hero.arrival": "Arrivo",

  // ── Segment bar, under the totals ─────────────────────────────────────────
  "plan.segmentBar.groupLabel": "Tappe della traversata, un clic apre la tappa",
  "plan.segmentBar.progressLabel": "Distribuzione del vento per segmento",
  "plan.segmentBar.stepLabel":
    "Tratta {from}→{to}, tappa {index} di {total}, {start} → {end}, {tws} kn",
  "plan.segmentBar.timeLabel": "{start} → {end}, {tws} kn",

  // ── Panel states ──────────────────────────────────────────────────────────
  "plan.states.empty.title": "Tracciare il percorso",
  "plan.states.empty.body":
    "Clicchi sulla mappa per posizionare una partenza e un arrivo. Potrà poi calcolare il passaggio, quindi confrontare altre partenze o altre rotte.",
  "plan.states.error.title": "Errore",
  "plan.states.waking.title": "Il server meteo si sta riavviando",
  "plan.states.waking.body":
    "Era in pausa: il calcolo riparte da solo tra {seconds} s (tentativo {attempt} di {max}).",
  "plan.states.waking.retryNow": "Riprovare ora",
  "plan.recap.edit": "Modificare",

  // ── Mode picker and time anchor ───────────────────────────────────────────
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
  "plan.map.waypoint.removed": "Punto {n} eliminato",
  "plan.map.waypoint.undo": "Annulla",

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
  "plan.notice.passage.long_route":
    "rotta lunga ({route_nm} nm): {points} punti meteo campionati (~{spacing_nm} nm tra i punti) invece di {requested_nm} nm, per limitare le richieste API.",
  "plan.notice.passage.light_wind":
    "vento debole: velocità minima {min_speed_kn} kn, traversata molto lenta",
  "plan.notice.passage.model_fallback":
    "modello {model} senza dati su {fallback_count}/{total} punti (probabilmente fuori copertura); ripiego automatico su {others}",
  "plan.notice.currents.tidal_gap": "Correnti di marea probabilmente forti ({zones}) e non risolte dalle nostre fonti: le correnti indicate provengono da un modello globale a 8 km che non le vede. Stiamo lavorando per estendere la copertura, ma non tutti i dati sono in libero accesso.",
  "plan.notice.complexity.wind.3": "Vento teso: TWS {tws_range} kn su {nm} nm",
  "plan.notice.complexity.wind.4": "Vento forte: TWS {tws_range} kn su {nm} nm",
  "plan.notice.complexity.wind.5": "Vento molto forte: TWS {tws_range} kn su {nm} nm",
  "plan.notice.complexity.sea.3": "Mare molto mosso: Hs {hs_range} m su {nm} nm",
  "plan.notice.complexity.sea.4": "Mare agitato: Hs {hs_range} m su {nm} nm",
  "plan.notice.complexity.sea.5": "Mare molto agitato: Hs {hs_range} m su {nm} nm",
  "plan.notice.complexity.current":
    "Vento contro corrente: corrente contraria di {current_range} kt su {nm} nm, mare corto probabile",
  "plan.notice.complexity.chop_short":
    "Mare corto: Hs {hs_range} m a Tp {tp_range} s su {nm} nm, mare sgradevole",
  "plan.notice.complexity.chop_following":
    "Mare corto di poppa: Hs {hs_range} m a Tp {tp_range} s su {nm} nm",
  "plan.notice.sweep.widened_interval":
    "campionamento allargato a {effective_h} h (invece di {requested_h} h): la rotta conta {segments} tratti, troppi per simulare tante finestre.",
  "plan.notice.sweep.skipped_windows":
    "{skipped} finestra/e ignorata/e per mancanza di copertura meteo (orizzonte superato): mostrate le {kept} restanti.",
  "plan.notice.sweep.no_window_near_eta":
    "nessuna finestra arriva entro ±2 h da target_eta={target_eta}; restituite tutte le {count} finestre",
};
