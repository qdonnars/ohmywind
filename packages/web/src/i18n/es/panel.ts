// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { panel as frPanel } from "../fr/panel";

export const panel: Record<keyof typeof frPanel, string> = {
  // ── PlanForm ───────────────────────────────────────────────────────────────
  "panel.form.calculate": "Calcular la travesía",
  "panel.form.compareWindows": "Comparar las ventanas",
  "panel.form.waypointsNeeded": "{count}/2 waypoints",

  // ── PlanHeaderRow ──────────────────────────────────────────────────────────
  "panel.header.newPlan": "Nueva planificación",

  // ── parts ──────────────────────────────────────────────────────────────────
  "panel.parts.recompute": "Recalcular",

  // ── ArchetypeSelector / boatLabel ──────────────────────────────────────────
  "panel.boat.custom": "Personal",
  "panel.boat.polarFallback": "polar",
  "panel.boat.detailImported": "{name} · importada",
  "panel.boat.detailAdjusted": "{base} · ajustada",
  "panel.boat.customActiveTitle": "Polar personalizada activa ({detail})",
  "panel.boat.changeTitle": "Cambiar el tipo de barco",
  "panel.boat.edit": "editar",
  "panel.boat.reset": "restablecer",
  "panel.boat.recapImported": "{name} (importada)",
  "panel.boat.recapAdjusted": "{base} (ajustada)",

  // ── DepartureSlider (shared with DepartureRangeSlider) ─────────────────────
  "panel.departure.arrival": "Llegada",
  "panel.departure.departure": "Salida",
  "panel.departure.ariaArrival": "Hora de llegada deseada",
  "panel.departure.ariaDeparture": "Fecha de salida",
  "panel.departure.slider": "Deslizador",
  "panel.departure.adjust": "Ajustar",
  "panel.departure.today": "Hoy",
  "panel.departure.tomorrow": "Mañana",
  "panel.departure.inDays.one": "Dentro de {count} día",
  "panel.departure.inDays.other": "Dentro de {count} días",
  "panel.departure.dayPlus": "D+{count}",
  "panel.departure.now": "Ahora",
  "panel.departure.plusOneWeek": "+1 sem.",
  "panel.departure.plusTwoWeeks": "+2 sem.",

  // ── DepartureRangeSlider ───────────────────────────────────────────────────
  "panel.range.title": "Ventana de salida",
  "panel.range.spanDays": "{value} d",
  "panel.range.spanHours": "{value} h",
  "panel.range.ariaEarliest": "Salida más temprana",
  "panel.range.ariaLatest": "Salida más tardía",

  // ── SweepForm ──────────────────────────────────────────────────────────────
  "panel.sweep.samplingStep": "Paso de muestreo",
  "panel.sweep.everyHour": "Cada hora",
  "panel.sweep.everyNHours": "Cada {hours}h",

  // ── SingleResults ──────────────────────────────────────────────────────────
  "panel.results.recapDeparture": "Salida: {day} · {time}",
  "panel.results.recapArrival": "Llegada: {day} · {time}",
  "panel.results.stale":
    "Itinerario modificado. Haga clic en Recalcular para actualizar los detalles.",
  "panel.results.forecastUpdated": "Datos actualizados a las {time} · Open-Meteo.com (CC BY 4.0)",

  // ── CompareResults ─────────────────────────────────────────────────────────
  "panel.compare.recapStep": "paso {interval}h · {boat}",
  "panel.compare.stale":
    "Itinerario modificado. Haga clic en Recalcular para comparar las ventanas del nuevo trayecto.",
  "panel.compare.windowsCompared.one":
    "{count} ventana comparada · haga clic en una fila para abrir la simulación detallada",
  "panel.compare.windowsCompared.other":
    "{count} ventanas comparadas · haga clic en una fila para abrir la simulación detallada",

  // ── WindowsTable ───────────────────────────────────────────────────────────
  "panel.windows.colDeparture": "Salida",
  "panel.windows.colDuration": "Duración",
  "panel.windows.colEta": "ETA",
  "panel.windows.colPointOfSail": "Rumbo",
  "panel.windows.colWind": "Viento (kn)",
  "panel.windows.colSea": "Mar",
  "panel.windows.rowTitle": "Ver el detalle de esta ventana",
  "panel.windows.complexityTitle": "{label}: {rationale}",
  "panel.windows.sailUpwind": "Ceñida",
  "panel.windows.sailBeamReach": "Través",
  "panel.windows.sailBroadReach": "Largo",
  "panel.windows.sailDownwind": "Empopada",

  // ── LegList / aggregateLegs ────────────────────────────────────────────────
  "panel.legs.colLeg": "Tramo",
  "panel.legs.durationMinutes": "{minutes} min",
  "panel.legs.durationHours": "{hours} h",
  "panel.legs.colDuration": "Duración",
  "panel.legs.colPointOfSail": "Rumbo",
  "panel.legs.colWind": "Viento (kn)",
  "panel.legs.colSea": "Mar",
  "panel.legs.pointOfSail.upwindTacking": "Ceñida (dando bordos)",
  "panel.legs.pointOfSail.upwind": "Ceñida",
  "panel.legs.pointOfSail.beamReach": "Través",
  "panel.legs.pointOfSail.broadReach": "Largo",
  "panel.legs.pointOfSail.run": "Popa",
  "panel.legs.pointOfSail.motor": "A motor",
  "panel.legs.seaFlag.windAgainstCurrent": "Viento Contra Corriente",
  "panel.legs.seaFlag.heavySea": "Mar Muy Gruesa",
  "panel.legs.seaFlag.chop": "Mar Corta",
  "panel.legs.seaFlag.followingChop": "Mar Corta de Popa",
  "panel.legs.seaFlag.roughSea": "Mar Gruesa",

  // ── LegDetailCard / LegExpanded ────────────────────────────────────────────
  "panel.legDetail.prevStep": "Paso anterior",
  "panel.legDetail.nextStep": "Paso siguiente",
  "panel.legDetail.rowWind": "Viento",
  "panel.legDetail.rowSea": "Mar",
  "panel.legDetail.rowCurrent": "Corriente",
  "panel.legDetail.rowHeading": "Rumbo",
  "panel.legDetail.rowSpeed": "Velocidad",
  "panel.legDetail.seaNotObserved": "no observada",
  "panel.legDetail.speedUnit": "kn SOG",
  "panel.legDetail.compassAria": "Viento, olas y corriente alrededor del barco, Norte arriba",
  "panel.legDetail.headingValue": "{deg}° · {sail}",
  "panel.legDetail.currentFair": "{speed} kn a favor",
  "panel.legDetail.currentFoul": "{speed} kn en contra",
  "panel.legDetail.currentAcross": "{speed} kn de través",
  "panel.legDetail.currentPlain": "{speed} kn",
  "panel.legDetail.buildUpPolar": "{value} polar",
  "panel.legDetail.buildUpSea": "{value} mar",
  "panel.legDetail.buildUpCurrent": "{value} corriente",
  "panel.legDetail.buildUpMotor": "{value} motor",
  "panel.legDetail.headerAverage": "Media · {duration}",
  "panel.legDetail.headerHint": "toque un paso",
  "panel.legDetail.noteMotorOnStep": "a motor en este paso",
  "panel.legDetail.noteAverage.one": "media de {count} paso",
  "panel.legDetail.noteAverage.other": "media de {count} pasos",
};
