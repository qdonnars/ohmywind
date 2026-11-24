// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { settings as frSettings } from "../fr/settings";

export const settings: Record<keyof typeof frSettings, string> = {
  "settings.done": "Done",
  "settings.group.device": "Device",
  "settings.group.map": "Map",
  "settings.group.forecast": "Forecasts",
  "settings.theme.label": "Theme",
  "settings.theme.auto": "Auto",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.device.note": "Auto follows the device's light or dark setting.",
  "settings.keepAwake.subtitle": "While a computed plan is shown",
  "settings.seamarks.label": "Sea marks",
  "settings.seamarks.subtitle": "Buoys, beacons and lighthouses (OpenSeaMap)",
  "settings.seamarks.always": "Always",
  "settings.seamarks.never": "Never",
  "settings.map.note": "On both maps, weather and planner.",
  "settings.models.summary": "Table: {models}",
  "settings.boat.summary": "{boat} · {percent}%",
  "settings.boat.summaryMotor": "engine below {speed} kn",
  "settings.boat.summaryImported": "imported polar",
  "settings.forecast.note":
    "The models fill the table on the map; the boat is used for all your passage plans.",
  "settings.storageNote":
    "OhMyWind has no accounts: your preferences stay on this device. Changing device or clearing the site's data makes them disappear.",
  "settings.lang.note":
    "Each language is written in its own language, so that a lost reader recognises theirs.",
};
