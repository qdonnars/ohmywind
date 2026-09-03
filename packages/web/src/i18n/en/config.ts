// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { config as frConfig } from "../fr/config";

export const config: Record<keyof typeof frConfig, string> = {
  "config.lang.label": "Language",
  "config.lang.backendNote":
    "Warnings computed by the passage engine remain in French for now.",

  "config.header.title": "Configuration",
  "config.reset": "Reset",
  "config.saved": "· saved",
  "config.storageNote":
    "OhMyWind deliberately offers no user accounts: no data is sent to a server to identify who you are. Your preferences (models, custom polar) are stored locally in your browser. If you change device or browser, or clear this site's cookies, those settings will be lost.",

  "config.models.title": "Weather models",
  "config.models.intro":
    "The first {limit} models are shown in the forecast table, in this order. Drag and drop to reorder (on mobile, press and hold a row, or use the ⋮⋮ handle directly). This setting does not affect passage plans.",
  "config.models.zoneActive": "Used in the app",
  "config.models.zoneIgnored": "Ignored",
  "config.models.horizonHours": "{hours} h",
  "config.models.horizonDays": "{days} d",

  "config.models.arome.description":
    "High-resolution Météo-France model, catches thermal effects and coastal shelter.",
  "config.models.arome.coverage": "France",
  "config.models.arpegeEu.description": "French medium-range model, extends AROME.",
  "config.models.arpegeEu.coverage": "Europe",
  "config.models.arpegeW.description": "Météo-France global driver, low resolution.",
  "config.models.arpegeW.coverage": "Global",
  "config.models.icon.description":
    "European regional model, a good range / accuracy compromise.",
  "config.models.icon.coverage": "Europe",
  "config.models.iconGlobal.description": "Global version of ICON, extended range.",
  "config.models.iconGlobal.coverage": "Global",
  "config.models.iconD2.description":
    "Very high resolution from DWD, useful margins over eastern France.",
  "config.models.iconD2.coverage": "Germany + borders",
  "config.models.ecmwf.description": "Medium-range reference, coarser resolution.",
  "config.models.ecmwf.coverage": "Global",
  "config.models.ecmwfAifs.description": "ECMWF's AI model, close to the IFS in skill.",
  "config.models.ecmwfAifs.coverage": "Global (AI)",
  "config.models.gfs.description": "Very long range, gusts unreliable in light winds.",
  "config.models.gfs.coverage": "Global",
  "config.models.ukmo.description": "Met Office global model, strong over the North Atlantic.",
  "config.models.ukmo.coverage": "Global",
  "config.models.ukmoUk.description": "High-resolution UK model, useful in the western Channel.",
  "config.models.ukmoUk.coverage": "British Isles + Channel",
  "config.models.gem.description": "Canadian global model, a useful cross-check.",
  "config.models.gem.coverage": "Global",
  "config.models.dmiHarmonie.description":
    "High-resolution Scandinavian model, useful in the Channel and the North Sea.",
  "config.models.dmiHarmonie.coverage": "Northern Europe + Channel",
  "config.models.metnoNordic.description":
    "Very high resolution Norwegian model over the North Sea.",
  "config.models.metnoNordic.coverage": "Scandinavia + North Sea",

  "config.boat.title": "Boat",
  "config.boat.intro":
    "Describe your boat: these settings feed every passage plan you make. The essentials are enough to get started; the Advanced tile lets you import your own polar and fine-tune upwind and spinnaker behaviour.",
  "config.boat.resetAll": "Reset everything",

  "config.boat.archetype.cruiser20ft": "20 ft cruiser",
  "config.boat.archetype.cruiser25ft": "25 ft cruiser",
  "config.boat.archetype.cruiser30ft": "30 ft cruiser",
  "config.boat.archetype.cruiser40ft": "40 ft cruiser",
  "config.boat.archetype.cruiser50ft": "50 ft cruiser",
  "config.boat.archetype.racerCruiser": "Racer-cruiser",
  "config.boat.archetype.catamaran40ft": "40 ft catamaran",

  "config.boat.essentials.title": "Essentials",
  "config.boat.essentials.myBoat": "My boat",
  "config.boat.essentials.importedActive":
    "Imported polar active: the boat you pick applies in archetype mode.",
  "config.boat.essentials.coefficient": "Performance coefficient ({percent}%)",
  "config.boat.essentials.coefficientHint":
    "100% is the theoretical polar, computed light with racing sails: in practice you sail below it. The default is a good starting point; lower it if the boat is loaded or the sails are tired.",
  "config.boat.essentials.coefficientHintImported":
    "Polar measured on your own boat? Then 100% makes sense.",

  "config.boat.motor.legend": "Engine (optional)",
  "config.boat.motor.thresholdLabel": "Threshold speed (kn)",
  "config.boat.motor.speedLabel": "Motoring speed (kn)",
  "config.boat.motor.thresholdPlaceholder": "e.g. 2",
  "config.boat.motor.speedPlaceholder": "e.g. 5",
  "config.boat.motor.hint":
    "Below the threshold speed computed from the polar, the boat switches to the engine (up to {max} kn). Leave both fields empty to stay 100% under sail (the default behaviour).",
  "config.boat.motor.clamped":
    "Value brought back to {max} kn, the simulator's ceiling: beyond it, the per-leg weather estimate is no longer reliable.",
  "config.boat.motor.halfSet":
    "Fill in both values to enable the engine. While only one field is filled, the simulation stays 100% under sail.",
  "config.boat.motor.inverted":
    "The threshold speed exceeds the motoring speed: on legs sailing between the two, the engine would slow the boat down. Check both values.",

  "config.boat.advanced.title": "Advanced",
  "config.boat.advanced.subtitle": "custom polar, upwind angle, spinnaker",
  "config.boat.advanced.polarFile": "Polar file",
  "config.boat.advanced.importFile": "Import a file…",
  "config.boat.advanced.replaceFile": "Replace the file…",
  "config.boat.advanced.removeFile": "Remove",
  "config.boat.advanced.activePolar": "Active polar",
  "config.boat.advanced.sourceImported": "Imported polar",
  "config.boat.advanced.sourceArchetype": "Tuned archetype",
  "config.boat.advanced.formatHint":
    "Standard format (qtVlm, Expedition, MaxSea): first line = wind speeds (TWS), one line per angle (TWA), separated by tabs, semicolons or commas. Extensions .pol, .csv or .txt.",
  "config.boat.advanced.exampleFile":
    "<a>Download an example file (.csv)</a>: the 30 ft cruiser polar, to open in a spreadsheet and fill with your own boat's values.",
  "config.boat.advanced.minUpwind": "Minimum upwind angle",
  "config.boat.advanced.minUpwindPlaceholder": "auto ({deg}°)",
  "config.boat.advanced.minUpwindAuto": "Auto",
  "config.boat.advanced.minUpwindHint":
    "Below this wind angle the boat no longer points: the simulator tacks at the best VMG angle and the diagram shades the no-go zone. Auto = the archetype's value ({archetype}), or the first angle in the imported file. An angle tighter than the polar's data extends the curve at constant VMG, without improving the simulated speeds.",
  "config.boat.advanced.spinnaker": "Spinnaker",
  "config.boat.advanced.spiKind": "Spinnaker type",
  "config.boat.advanced.spiOff": "None",
  "config.boat.advanced.spiAsymmetric": "Asymmetric",
  "config.boat.advanced.spiAsymmetricTitle":
    "Asymmetric: sweet spot reaching 110-135°, useful up to 150° when heating up",
  "config.boat.advanced.spiSymmetric": "Symmetric",
  "config.boat.advanced.spiSymmetricTitle":
    "Symmetric: best dead downwind, 135-165° (pole required)",
  "config.boat.advanced.spiDouse": "Douse above",
  "config.boat.advanced.spiLocked":
    "Imported polar active: the spinnaker setting is locked, your file is assumed to already reflect your sail wardrobe.",
  "config.boat.advanced.spiThresholdHint":
    "The downwind speed gain only applies to wind curves at or below this threshold.",
  "config.boat.advanced.tuning": "Manual tuning",
  "config.boat.advanced.tunedPoints": "{count} point(s) tuned",
  "config.boat.advanced.tuningHint":
    "Drag a point on the selected curve to set its speed (raw values, before the coefficient). Tuned points survive a change of spinnaker.",
  "config.boat.advanced.rawSubtitle": "raw values · drag to tune",
  "config.boat.advanced.clearTuning": "Clear the tuning",

  "config.boat.result.title": "Resulting polar",
  "config.boat.result.tileSubtitle": "what the planner will use",
  "config.boat.result.subtitle":
    "resulting polar · coefficient ×{coefficient} · upwind {upwind}°",
  "config.boat.result.spiAsymmetric": "asymmetric spinnaker ≤ {tws} kn",
  "config.boat.result.spiSymmetric": "symmetric spinnaker ≤ {tws} kn",

  "config.polar.curveShown": "Curve shown (TWS)",
  "config.polar.curveEditable": "Editable curve (TWS)",
  "config.polar.diagram": "Polar diagram: {title}",
  "config.polar.handle": "TWA {twa}° · {speed} kn",
  "config.polar.handleEditable": "TWA {twa}° · {speed} kn (drag to tune)",

  "config.polarImport.defaultName": "Imported polar",
  "config.polarImport.ok": "“{name}” imported ({tws} wind speeds × {twa} angles).",
  "config.polarImport.tooLarge":
    "File too large: a polar weighs a few kB, check that this is the right file.",
  "config.polarImport.unreadable":
    "This file could not be read. Expected format: text with a TWS header line, then one line per TWA angle.",
  "config.polarImport.errors.empty": "Empty file: no data line found.",
  "config.polarImport.errors.badHeader":
    'First line unreadable: it must list the wind speeds (TWS), for example "TWA\\TWS  6  8  10  12  16  20".',
  "config.polarImport.errors.badTws":
    "Line {line}: invalid TWS “{value}” (expected a number between 0 and {max} kn).",
  "config.polarImport.errors.tooFewTws": "The file needs at least 2 wind columns (TWS).",
  "config.polarImport.errors.tooManyTws": "Too many TWS columns ({count}, maximum {max}).",
  "config.polarImport.errors.badTwa":
    "Line {line}: invalid TWA angle “{value}” (expected a number between 0 and 180°).",
  "config.polarImport.errors.speedCount":
    "Line {line}: {found} speed(s) found, {expected} expected (one per TWS column).",
  "config.polarImport.errors.badSpeed":
    "Line {line}: invalid boat speed “{value}” (expected a number ≥ 0).",
  "config.polarImport.errors.tooFewTwa": "The file needs at least 2 angle rows (TWA).",
  "config.polarImport.errors.tooManyTwa": "Too many TWA rows ({count}, maximum {max}).",
  "config.polarImport.errors.duplicateTws":
    "Duplicate TWS column: {tws} kn appears twice.",
  "config.polarImport.errors.duplicateTwa": "Line {line}: duplicate TWA angle ({twa}°).",
  "config.polarImport.warnings.clamped":
    "{count} speed(s) above {max} kn brought back to {max} kn.",

  "config.docs.methodology": "Methodology",
  "config.docs.privacy": "Privacy",

  "config.notFound.title": "This page does not exist",
  "config.notFound.body": "The link may be incomplete, or the page has moved.",
  "config.notFound.back": "Back to the map",

  "config.lazyPage.offlineTitle": "This page needs a connection.",
  "config.lazyPage.offlineBody": "Reconnect then reload, or go back to the map.",
  "config.lazyPage.errorTitle": "This page could not be displayed.",
  "config.lazyPage.errorBody": "Reload the page, or go back to the map.",
  "config.lazyPage.reload": "Reload",
  "config.lazyPage.backToMap": "Back to the map",
  "config.models.provider.meteoFrance": "Météo-France",
  "config.models.provider.dwd": "DWD (Germany)",
  "config.models.provider.ecmwf": "ECMWF",
  "config.models.provider.noaa": "NOAA (United States)",
  "config.models.provider.metOffice": "Met Office (UK)",
  "config.models.provider.envCanada": "Environment Canada",
  "config.models.provider.dmi": "DMI (Denmark)",
  "config.models.provider.metNorway": "MET Norway",
};
