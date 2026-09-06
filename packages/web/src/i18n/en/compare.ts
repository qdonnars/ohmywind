// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { compare as frCompare } from "../fr/compare";

export const compare: Record<keyof typeof frCompare, string> = {
  "compare.empty.title": "No spot to compare",
  "compare.empty.body":
    "Add a spot from the search, or save one from Explore with a long press on the map: they will show up here side by side.",
  "compare.none.title": "No spot ticked",
  "compare.none.body": "Tick at least one spot in the list to read it here.",
  "compare.table.empty": "No data available for your spots.",
  "compare.table.offline":
    "Offline: the forecasts cannot be fetched. Reconnect, then reopen this page.",

  "compare.row.focus": "Centre the map on {name}",
  "compare.row.noData": "Out of coverage",

  "compare.controls.resLabel": "Time step",
  "compare.controls.res": "{hours} h",
  "compare.controls.waves": "Waves",
  "compare.window.label": "Hour window",
  "compare.window.chip": "{start}–{end} h",
  "compare.window.start": "From",
  "compare.window.end": "To",
  "compare.window.hour": "{hour}h",

  "compare.spots.chip": "Spots",
  "compare.spots.chipCount": "{picked}/{total}",
  "compare.spots.title": "Spots compared",
  "compare.spots.checkAll": "Tick all",
  "compare.spots.uncheckAll": "Untick all",
  "compare.spots.add": "Add a spot",
  "compare.spots.toggle": "Compare {name}",
  "compare.spots.count.one": "{count} spot",
  "compare.spots.count.other": "{count} spots",

  "compare.sheet.expand": "Unfold the table",
  "compare.sheet.collapse": "Fold the table",
  "compare.map.recentre": "Frame the map on the spots",
  "compare.header.now": "Current hour",

  "compare.cell.aria.range": "{lo} to {hi}",
  "compare.cell.aria.wind": "Wind {wind} knots",
  "compare.cell.aria.windGusts": "Wind {wind} knots, gusts {gusts}",
  "compare.cell.aria.windDirection": "Wind {wind} knots, direction {direction}°",
  "compare.cell.aria.windGustsDirection":
    "Wind {wind} knots, gusts {gusts}, direction {direction}°",
  "compare.cell.aria.wave": "Sea {hs} m, period {period} s",
  "compare.cell.aria.waveFrom": "Sea {hs} m from {dir}°, period {period} s",
};
