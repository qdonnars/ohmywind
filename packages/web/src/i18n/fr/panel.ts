// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** The planner's side panel: the form, the results, the windows table, the
    leg list and the card under an open leg. */
export const panel = {
  // ── PlanForm ───────────────────────────────────────────────────────────────
  "panel.form.calculate": "Calculer le passage",
  "panel.form.compareWindows": "Comparer les créneaux",
  "panel.form.waypointsNeeded": "{count}/2 waypoints",

  // ── PlanHeaderRow ──────────────────────────────────────────────────────────
  "panel.header.newPlan": "Nouveau plan",

  // ── parts ──────────────────────────────────────────────────────────────────
  "panel.parts.recompute": "Recalculer",

  // ── ArchetypeSelector / boatLabel ──────────────────────────────────────────
  "panel.boat.custom": "Perso",
  "panel.boat.polarFallback": "polaire",
  "panel.boat.detailImported": "{name} · importée",
  "panel.boat.detailAdjusted": "{base} · ajustée",
  "panel.boat.customActiveTitle": "Polaire personnalisée active ({detail})",
  "panel.boat.changeTitle": "Changer le type de bateau",
  "panel.boat.edit": "éditer",
  "panel.boat.reset": "réinitialiser",
  "panel.boat.recapImported": "{name} (importée)",
  "panel.boat.recapAdjusted": "{base} (ajustée)",

  // ── DepartureSlider (shared with DepartureRangeSlider) ─────────────────────
  "panel.departure.arrival": "Arrivée",
  "panel.departure.departure": "Départ",
  "panel.departure.ariaArrival": "Heure d'arrivée souhaitée",
  "panel.departure.ariaDeparture": "Date de départ",
  "panel.departure.slider": "Slider",
  "panel.departure.adjust": "Ajuster",
  "panel.departure.today": "Aujourd'hui",
  "panel.departure.tomorrow": "Demain",
  "panel.departure.inDays.one": "Dans {count} jour",
  "panel.departure.inDays.other": "Dans {count} jours",
  "panel.departure.dayPlus": "J+{count}",
  "panel.departure.now": "Maintenant",
  "panel.departure.plusOneWeek": "+1 sem.",
  "panel.departure.plusTwoWeeks": "+2 sem.",

  // ── DepartureRangeSlider ───────────────────────────────────────────────────
  "panel.range.title": "Fenêtre de départ",
  "panel.range.spanDays": "{value} j",
  "panel.range.spanHours": "{value} h",
  "panel.range.ariaEarliest": "Départ au plus tôt",
  "panel.range.ariaLatest": "Départ au plus tard",

  // ── SweepForm ──────────────────────────────────────────────────────────────
  "panel.sweep.samplingStep": "Pas d'échantillonnage",
  "panel.sweep.everyHour": "Toutes les heures",
  "panel.sweep.everyNHours": "Toutes les {hours}h",

  // ── SingleResults ──────────────────────────────────────────────────────────
  "panel.results.recapDeparture": "Départ : {day} · {time}",
  "panel.results.recapArrival": "Arrivée : {day} · {time}",
  "panel.results.stale":
    "Itinéraire modifié. Cliquez sur Recalculer pour mettre à jour les détails.",
  "panel.results.forecastUpdated": "Données fraîches au {time} · Open-Meteo.com (CC BY 4.0)",

  // ── CompareResults ─────────────────────────────────────────────────────────
  "panel.compare.recapStep": "pas {interval}h · {boat}",
  "panel.compare.stale":
    "Itinéraire modifié. Cliquez sur Recalculer pour comparer les créneaux du nouveau trajet.",
  "panel.compare.windowsCompared.one":
    "{count} fenêtre comparée · cliquez sur une ligne pour ouvrir la simulation détaillée",
  "panel.compare.windowsCompared.other":
    "{count} fenêtres comparées · cliquez sur une ligne pour ouvrir la simulation détaillée",

  // ── WindowsTable ───────────────────────────────────────────────────────────
  "panel.windows.colDeparture": "Départ",
  "panel.windows.colDuration": "Durée",
  "panel.windows.colEta": "ETA",
  "panel.windows.colPointOfSail": "Allure",
  "panel.windows.colWind": "Vent (kn)",
  "panel.windows.colSea": "Mer",
  "panel.windows.rowTitle": "Voir le détail de cette fenêtre",
  "panel.windows.complexityTitle": "{label} : {rationale}",
  "panel.windows.sailUpwind": "Près",
  "panel.windows.sailBeamReach": "Travers",
  "panel.windows.sailBroadReach": "Largue",
  "panel.windows.sailDownwind": "Portant",

  // ── LegList / aggregateLegs ────────────────────────────────────────────────
  "panel.legs.colLeg": "Tronçon",
  "panel.legs.durationMinutes": "{minutes} mn",
  "panel.legs.durationHours": "{hours} h",
  "panel.legs.colDuration": "Durée",
  "panel.legs.colPointOfSail": "Allure",
  "panel.legs.colWind": "Vent (kn)",
  "panel.legs.colSea": "Mer",
  "panel.legs.pointOfSail.upwindTacking": "Près (louvoyage)",
  "panel.legs.pointOfSail.upwind": "Près",
  "panel.legs.pointOfSail.beamReach": "Travers",
  "panel.legs.pointOfSail.broadReach": "Largue",
  "panel.legs.pointOfSail.run": "Arrière",
  "panel.legs.pointOfSail.motor": "Moteur",
  "panel.legs.seaFlag.windAgainstCurrent": "Vent Contre Courant",
  "panel.legs.seaFlag.heavySea": "Grosse Mer",
  "panel.legs.seaFlag.chop": "Clapot",
  "panel.legs.seaFlag.followingChop": "Clapot Suiveur",
  "panel.legs.seaFlag.roughSea": "Mer Formée",

  // ── LegDetailCard / LegExpanded ────────────────────────────────────────────
  "panel.legDetail.prevStep": "Pas précédent",
  "panel.legDetail.nextStep": "Pas suivant",
  "panel.legDetail.rowWind": "Vent",
  "panel.legDetail.rowSea": "Mer",
  "panel.legDetail.rowCurrent": "Courant",
  "panel.legDetail.rowHeading": "Cap",
  "panel.legDetail.rowSpeed": "Vitesse",
  "panel.legDetail.seaNotObserved": "non observée",
  "panel.legDetail.speedUnit": "kn abs.",
  "panel.legDetail.compassAria": "Vent, vagues et courant autour du bateau, Nord en haut",
  "panel.legDetail.headingValue": "{deg}° · {sail}",
  "panel.legDetail.currentFair": "{speed} kn portant",
  "panel.legDetail.currentFoul": "{speed} kn contraire",
  "panel.legDetail.currentAcross": "{speed} kn de travers",
  "panel.legDetail.currentPlain": "{speed} kn",
  "panel.legDetail.buildUpPolar": "{value} polaire",
  "panel.legDetail.buildUpSea": "{value} mer",
  "panel.legDetail.buildUpCurrent": "{value} courant",
  "panel.legDetail.headerAverage": "Moyenne · {duration}",
  "panel.legDetail.headerHint": "touchez un pas",
  "panel.legDetail.noteMotorOnStep": "au moteur sur ce pas",
  "panel.legDetail.noteAverage.one": "moyenne de {count} pas",
  "panel.legDetail.noteAverage.other": "moyenne de {count} pas",
} as const;
