// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { plan as frPlan } from "../fr/plan";

export const plan: Record<keyof typeof frPlan, string> = {
  // ── PlanPage ──────────────────────────────────────────────────────────────
  "plan.page.urlError.title": "Ungültige URL",
  "plan.page.urlError.back": "← Wetter erkunden",
  "plan.page.hint.placeStart": "Klicken, um die Abfahrt zu setzen",
  "plan.page.hint.drawRoute": "Klicken, um Ihre Route zu zeichnen",
  "plan.panel.resize": "Panelgröße ändern",

  // ── Totals: panel block and mobile strip ──────────────────────────────────
  "plan.hero.distance": "Distanz",
  "plan.hero.duration": "Dauer",
  "plan.hero.arrival": "Ankunft",

  // ── Segment bar, under the totals ─────────────────────────────────────────
  "plan.segmentBar.groupLabel": "Abschnitte des Törns, ein Klick öffnet den Abschnitt",
  "plan.segmentBar.progressLabel": "Windverteilung je Segment",
  "plan.segmentBar.stepLabel":
    "Teilstrecke {from}→{to}, Abschnitt {index} von {total}, {start} → {end}, {tws} kn",
  "plan.segmentBar.timeLabel": "{start} → {end}, {tws} kn",

  // ── Panel states ──────────────────────────────────────────────────────────
  "plan.states.empty.title": "Zeichnen Sie Ihre Route",
  "plan.states.empty.body":
    "Klicken Sie auf die Karte, um Abfahrt und Ankunft zu setzen. Danach können Sie den Törn berechnen und dann andere Abfahrten oder andere Routen vergleichen.",
  "plan.states.error.title": "Fehler",
  "plan.states.waking.title": "Der Wetterserver wacht auf",
  "plan.states.waking.body":
    "Er war im Ruhezustand: die Berechnung startet in {seconds} s von selbst neu (Versuch {attempt} von {max}).",
  "plan.states.waking.retryNow": "Jetzt erneut versuchen",
  "plan.recap.edit": "Ändern",

  // ── Mode picker and time anchor ───────────────────────────────────────────
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
  "plan.map.waypoint.removed": "Wegpunkt {n} entfernt",
  "plan.map.waypoint.undo": "Rückgängig",

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
  "plan.notice.passage.long_route":
    "lange Route ({route_nm} nm): {points} Wetterpunkte abgetastet (~{spacing_nm} nm Abstand) statt alle {requested_nm} nm, um API-Anfragen zu begrenzen.",
  "plan.notice.passage.light_wind":
    "schwacher Wind: Mindestgeschwindigkeit {min_speed_kn} kn, sehr langsame Passage",
  "plan.notice.passage.model_fallback":
    "Modell {model} ohne Daten an {fallback_count}/{total} Punkten (vermutlich außerhalb der Abdeckung); automatischer Rückgriff auf {others}",
  "plan.notice.currents.tidal_gap": "Wahrscheinlich starke Gezeitenströme ({zones}), die unsere Quellen nicht auflösen: Die angezeigten Strömungen stammen aus einem Gitter von 2 bis 8 km, das sie nicht sieht. Wir arbeiten daran, unsere Abdeckung zu erweitern, aber nicht alle Daten sind frei zugänglich.",
  "plan.notice.currents.pass_unresolved": "Enge vom Strömungsatlas nicht aufgelöst ({zones}): Sein Gitter liest dort höchstens einen Bruchteil des veröffentlichten Springstroms, die angezeigten Strömungen sind unterschätzt. Prüfen Sie die örtlichen Stromtabellen oder den Stromatlas.",
  "plan.notice.complexity.wind.3": "Frischer Wind: TWS {tws_range} kn auf {nm} nm",
  "plan.notice.complexity.wind.4": "Starker Wind: TWS {tws_range} kn auf {nm} nm",
  "plan.notice.complexity.wind.5": "Sehr starker Wind: TWS {tws_range} kn auf {nm} nm",
  "plan.notice.complexity.sea.3": "Grobe See: Hs {hs_range} m auf {nm} nm",
  "plan.notice.complexity.sea.4": "Sehr grobe See: Hs {hs_range} m auf {nm} nm",
  "plan.notice.complexity.sea.5": "Hohe See: Hs {hs_range} m auf {nm} nm",
  "plan.notice.complexity.current":
    "Wind gegen Strom: {current_range} kn Gegenstrom auf {nm} nm, kabbelige See wahrscheinlich",
  "plan.notice.complexity.chop_short":
    "Kurze Kabbelsee: Hs {hs_range} m bei Tp {tp_range} s auf {nm} nm, unangenehme See",
  "plan.notice.complexity.chop_following":
    "Mitlaufende Kabbelsee: Hs {hs_range} m bei Tp {tp_range} s auf {nm} nm",
  "plan.notice.sweep.widened_interval":
    "Abtastung auf alle {effective_h} h erweitert (statt {requested_h} h): die Route hat {segments} Abschnitte, zu viele, um so viele Zeitfenster zu simulieren.",
  "plan.notice.sweep.skipped_windows":
    "{skipped} Zeitfenster ohne Wetterabdeckung übersprungen (Horizont überschritten): die restlichen {kept} werden angezeigt.",
  "plan.notice.sweep.no_window_near_eta":
    "kein Zeitfenster kommt innerhalb von ±2 h um target_eta={target_eta} an; alle {count} Zeitfenster zurückgegeben",
};
