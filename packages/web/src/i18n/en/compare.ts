// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { compare as frCompare } from "../fr/compare";

export const compare: Record<keyof typeof frCompare, string> = {
  "compare.empty.title": "No spot to compare",
  "compare.empty.body":
    "Save spots from Explore, with a long press on the map or a right click: they will show up here side by side.",
  "compare.empty.cta": "Explore the map",

  "compare.table.empty": "No data available for your spots.",
  "compare.table.offline":
    "Offline: the forecasts cannot be fetched. Reconnect, then reopen this page.",
  "compare.row.focus": "Centre the map on {name}",
  "compare.row.open": "Open {name} in Explore",
  "compare.row.noData": "Out of coverage",
};
