// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { panel as frPanel } from "../fr/panel";

export const panel: Record<keyof typeof frPanel, string> = {
  // ── PlanForm ───────────────────────────────────────────────────────────────
  "panel.form.calculate": "Calculate the passage",
  "panel.form.compareWindows": "Compare the windows",
  "panel.form.waypointsNeeded": "{count}/2 waypoints",

  // ── PlanHeaderRow ──────────────────────────────────────────────────────────
  "panel.header.newPlan": "New plan",

  // ── parts ──────────────────────────────────────────────────────────────────
  "panel.parts.recompute": "Recalculate",

  // ── ArchetypeSelector / boatLabel ──────────────────────────────────────────
  "panel.boat.custom": "Custom",
  "panel.boat.polarFallback": "polar",
  "panel.boat.detailImported": "{name} · imported",
  "panel.boat.detailAdjusted": "{base} · adjusted",
  "panel.boat.customActiveTitle": "Custom polar active ({detail})",
  "panel.boat.changeTitle": "Change the boat type",
  "panel.boat.edit": "edit",
  "panel.boat.reset": "reset",
  "panel.boat.recapImported": "{name} (imported)",
  "panel.boat.recapAdjusted": "{base} (adjusted)",

  // ── DepartureSlider (shared with DepartureRangeSlider) ─────────────────────
  "panel.departure.arrival": "Arrival",
  "panel.departure.departure": "Departure",
  "panel.departure.ariaArrival": "Desired arrival time",
  "panel.departure.ariaDeparture": "Departure date",
  "panel.departure.slider": "Slider",
  "panel.departure.adjust": "Adjust",
  "panel.departure.today": "Today",
  "panel.departure.tomorrow": "Tomorrow",
  "panel.departure.inDays.one": "In {count} day",
  "panel.departure.inDays.other": "In {count} days",
  "panel.departure.dayPlus": "D+{count}",
  "panel.departure.now": "Now",
  "panel.departure.plusOneWeek": "+1 wk",
  "panel.departure.plusTwoWeeks": "+2 wks",

  // ── DepartureRangeSlider ───────────────────────────────────────────────────
  "panel.range.title": "Departure window",
  "panel.range.spanDays": "{value} d",
  "panel.range.spanHours": "{value} h",
  "panel.range.ariaEarliest": "Earliest departure",
  "panel.range.ariaLatest": "Latest departure",

  // ── SweepForm ──────────────────────────────────────────────────────────────
  "panel.sweep.samplingStep": "Sampling step",
  "panel.sweep.everyHour": "Every hour",
  "panel.sweep.everyNHours": "Every {hours}h",

  // ── SingleResults ──────────────────────────────────────────────────────────
  "panel.results.recapDeparture": "Departure: {day} · {time}",
  "panel.results.recapArrival": "Arrival: {day} · {time}",
  "panel.results.stale": "Route changed. Click Recalculate to update the details.",
  "panel.results.forecastUpdated": "Forecast updated at {time} · Open-Meteo.com (CC BY 4.0)",

  // ── CompareResults ─────────────────────────────────────────────────────────
  "panel.compare.recapStep": "{interval}h step · {boat}",
  "panel.compare.stale":
    "Route changed. Click Recalculate to compare the windows of the new route.",
  "panel.compare.windowsCompared.one":
    "{count} window compared · click a row to open the detailed simulation",
  "panel.compare.windowsCompared.other":
    "{count} windows compared · click a row to open the detailed simulation",

  // ── WindowsTable ───────────────────────────────────────────────────────────
  "panel.windows.colDeparture": "Departure",
  "panel.windows.colDuration": "Duration",
  "panel.windows.colEta": "ETA",
  "panel.windows.colPointOfSail": "Point of sail",
  "panel.windows.colWind": "Wind (kn)",
  "panel.windows.colSea": "Sea",
  "panel.windows.rowTitle": "View this window in detail",
  "panel.windows.complexityTitle": "{label}: {rationale}",
  "panel.windows.sailUpwind": "Upwind",
  "panel.windows.sailBeamReach": "Beam reach",
  "panel.windows.sailBroadReach": "Broad reach",
  "panel.windows.sailDownwind": "Downwind",

  // ── LegList / aggregateLegs ────────────────────────────────────────────────
  "panel.legs.colLeg": "Leg",
  "panel.legs.durationMinutes": "{minutes} min",
  "panel.legs.durationHours": "{hours} h",
  "panel.legs.colDuration": "Duration",
  "panel.legs.colPointOfSail": "Point of sail",
  "panel.legs.colWind": "Wind (kn)",
  "panel.legs.colSea": "Sea",
  "panel.legs.pointOfSail.upwindTacking": "Upwind (tacking)",
  "panel.legs.pointOfSail.upwind": "Upwind",
  "panel.legs.pointOfSail.beamReach": "Beam reach",
  "panel.legs.pointOfSail.broadReach": "Broad reach",
  "panel.legs.pointOfSail.run": "Run",
  "panel.legs.pointOfSail.motor": "Motoring",
  "panel.legs.seaFlag.windAgainstCurrent": "Wind Against Current",
  "panel.legs.seaFlag.heavySea": "Heavy Sea",
  "panel.legs.seaFlag.chop": "Chop",
  "panel.legs.seaFlag.followingChop": "Following Chop",
  "panel.legs.seaFlag.roughSea": "Rough Sea",

  // ── LegDetailCard / LegExpanded ────────────────────────────────────────────
  "panel.legDetail.prevStep": "Previous step",
  "panel.legDetail.nextStep": "Next step",
  "panel.legDetail.rowWind": "Wind",
  "panel.legDetail.rowSea": "Sea",
  "panel.legDetail.rowCurrent": "Current",
  "panel.legDetail.rowHeading": "Heading",
  "panel.legDetail.rowSpeed": "Speed",
  "panel.legDetail.seaNotObserved": "not observed",
  "panel.legDetail.speedUnit": "kn SOG",
  "panel.legDetail.compassAria": "Wind, waves and current around the boat, north at the top",
  "panel.legDetail.headingValue": "{deg}° · {sail}",
  "panel.legDetail.currentFair": "{speed} kn fair",
  "panel.legDetail.currentFoul": "{speed} kn foul",
  "panel.legDetail.currentAcross": "{speed} kn across",
  "panel.legDetail.currentPlain": "{speed} kn",
  "panel.legDetail.buildUpPolar": "{value} polar",
  "panel.legDetail.buildUpSea": "{value} sea",
  "panel.legDetail.buildUpCurrent": "{value} current",
  "panel.legDetail.headerAverage": "Average · {duration}",
  "panel.legDetail.headerHint": "tap a step",
  "panel.legDetail.noteMotorOnStep": "under engine on this step",
  "panel.legDetail.noteAverage.one": "average of {count} step",
  "panel.legDetail.noteAverage.other": "average of {count} steps",
};
