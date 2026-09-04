// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { panel as frPanel } from "../fr/panel";

export const panel: Record<keyof typeof frPanel, string> = {
  // ── PlanForm ───────────────────────────────────────────────────────────────
  "panel.form.calculate": "Calcolare la traversata",
  "panel.form.compareWindows": "Confrontare le finestre",
  "panel.form.waypointsNeeded": "{count}/2 waypoint",

  // ── PlanHeaderRow ──────────────────────────────────────────────────────────
  "panel.header.newPlan": "Nuova pianificazione",

  // ── parts ──────────────────────────────────────────────────────────────────
  "panel.parts.recompute": "Ricalcolare",

  // ── ArchetypeSelector / boatLabel ──────────────────────────────────────────
  "panel.boat.custom": "Personalizzata",
  "panel.boat.polarFallback": "polare",
  "panel.boat.detailImported": "{name} · importata",
  "panel.boat.detailAdjusted": "{base} · regolata",
  "panel.boat.customActiveTitle": "Polare personalizzata attiva ({detail})",
  "panel.boat.changeTitle": "Cambiare il tipo di barca",
  "panel.boat.edit": "modificare",
  "panel.boat.reset": "reimpostare",
  "panel.boat.recapImported": "{name} (importata)",
  "panel.boat.recapAdjusted": "{base} (regolata)",

  // ── DepartureSlider (shared with DepartureRangeSlider) ─────────────────────
  "panel.departure.arrival": "Arrivo",
  "panel.departure.departure": "Partenza",
  "panel.departure.ariaArrival": "Ora di arrivo desiderata",
  "panel.departure.ariaDeparture": "Data di partenza",
  "panel.departure.slider": "Cursore",
  "panel.departure.adjust": "Regolare",
  "panel.departure.today": "Oggi",
  "panel.departure.tomorrow": "Domani",
  "panel.departure.inDays.one": "Tra {count} giorno",
  "panel.departure.inDays.other": "Tra {count} giorni",
  "panel.departure.dayPlus": "G+{count}",
  "panel.departure.now": "Adesso",
  "panel.departure.plusOneWeek": "+1 sett.",
  "panel.departure.plusTwoWeeks": "+2 sett.",

  // ── DepartureRangeSlider ───────────────────────────────────────────────────
  "panel.range.title": "Finestra di partenza",
  "panel.range.spanDays": "{value} gg",
  "panel.range.spanHours": "{value} h",
  "panel.range.ariaEarliest": "Partenza al più presto",
  "panel.range.ariaLatest": "Partenza al più tardi",

  // ── SweepForm ──────────────────────────────────────────────────────────────
  "panel.sweep.samplingStep": "Passo di campionamento",
  "panel.sweep.everyHour": "Ogni ora",
  "panel.sweep.everyNHours": "Ogni {hours}h",

  // ── SingleResults ──────────────────────────────────────────────────────────
  "panel.results.recapDeparture": "Partenza: {day} · {time}",
  "panel.results.recapArrival": "Arrivo: {day} · {time}",
  "panel.results.stale":
    "Itinerario modificato. Cliccare su Ricalcolare per aggiornare i dettagli.",
  "panel.results.forecastUpdated": "Dati aggiornati alle {time} · Open-Meteo.com (CC BY 4.0)",

  // ── CompareResults ─────────────────────────────────────────────────────────
  "panel.compare.recapStep": "passo {interval}h · {boat}",
  "panel.compare.stale":
    "Itinerario modificato. Cliccare su Ricalcolare per confrontare le finestre del nuovo percorso.",
  "panel.compare.windowsCompared.one":
    "{count} finestra confrontata · cliccare su una riga per aprire la simulazione dettagliata",
  "panel.compare.windowsCompared.other":
    "{count} finestre confrontate · cliccare su una riga per aprire la simulazione dettagliata",

  // ── WindowsTable ───────────────────────────────────────────────────────────
  "panel.windows.colDeparture": "Partenza",
  "panel.windows.colDuration": "Durata",
  "panel.windows.colEta": "ETA",
  "panel.windows.colPointOfSail": "Andatura",
  "panel.windows.colWind": "Vento (kn)",
  "panel.windows.colSea": "Mare",
  "panel.windows.rowTitle": "Vedere il dettaglio di questa finestra",
  "panel.windows.complexityTitle": "{label}: {rationale}",
  "panel.windows.sailUpwind": "Bolina",
  "panel.windows.sailBeamReach": "Traverso",
  "panel.windows.sailBroadReach": "Lasco",
  "panel.windows.sailDownwind": "Portante",

  // ── LegList / aggregateLegs ────────────────────────────────────────────────
  "panel.legs.colLeg": "Tratta",
  "panel.legs.durationMinutes": "{minutes} min",
  "panel.legs.durationHours": "{hours} h",
  "panel.legs.colDuration": "Durata",
  "panel.legs.colPointOfSail": "Andatura",
  "panel.legs.colWind": "Vento (kn)",
  "panel.legs.colSea": "Mare",
  "panel.legs.pointOfSail.upwindTacking": "Bolina (bordeggiando)",
  "panel.legs.pointOfSail.upwind": "Bolina",
  "panel.legs.pointOfSail.beamReach": "Traverso",
  "panel.legs.pointOfSail.broadReach": "Lasco",
  "panel.legs.pointOfSail.run": "Poppa",
  "panel.legs.pointOfSail.motor": "A motore",
  "panel.legs.seaFlag.windAgainstCurrent": "Vento Contro Corrente",
  "panel.legs.seaFlag.heavySea": "Mare Grosso",
  "panel.legs.seaFlag.chop": "Mare Corto",
  "panel.legs.seaFlag.followingChop": "Mare Corto di Poppa",
  "panel.legs.seaFlag.roughSea": "Mare Formato",

  // ── LegDetailCard / LegExpanded ────────────────────────────────────────────
  "panel.legDetail.prevStep": "Tappa precedente",
  "panel.legDetail.nextStep": "Tappa successiva",
  "panel.legDetail.rowWind": "Vento",
  "panel.legDetail.rowSea": "Mare",
  "panel.legDetail.rowCurrent": "Corrente",
  "panel.legDetail.rowHeading": "Rotta",
  "panel.legDetail.rowSpeed": "Velocità",
  "panel.legDetail.seaNotObserved": "non osservato",
  "panel.legDetail.speedUnit": "kn SOG",
  "panel.legDetail.compassAria": "Vento, onde e corrente attorno alla barca, Nord in alto",
  "panel.legDetail.headingValue": "{deg}° · {sail}",
  "panel.legDetail.currentFair": "{speed} kn favorevole",
  "panel.legDetail.currentFoul": "{speed} kn contraria",
  "panel.legDetail.currentAcross": "{speed} kn al traverso",
  "panel.legDetail.currentPlain": "{speed} kn",
  "panel.legDetail.buildUpPolar": "{value} polare",
  "panel.legDetail.buildUpSea": "{value} mare",
  "panel.legDetail.buildUpCurrent": "{value} corrente",
  "panel.legDetail.buildUpMotor": "{value} motore",
  "panel.legDetail.headerAverage": "Media · {duration}",
  "panel.legDetail.headerHint": "toccare una tappa",
  "panel.legDetail.noteMotorOnStep": "a motore su questa tappa",
  "panel.legDetail.noteAverage.one": "media di {count} tappa",
  "panel.legDetail.noteAverage.other": "media di {count} tappe",
};
