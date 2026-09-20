// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { config as frConfig } from "../fr/config";

export const config: Record<keyof typeof frConfig, string> = {
  "config.lang.label": "Sprache",

  "config.header.title": "Konfiguration",
  "config.reset": "Zurücksetzen",
  "config.saved": "· gespeichert",
  "config.storageNote":
    "OhMyWind bietet bewusst keine Benutzerkonten: Es werden keine Daten an einen Server gesendet, um Sie zu identifizieren. Ihre Einstellungen (Modelle, eigene Polare) liegen lokal in Ihrem Browser. Wenn Sie das Gerät oder den Browser wechseln oder die Cookies dieser Website löschen, gehen diese Anpassungen verloren.",

  "config.models.title": "Wettermodelle",
  "config.models.intro":
    "Die ersten {limit} Modelle erscheinen in dieser Reihenfolge in der Vorhersagetabelle. Zum Umsortieren ziehen und ablegen (mobil: eine Zeile gedrückt halten oder direkt den Griff ⋮⋮ nutzen). Diese Einstellung wirkt sich nicht auf die Törnpläne aus.",
  "config.models.zoneActive": "In der App genutzt",
  "config.models.zoneIgnored": "Ignoriert",
  "config.models.horizonHours": "{hours} h",
  "config.models.horizonDays": "{days} T",

  "config.models.arome.description":
    "Hoch auflösend von Météo-France, erfasst thermische Effekte und die Abdeckung durch die Küste.",
  "config.models.arome.coverage": "Frankreich",
  "config.models.arpegeEu.description":
    "Französisches Modell für die mittlere Frist, verlängert AROME.",
  "config.models.arpegeEu.coverage": "Europa",
  "config.models.arpegeW.description": "Globales Leitmodell von Météo-France, grobe Auflösung.",
  "config.models.arpegeW.coverage": "Global",
  "config.models.icon.description":
    "Europäisches Regionalmodell, guter Kompromiss aus Reichweite / Genauigkeit.",
  "config.models.icon.coverage": "Europa",
  "config.models.iconGlobal.description": "Globale Fassung von ICON, größere Reichweite.",
  "config.models.iconGlobal.coverage": "Global",
  "config.models.iconD2.description":
    "Sehr hohe Auflösung vom DWD, nützliche Randabdeckung über Ostfrankreich.",
  "config.models.iconD2.coverage": "Deutschland + Grenzgebiete",
  "config.models.ecmwf.description": "Referenz für die mittlere Frist, gröbere Auflösung.",
  "config.models.ecmwf.coverage": "Global",
  "config.models.ecmwfAifs.description": "KI-Modell von ECMWF, Güte nahe am IFS.",
  "config.models.ecmwfAifs.coverage": "Global (KI)",
  "config.models.gfs.description":
    "Sehr große Reichweite, Böen bei schwachem Wind wenig verlässlich.",
  "config.models.gfs.coverage": "Global",
  "config.models.ukmo.description": "Globalmodell des Met Office, stark über dem Nordatlantik.",
  "config.models.ukmo.coverage": "Global",
  "config.models.ukmoUk.description":
    "Hoch auflösendes UK-Modell, nützlich im westlichen Ärmelkanal.",
  "config.models.ukmoUk.coverage": "Britische Inseln + Ärmelkanal",
  "config.models.gem.description": "Kanadisches Globalmodell, nützliche Ergänzung.",
  "config.models.gem.coverage": "Global",
  "config.models.dmiHarmonie.description":
    "Hoch auflösendes skandinavisches Modell, nützlich im Ärmelkanal und in der Nordsee.",
  "config.models.dmiHarmonie.coverage": "Nordeuropa + Ärmelkanal",
  "config.models.metnoNordic.description":
    "Norwegisches Modell mit sehr hoher Auflösung über der Nordsee.",
  "config.models.metnoNordic.coverage": "Skandinavien + Nordsee",

  "config.boat.title": "Boot",
  "config.boat.intro":
    "Beschreiben Sie Ihr Boot: Diese Einstellungen fließen in jede Törnplanung ein. Für den Anfang genügt das Wesentliche; über die Kachel Erweitert importieren Sie Ihr eigenes Polardiagramm und verfeinern das Verhalten am Wind und unter Spinnaker.",
  "config.boat.resetAll": "Alles zurücksetzen",

  "config.boat.archetype.cruiser20ft": "20-Fuß-Fahrtenyacht",
  "config.boat.archetype.cruiser25ft": "25-Fuß-Fahrtenyacht",
  "config.boat.archetype.cruiser30ft": "30-Fuß-Fahrtenyacht",
  "config.boat.archetype.cruiser40ft": "40-Fuß-Fahrtenyacht",
  "config.boat.archetype.cruiser50ft": "50-Fuß-Fahrtenyacht",
  "config.boat.archetype.racerCruiser": "Racer-Cruiser",
  "config.boat.archetype.catamaran40ft": "40-Fuß-Katamaran",

  "config.boat.essentials.title": "Wesentliches",
  "config.boat.essentials.myBoat": "Mein Boot",
  "config.boat.essentials.importedActive":
    "Importierte Polare aktiv: Die Bootswahl gilt im Bootstyp-Modus.",
  "config.boat.essentials.coefficient": "Leistungsfaktor ({percent} %)",
  "config.boat.essentials.coefficientHint":
    "100 % entsprechen dem theoretischen Polardiagramm, gerechnet mit leerem Boot und Regattasegeln: in der Praxis segelt man darunter. Der Vorgabewert ist ein guter Ausgangspunkt; senken Sie ihn, wenn das Boot beladen ist oder die Segel müde sind.",
  "config.boat.essentials.coefficientHintImported":
    "Polare auf Ihrem eigenen Boot gemessen? Dann sind 100 % gerechtfertigt.",

  "config.boat.motor.legend": "Motor (optional)",
  "config.boat.motor.thresholdLabel": "Schwellengeschwindigkeit (kn)",
  "config.boat.motor.speedLabel": "Motorgeschwindigkeit (kn)",
  "config.boat.motor.thresholdPlaceholder": "z. B. 2",
  "config.boat.motor.speedPlaceholder": "z. B. 5",
  "config.boat.motor.hint":
    "Unterhalb der aus der Polare berechneten Schwellengeschwindigkeit wird auf Motor umgeschaltet (bis {max} kn). Lassen Sie beide Felder leer, um zu 100 % unter Segeln zu bleiben (Standardverhalten).",
  "config.boat.motor.clamped":
    "Wert auf {max} kn begrenzt, die Obergrenze des Simulators: darüber ist die Wetterabschätzung je Teilstrecke nicht mehr verlässlich.",
  "config.boat.motor.halfSet":
    "Füllen Sie beide Werte aus, um den Motor zu aktivieren. Solange nur ein Feld gefüllt ist, bleibt die Simulation zu 100 % unter Segeln.",
  "config.boat.motor.inverted":
    "Die Schwellengeschwindigkeit liegt über der Motorgeschwindigkeit: Auf Teilstrecken, die dazwischen segeln, würde der Motor das Boot bremsen. Prüfen Sie beide Werte.",

  "config.boat.advanced.title": "Erweitert",
  "config.boat.advanced.subtitle": "eigene Polare, Am-Wind-Winkel, Spinnaker",
  "config.boat.advanced.polarFile": "Polardatei",
  "config.boat.advanced.importFile": "Datei importieren…",
  "config.boat.advanced.replaceFile": "Datei ersetzen…",
  "config.boat.advanced.removeFile": "Entfernen",
  "config.boat.advanced.activePolar": "Aktive Polare",
  "config.boat.advanced.sourceImported": "Importierte Polare",
  "config.boat.advanced.sourceArchetype": "Angepasster Bootstyp",
  "config.boat.advanced.formatHint":
    "Standardformat (qtVlm, Expedition, MaxSea): erste Zeile = Windgeschwindigkeiten (TWS), eine Zeile je Winkel (TWA), getrennt durch Tabulatoren, Semikolons oder Kommas. Endungen .pol, .csv oder .txt.",
  "config.boat.advanced.exampleFile":
    "<a>Beispieldatei herunterladen (.csv)</a>: die Polare der 30-Fuß-Fahrtenyacht, zum Öffnen in einer Tabellenkalkulation und Ersetzen durch die Werte Ihres Bootes.",
  "config.boat.advanced.minUpwind": "Kleinster Am-Wind-Winkel",
  "config.boat.advanced.minUpwindPlaceholder": "auto ({deg}°)",
  "config.boat.advanced.minUpwindAuto": "Auto",
  "config.boat.advanced.minUpwindHint":
    "Unterhalb dieses Windwinkels geht das Boot nicht mehr höher an den Wind: Der Simulator kreuzt im besten VMG-Winkel und das Diagramm graut die Totzone aus. Auto = Wert des Bootstyps ({archetype}) oder erster Winkel der importierten Datei. Ein Winkel enger als die Daten der Polare verlängert die Kurve bei konstantem VMG, ohne die simulierten Geschwindigkeiten zu verbessern.",
  "config.boat.advanced.spinnaker": "Spinnaker",
  "config.boat.advanced.spiKind": "Spinnakertyp",
  "config.boat.advanced.spiOff": "Keiner",
  "config.boat.advanced.spiAsymmetric": "Asymmetrisch",
  "config.boat.advanced.spiAsymmetricTitle":
    "Asymmetrisch: bester Bereich raumschots 110-135°, bis 150° nutzbar beim Anluven",
  "config.boat.advanced.spiSymmetric": "Symmetrisch",
  "config.boat.advanced.spiSymmetricTitle":
    "Symmetrisch: optimal vor dem Wind, 135-165° (Spinnakerbaum erforderlich)",
  "config.boat.advanced.spiDouse": "Bergen oberhalb von",
  "config.boat.advanced.spiLocked":
    "Importierte Polare aktiv: Die Spinnaker-Einstellung ist gesperrt, es wird angenommen, dass Ihre Datei Ihre Segelgarderobe bereits abbildet.",
  "config.boat.advanced.spiThresholdHint":
    "Der Geschwindigkeitsgewinn auf raumen Kursen gilt nur für Windkurven bis zu diesem Schwellenwert.",
  "config.boat.advanced.tuning": "Manuelle Anpassung",
  "config.boat.advanced.tunedPoints": "{count} Punkt(e) angepasst",
  "config.boat.advanced.tuningHint":
    "Ziehen Sie einen Punkt der gewählten Kurve, um seine Geschwindigkeit festzulegen (Rohwerte, vor dem Faktor). Angepasste Punkte bleiben erhalten, wenn Sie den Spinnaker wechseln.",
  "config.boat.advanced.rawSubtitle": "Rohwerte · zum Anpassen ziehen",
  "config.boat.advanced.clearTuning": "Anpassungen löschen",

  "config.boat.result.title": "Resultierende Polare",
  "config.boat.result.tileSubtitle": "was die Planung verwenden wird",
  "config.boat.result.subtitle":
    "resultierende Polare · Faktor ×{coefficient} · Am Wind {upwind}°",
  "config.boat.result.spiAsymmetric": "asymmetrischer Spinnaker ≤ {tws} kn",
  "config.boat.result.spiSymmetric": "symmetrischer Spinnaker ≤ {tws} kn",

  "config.polar.curveShown": "Angezeigte Kurve (TWS)",
  "config.polar.curveEditable": "Bearbeitbare Kurve (TWS)",
  "config.polar.diagram": "Polardiagramm: {title}",
  "config.polar.handle": "TWA {twa}° · {speed} kn",
  "config.polar.handleEditable": "TWA {twa}° · {speed} kn (zum Anpassen ziehen)",

  "config.polarImport.defaultName": "Importierte Polare",
  "config.polarImport.ok": "„{name}“ importiert ({tws} Windgeschwindigkeiten × {twa} Winkel).",
  "config.polarImport.tooLarge":
    "Datei zu groß: Eine Polare umfasst wenige kB, prüfen Sie, ob es die richtige Datei ist.",
  "config.polarImport.unreadable":
    "Diese Datei kann nicht gelesen werden. Erwartetes Format: Text mit einer TWS-Kopfzeile, dann eine Zeile je TWA-Winkel.",
  "config.polarImport.errors.empty": "Leere Datei: keine Datenzeile gefunden.",
  "config.polarImport.errors.badHeader":
    'Erste Zeile unlesbar: Sie muss die Windgeschwindigkeiten (TWS) auflisten, zum Beispiel "TWA\\TWS  6  8  10  12  16  20".',
  "config.polarImport.errors.badTws":
    "Zeile {line}: ungültiger TWS „{value}“ (erwartet wird eine Zahl zwischen 0 und {max} kn).",
  "config.polarImport.errors.tooFewTws":
    "Die Datei braucht mindestens 2 Windspalten (TWS).",
  "config.polarImport.errors.tooManyTws": "Zu viele TWS-Spalten ({count}, Maximum {max}).",
  "config.polarImport.errors.badTwa":
    "Zeile {line}: ungültiger TWA-Winkel „{value}“ (erwartet wird eine Zahl zwischen 0 und 180°).",
  "config.polarImport.errors.speedCount":
    "Zeile {line}: {found} Geschwindigkeit(en) gefunden, {expected} erwartet (eine je TWS-Spalte).",
  "config.polarImport.errors.badSpeed":
    "Zeile {line}: ungültige Bootsgeschwindigkeit „{value}“ (erwartet wird eine Zahl ≥ 0).",
  "config.polarImport.errors.tooFewTwa":
    "Die Datei braucht mindestens 2 Winkelzeilen (TWA).",
  "config.polarImport.errors.tooManyTwa": "Zu viele TWA-Zeilen ({count}, Maximum {max}).",
  "config.polarImport.errors.duplicateTws":
    "Doppelte TWS-Spalte: {tws} kn kommt zweimal vor.",
  "config.polarImport.errors.duplicateTwa": "Zeile {line}: doppelter TWA-Winkel ({twa}°).",
  "config.polarImport.warnings.clamped":
    "{count} Geschwindigkeit(en) über {max} kn auf {max} kn begrenzt.",

  "config.docs.methodology": "Methodik",

  // The tidal-sources map on /methodologie (TidalSourcesMap).
  "config.methodo.tidal.hint": "Klicken Sie auf das Meer: die Karte zeigt die Quelle, die die App an dieser Stelle nutzt, so wie der Server sie auswählt.",
  "config.methodo.tidal.legend.title": "Wo der Gezeitenstrom 1,5 kn übersteigt",
  "config.methodo.tidal.legend.covered": "Abgedeckt: eine Gezeitenquelle mit 5 km oder feiner",
  "config.methodo.tidal.legend.target": "Nicht abgedeckt, offene Quelle identifiziert",
  "config.methodo.tidal.legend.blocked": "Nicht abgedeckt, Daten vorhanden, aber geschlossen oder unklar",
  "config.methodo.tidal.legend.unknown": "Nicht abgedeckt, keine bekannte Quelle",
  "config.methodo.tidal.legend.passes": "Bekannte Passagen und Raz, gleiche Farben; eine Passage gilt nur bei 1 km oder feiner als abgedeckt, auch mitten in einer grünen Zone",
  "config.methodo.tidal.legend.objective": "Zielgebiet",
  "config.methodo.tidal.note": "Anderswo nutzt die App das globale Open-Meteo-Modell SMOC mit 8 km. Die Berechnung „wo es Strom gibt“ stammt aus den Atlanten ATLNE (2 km) und FES2014 (7 km): eine Passage, die schmaler als das Gitter ist, erscheint dort nicht, die bekannten Passagen ergänzen sie.",
  "config.methodo.tidal.popup.title": "Hier nutzt die App",
  "config.methodo.tidal.popup.loading": "Server wird abgefragt…",
  "config.methodo.tidal.popup.error": "Server nicht erreichbar: keine Antwort für diesen Punkt.",
  "config.methodo.tidal.popup.source": "Quelle",
  "config.methodo.tidal.popup.smoc": "Open-Meteo SMOC, globales Modell mit 8 km",
  "config.methodo.tidal.popup.atlas": "Harmonischer Atlas, Gitter {size}",
  "config.methodo.tidal.popup.shom": "SHOM Atlas C2D, Messpunkt {distance} m entfernt",
  "config.methodo.tidal.popup.precision": "Genauigkeit",
  "config.methodo.tidal.precision.fine": "fein (500 m oder besser)",
  "config.methodo.tidal.precision.medium": "mittel (bis 1 km)",
  "config.methodo.tidal.precision.coarse": "grob (1 bis 3 km)",
  "config.methodo.tidal.precision.global": "weit (über 3 km oder globales Modell)",
  "config.methodo.tidal.popup.current": "Maximaler Gezeitenstrom hier",
  "config.methodo.tidal.current.over15": "über 1,5 kn",
  "config.methodo.tidal.current.over05": "zwischen 0,5 und 1,5 kn",
  "config.methodo.tidal.current.under05": "unter 0,5 kn",
  "config.methodo.tidal.current.unknown": "außerhalb der Berechnung",
  "config.methodo.tidal.popup.status": "Status der Zone",
  "config.methodo.tidal.status.covered": "abgedeckt",
  "config.methodo.tidal.status.target": "nicht abgedeckt, offene Quelle identifiziert",
  "config.methodo.tidal.status.blocked": "nicht abgedeckt, Daten geschlossen oder unklar",
  "config.methodo.tidal.status.unknown": "nicht abgedeckt, keine bekannte Quelle",
  "config.methodo.tidal.status.none": "außerhalb der berechneten Starkstromzonen",
  "config.methodo.tidal.popup.pass": "Nächste bekannte Passage",
  "config.methodo.tidal.popup.passValue": "{name}, {kt} kn veröffentlicht, {km} km entfernt",
  "config.methodo.tidal.popup.candidates": "Kandidatenquellen hier",
  "config.methodo.tidal.popup.fallback": "Weltweiter Rückfall",
  "config.methodo.tidal.popup.fallbackNote": "zählt nicht als Abdeckung",
  "config.methodo.tidal.popup.none": "keine identifiziert",
  "config.methodo.tidal.popup.objective": "Zielgebiet",
  "config.methodo.tidal.popup.yes": "ja",
  "config.methodo.tidal.popup.no": "nein",
  "config.methodo.tidal.pass.published": "Veröffentlichter Springtidenstrom",
  "config.methodo.tidal.pass.confidence": "Verlässlichkeit der Zahl",
  "config.methodo.tidal.pass.coverage": "Aktuelle Abdeckung",
  "config.methodo.tidal.pass.coverageNone": "keine, nur globales Modell",
  "config.methodo.tidal.pass.reference": "Referenz",
  "config.methodo.tidal.source.status.ok": "kompatible Lizenz",
  "config.methodo.tidal.source.status.clarify": "zu klären",
  "config.methodo.tidal.source.status.blocked": "blockiert",
  "config.methodo.tidal.source.status.no_currents": "ohne Strömungen",
  "config.methodo.tidal.source.status.current": "in der Kaskade",
  "config.methodo.tidal.source.resolution": "Auflösung",
  "config.methodo.tidal.source.access": "Zugang",
  "config.methodo.tidal.source.licence": "Lizenz",
  "config.methodo.tidal.source.readAt": "gelesen am {date}",
  "config.methodo.tidal.sources.title": "Quellenregister: Name, Herausgeber, gelesene und datierte Lizenz",
  "config.methodo.tidal.sources.show": "Anzeigen",
  "config.methodo.tidal.sources.name": "Quelle",
  "config.methodo.tidal.sources.provider": "Herausgeber",
  "config.methodo.tidal.sources.licence": "Lizenz",
  "config.methodo.tidal.sources.status": "Status",
  "config.methodo.tidal.sources.propose": "Kennen Sie eine offene Quelle, die hier fehlt? Schreiben Sie uns",
  "config.methodo.tidal.sources.proposeSubject": "Vorschlag einer Quelle für Gezeitenströme",
  "config.docs.privacy": "Datenschutz",

  "config.notFound.title": "Diese Seite gibt es nicht",
  "config.notFound.body":
    "Der Link ist vielleicht unvollständig, oder die Seite hat die Adresse gewechselt.",
  "config.notFound.back": "Zurück zur Karte",

  "config.lazyPage.offlineTitle": "Diese Seite benötigt eine Verbindung.",
  "config.lazyPage.offlineBody":
    "Stellen Sie die Verbindung wieder her und laden Sie neu, oder kehren Sie zur Karte zurück.",
  "config.lazyPage.errorTitle": "Diese Seite konnte nicht angezeigt werden.",
  "config.lazyPage.errorBody":
    "Laden Sie die Seite neu, oder kehren Sie zur Karte zurück.",
  "config.lazyPage.reload": "Neu laden",
  "config.lazyPage.backToMap": "Zurück zur Karte",
  "config.models.provider.meteoFrance": "Météo-France",
  "config.models.provider.dwd": "DWD (Deutschland)",
  "config.models.provider.ecmwf": "Europäisches Zentrum",
  "config.models.provider.noaa": "NOAA (USA)",
  "config.models.provider.metOffice": "Met Office (UK)",
  "config.models.provider.envCanada": "Env. Canada",
  "config.models.provider.dmi": "DMI (Dänemark)",
  "config.models.provider.metNorway": "MET Norway",
};
