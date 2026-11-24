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

  // Boat: the Boat, My boat and Advanced views.
  "settings.boat.intro": "These settings feed every passage plan you make. The essentials are enough to get started.",
  "settings.boat.types.note":
    "Each type carries its own polar and upwind angle. Then adjust the coefficient.",
  "settings.boat.advanced.upwind": "upwind {deg}°",
  "settings.boat.upwind.manual": "Set by hand",
  "settings.boat.upwind.tighter": "Tighten the upwind angle",
  "settings.boat.upwind.wider": "Widen the upwind angle",
  "settings.boat.spi.lower": "Lower the dousing threshold",
  "settings.boat.spi.higher": "Raise the dousing threshold",
  "settings.boat.tuning.legend":
    "Dashed: the curve before your tuning. Yellow points: tuned points. With the keyboard, the arrow keys change a point's speed by {step}\u00a0kn.",
  "settings.boat.point": "Angle {twa}°, {speed}\u00a0kn",
  "settings.boat.pointTuned": "Angle {twa}°, {speed}\u00a0kn, tuned",

  "settings.forecast.note":
    "The models fill the table on the map and, in this order, are used to compute your passage plans. The boat is used for all your plans.",
  "settings.storageNote":
    "OhMyWind has no accounts: your preferences stay on this device. Changing device or clearing the site's data makes them disappear.",
  "settings.lang.note":
    "Each language is written in its own language, so that a lost reader recognises theirs.",

  // Modèles météo : la vue des Réglages (intro, repère du tableau,
  // poignées et leurs noms accessibles, toasts, réinitialisation).
  "settings.models.intro":
    "The first <b>{limit}</b> appear in the table, in this order. Drag the handle to reorder: moving a model up among them sends the last of them to the ignored ones.",
  "settings.models.headShown": "Used in the app",
  "settings.models.headIgnored": "Ignored below",
  "settings.models.cut": "↑ Table · Ignored ↓",
  "settings.models.meta": "{resolution}\u00a0km · ~{horizon} · {coverage}",
  "settings.models.position.shown": "{model}, rank {rank}, shown",
  "settings.models.position.ignored": "{model}, rank {rank}, ignored",
  "settings.models.handle.role": "move handle",
  "settings.models.handle.hint":
    "Up and down arrows move it one rank.",
  "settings.models.toast.swap":
    "{shown} shown, {ignored} moves to the ignored ones",
  "settings.models.toast.reset": "Default order restored",
  "settings.models.reset": "Reset order",
};
