// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { plan as frPlan } from "../fr/plan";

export const plan: Record<keyof typeof frPlan, string> = {
  // ── PlanPage ──────────────────────────────────────────────────────────────
  "plan.page.urlError.title": "Ungültige URL",
  "plan.page.urlError.back": "← Wetter erkunden",
  "plan.page.backToExplore": "Zurück zur Erkundung",
  "plan.page.hint.placeStart": "Klicken, um die Abfahrt zu setzen",
  "plan.page.hint.drawRoute": "Klicken, um Ihre Route zu zeichnen",
  "plan.panel.resize": "Panelgröße ändern",

  // ── Totals: panel block and mobile strip ──────────────────────────────────
  "plan.hero.distance": "Distanz",
  "plan.hero.duration": "Dauer",
  "plan.hero.arrival": "Ankunft",
  "plan.hero.openDetail": "Törndetails ansehen",

  // ── Segment bar, under the totals ─────────────────────────────────────────
  "plan.segmentBar.groupLabel": "Abschnitte des Törns, ein Klick öffnet den Abschnitt",
  "plan.segmentBar.progressLabel": "Windverteilung je Segment",
  "plan.segmentBar.stepLabel":
    "Teilstrecke {from}→{to}, Abschnitt {index} von {total}, {start} → {end}, {tws} kn",
  "plan.segmentBar.timeLabel": "{start} → {end}, {tws} kn",

  // ── Panel states ──────────────────────────────────────────────────────────
  "plan.states.empty.title": "Zeichnen Sie Ihre Route",
  "plan.states.empty.body":
    "Klicken Sie auf die Karte, um Abfahrt und Ankunft zu setzen. Danach können Sie die Fahrtzeit simulieren oder mehrere Abfahrtsfenster vergleichen.",
  "plan.states.picker.title": "Was möchten Sie tun?",
  "plan.states.picker.single.body":
    "Sie wissen, wann Sie ablegen. OhMyWind berechnet die Fahrtzeit, die ETA und die Bedingungen auf jedem Segment.",
  "plan.states.picker.single.example":
    "Z. B.: „Wenn ich Samstag um 17:00 ablege, wann komme ich an?“",
  "plan.states.picker.compare.body":
    "Sie wissen, wohin es geht. OhMyWind testet mehrere Abfahrtszeiten und ordnet die Fenster nach Komfort.",
  "plan.states.picker.compare.example":
    "Z. B.: „Welche ist die beste Abfahrt zwischen Samstag und Montag?“",
  "plan.states.error.title": "Fehler",
  "plan.recap.edit": "Ändern",

  // ── Mode picker and time anchor ───────────────────────────────────────────
  "plan.mode.tablist": "Planungsmodus",
  "plan.mode.single.title": "Meine Route simulieren",
  "plan.mode.single.sub": "Wie lange dauert dieser Törn?",
  "plan.mode.compare.title": "Fenster vergleichen",
  "plan.mode.compare.sub": "Das beste Fenster zum Ablegen?",
  "plan.timeAnchor.tablist": "Zeitbezug",
  "plan.timeAnchor.departure.title": "Abfahrt festlegen",
  "plan.timeAnchor.departure.sub": "Die Fahrtzeit verstehen",
  "plan.timeAnchor.arrival.title": "Ankunft festlegen",
  "plan.timeAnchor.arrival.sub": "Wann spätestens ablegen?",

  // ── Steps of a leg ────────────────────────────────────────────────────────
  "plan.steps.groupLabel": "Rechenabschnitte der Teilstrecke",
  "plan.steps.stepLabel": "Abschnitt {index} von {total}, {time}",
  "plan.steps.viewToggle.label": "Anzeige der Teilstrecke",
  "plan.steps.viewToggle.average": "Mittel",
  "plan.steps.viewToggle.detail": "Detail",

  // ── Map ───────────────────────────────────────────────────────────────────
  "plan.map.waypoint.remove": "Diesen Wegpunkt entfernen",

  // ── Comparison window validation ──────────────────────────────────────────
  "plan.sweep.errors.missingWindow": "Geben Sie ein Abfahrtsfenster an.",
  "plan.sweep.errors.invalidDates": "Ungültige Datumsangaben.",
  "plan.sweep.errors.latestBeforeEarliest":
    "Das „spätestens“ muss nach dem „frühestens“ liegen.",
  "plan.sweep.errors.beyondHorizon":
    "Die Vorhersage ist nur über {days} Tage verlässlich. Wählen Sie ein früheres Datum.",
  "plan.sweep.errors.tooManyWindows":
    "Zu viele Fenster zum Vergleichen ({windows}). Verkleinern Sie das Fenster oder vergrößern Sie die Schrittweite.",

  // ── URL parsing ───────────────────────────────────────────────────────────
  "plan.url.errors.tooFewWaypoints": "Mindestens 2 Wegpunkte erforderlich",
  "plan.url.errors.invalidWaypoint": 'ungültiger Wegpunkt: "{value}"',
  "plan.url.errors.latitudeOutOfRange": "Breitengrad außerhalb des Bereichs: {value}",
  "plan.url.errors.longitudeOutOfRange": "Längengrad außerhalb des Bereichs: {value}",
  "plan.url.errors.invalidWaypoints": "Ungültige Wegpunkte: {detail}",

  // ── Passage API errors ────────────────────────────────────────────────────
  "plan.api.errors.retryDelay.vague": "Warten Sie einige Minuten, bevor Sie neu starten.",
  "plan.api.errors.retryDelay.seconds.one": "Warten Sie {count} Sekunde, bevor Sie neu starten.",
  "plan.api.errors.retryDelay.seconds.other": "Warten Sie {count} Sekunden, bevor Sie neu starten.",
  "plan.api.errors.retryDelay.minutes.one": "Warten Sie {count} Minute, bevor Sie neu starten.",
  "plan.api.errors.retryDelay.minutes.other": "Warten Sie {count} Minuten, bevor Sie neu starten.",
  "plan.api.errors.serverStatus": "Serverfehler {status}",
  "plan.api.errors.forecastHorizon":
    "Der Wetterdienst konnte diesen Zeitraum nicht abdecken. Wählen Sie ein näheres Datum (bis etwa 10 Tage, je nach Modell). Damit Ihre Planung erhalten bleibt, laden Sie die Seite erst neu, wenn Sie das Datum angepasst haben.",
  "plan.api.errors.tooFewWaypoints":
    "Setzen Sie mindestens 2 Wegpunkte auf die Karte, um eine Route zu berechnen.",
  "plan.api.errors.waypointOutOfRange":
    "Ein Wegpunkt liegt außerhalb gültiger Koordinaten. Setzen Sie ihn erneut auf die Karte.",
  "plan.api.errors.tooManyWaypoints":
    "Zu viele Wegpunkte auf dieser Route. Entfernen Sie einige, um sie zu vereinfachen.",
  "plan.api.errors.rateLimited": "Zu viele Berechnungen kurz hintereinander gestartet. {delay}",
  "plan.api.errors.unknownArchetype":
    "Unbekannter Bootstyp. Wählen Sie einen Bootstyp aus der Liste.",
  "plan.api.errors.invalidDatetime":
    "Ungültiges Datum. Prüfen Sie das Format der Datumsfelder.",
  "plan.api.errors.naiveDatetime": "Die Ankunftszeit muss die Zeitzone enthalten.",
  "plan.api.errors.sweepTooLarge":
    "Zu viele Fenster zum Vergleichen. Verkleinern Sie das Fenster oder vergrößern Sie den Abtastschritt.",
  "plan.api.errors.upstreamTimeout":
    "Der Wetterdienst hat zu lange für die Antwort gebraucht. Versuchen Sie es in Kürze erneut.",
  "plan.api.errors.upstreamRateLimited":
    "Der Wetterdienst drosselt vorübergehend unsere Anfragen. Das liegt nicht an Ihrer Nutzung, versuchen Sie es in einigen Minuten erneut.",
  "plan.api.errors.upstreamUnavailable":
    "Der Server ist derzeit nicht erreichbar, vielleicht startet er gerade neu. {delay}",
  "plan.api.errors.bodyTooLarge":
    "Die Route ist zu detailliert, um gesendet zu werden. Entfernen Sie einige Wegpunkte oder verkürzen Sie den Zeitraum.",
  "plan.api.errors.invalidForecastCache":
    "Die vom Browser vorbereiteten Wetterdaten wurden abgelehnt. Versuchen Sie es erneut: Die Berechnung startet dann mit den Daten des Servers.",
  "plan.api.errors.serverUnavailable":
    "Der Wetterserver ist nicht verfügbar. Versuchen Sie es in Kürze erneut.",
  "plan.api.errors.networkUnreachable":
    "Der Server ist nicht erreichbar. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
  "plan.api.errors.invalidResponse":
    "Der Server hat eine unerwartete Antwort geliefert. Versuchen Sie es in Kürze erneut.",
};
