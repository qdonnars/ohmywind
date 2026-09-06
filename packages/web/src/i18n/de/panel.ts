// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { panel as frPanel } from "../fr/panel";

export const panel: Record<keyof typeof frPanel, string> = {
  // ── PlanForm ───────────────────────────────────────────────────────────────
  "panel.form.calculate": "Törn berechnen",
  "panel.form.compareWindows": "Fenster vergleichen",
  "panel.form.waypointsNeeded": "{count}/2 Wegpunkte",

  // ── PlanHeaderRow ──────────────────────────────────────────────────────────
  "panel.header.newPlan": "Neuer Plan",

  // ── parts ──────────────────────────────────────────────────────────────────
  "panel.parts.recompute": "Neu berechnen",

  // ── ArchetypeSelector / boatLabel ──────────────────────────────────────────
  "panel.boat.custom": "Eigen",
  "panel.boat.polarFallback": "Polare",
  "panel.boat.detailImported": "{name} · importiert",
  "panel.boat.detailAdjusted": "{base} · angepasst",
  "panel.boat.customActiveTitle": "Eigene Polare aktiv ({detail})",
  "panel.boat.changeTitle": "Bootstyp wechseln",
  "panel.boat.edit": "bearbeiten",
  "panel.boat.reset": "zurücksetzen",
  "panel.boat.recapImported": "{name} (importiert)",
  "panel.boat.recapAdjusted": "{base} (angepasst)",

  // ── DepartureSlider (shared with DepartureRangeSlider) ─────────────────────
  "panel.departure.arrival": "Ankunft",
  "panel.departure.departure": "Abfahrt",
  "panel.departure.ariaArrival": "Gewünschte Ankunftszeit",
  "panel.departure.ariaDeparture": "Abfahrtsdatum",
  "panel.departure.slider": "Regler",
  "panel.departure.adjust": "Anpassen",
  "panel.departure.today": "Heute",
  "panel.departure.tomorrow": "Morgen",
  "panel.departure.inDays.one": "In {count} Tag",
  "panel.departure.inDays.other": "In {count} Tagen",
  "panel.departure.dayPlus": "T+{count}",
  "panel.departure.now": "Jetzt",
  "panel.departure.plusOneWeek": "+1 Wo.",
  "panel.departure.plusTwoWeeks": "+2 Wo.",

  // ── DepartureRangeSlider ───────────────────────────────────────────────────
  "panel.range.title": "Abfahrtsfenster",
  "panel.range.spanDays": "{value} T",
  "panel.range.spanHours": "{value} h",
  "panel.range.ariaEarliest": "Frühestmögliche Abfahrt",
  "panel.range.ariaLatest": "Spätestmögliche Abfahrt",

  // ── SweepForm ──────────────────────────────────────────────────────────────
  "panel.sweep.samplingStep": "Abtastschritt",
  "panel.sweep.everyHour": "Stündlich",
  "panel.sweep.everyNHours": "Alle {hours} h",

  // ── SingleResults ──────────────────────────────────────────────────────────
  "panel.results.recapDeparture": "Abfahrt: {day} · {time}",
  "panel.results.recapArrival": "Ankunft: {day} · {time}",
  "panel.results.stale":
    "Route geändert. Klicken Sie auf Neu berechnen, um die Details zu aktualisieren.",
  "panel.results.forecastUpdated":
    "Daten aktualisiert um {time} · Open-Meteo.com (CC BY 4.0)",

  // ── CompareResults ─────────────────────────────────────────────────────────
  "panel.compare.recapStep": "Schritt {interval} h · {boat}",
  "panel.compare.stale":
    "Route geändert. Klicken Sie auf Neu berechnen, um die Fenster der neuen Route zu vergleichen.",
  "panel.compare.windowsCompared.one":
    "{count} Fenster verglichen · klicken Sie auf eine Zeile, um die detaillierte Simulation zu öffnen",
  "panel.compare.windowsCompared.other":
    "{count} Fenster verglichen · klicken Sie auf eine Zeile, um die detaillierte Simulation zu öffnen",

  // ── WindowsTable ───────────────────────────────────────────────────────────
  "panel.windows.colDeparture": "Abfahrt",
  "panel.windows.colDuration": "Dauer",
  "panel.windows.colEta": "ETA",
  "panel.windows.colPointOfSail": "Kurs",
  "panel.windows.colWind": "Wind (kn)",
  "panel.windows.colSea": "See",
  "panel.windows.rowTitle": "Dieses Fenster im Detail ansehen",
  "panel.windows.complexityTitle": "{label}: {rationale}",
  "panel.windows.sailUpwind": "Am Wind",
  "panel.windows.sailBeamReach": "Halbwind",
  "panel.windows.sailBroadReach": "Raumschots",
  "panel.windows.sailDownwind": "Vor dem Wind",

  // ── LegList / aggregateLegs ────────────────────────────────────────────────
  "panel.legs.colLeg": "Teilstr.",
  "panel.legs.durationMinutes": "{minutes} min",
  "panel.legs.durationHours": "{hours} h",
  "panel.legs.colDuration": "Dauer",
  "panel.legs.colPointOfSail": "Kurs",
  "panel.legs.colWind": "Wind (kn)",
  "panel.legs.colSea": "See",
  "panel.legs.pointOfSail.upwindTacking": "Am Wind (kreuzend)",
  "panel.legs.pointOfSail.upwind": "Am Wind",
  "panel.legs.pointOfSail.beamReach": "Halbwind",
  "panel.legs.pointOfSail.broadReach": "Raumschots",
  "panel.legs.pointOfSail.run": "Vor dem Wind",
  "panel.legs.pointOfSail.motor": "Unter Motor",
  "panel.legs.seaFlag.windAgainstCurrent": "Wind gegen Strom",
  "panel.legs.seaFlag.heavySea": "Schwere See",
  "panel.legs.seaFlag.chop": "Kabbelwasser",
  "panel.legs.seaFlag.followingChop": "Mitlaufende Kabbelsee",
  "panel.legs.seaFlag.roughSea": "Grobe See",

  // ── LegDetailCard / LegExpanded ────────────────────────────────────────────
  "panel.legDetail.prevStep": "Vorheriger Abschnitt",
  "panel.legDetail.nextStep": "Nächster Abschnitt",
  "panel.legDetail.rowWind": "Wind",
  "panel.legDetail.rowSea": "See",
  "panel.legDetail.rowCurrent": "Strom",
  "panel.legDetail.rowHeading": "Kurs",
  "panel.legDetail.rowSpeed": "Fahrt",
  "panel.legDetail.seaNotObserved": "nicht beobachtet",
  "panel.legDetail.speedUnit": "kn SOG",
  "panel.legDetail.compassAria": "Wind, Wellen und Strom rund um das Boot, Norden oben",
  "panel.legDetail.headingValue": "{deg}° · {sail}",
  "panel.legDetail.currentFair": "{speed} kn mitlaufend",
  "panel.legDetail.currentFoul": "{speed} kn gegenlaufend",
  "panel.legDetail.currentAcross": "{speed} kn querlaufend",
  "panel.legDetail.currentPlain": "{speed} kn",
  "panel.legDetail.buildUpPolar": "{value} Polare",
  "panel.legDetail.buildUpSea": "{value} See",
  "panel.legDetail.buildUpCurrent": "{value} Strom",
  "panel.legDetail.buildUpMotor": "{value} Motor",
  "panel.legDetail.headerAverage": "Mittel · {duration}",
  "panel.legDetail.headerHint": "einen Abschnitt antippen",
  "panel.legDetail.noteMotorOnStep": "unter Motor auf diesem Abschnitt",
  "panel.legDetail.noteAverage.one": "Mittel aus {count} Abschnitt",
  "panel.legDetail.noteAverage.other": "Mittel aus {count} Abschnitten",
};
