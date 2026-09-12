// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { common as frCommon } from "../fr/common";

export const common: Record<keyof typeof frCommon, string> = {
  "common.loading": "Loading…",
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.retry": "Retry",
  "common.days.one": "{count} day",
  "common.days.other": "{count} days",

  // Navigation menu: the burger and its three destinations
  "common.nav.open": "Open the menu",
  "common.nav.close": "Close the menu",
  "common.nav.label": "Navigation",
  "common.nav.explore.title": "Explore",
  "common.nav.explore.desc": "The map and the spot's forecast",
  "common.nav.plan.title": "Plan",
  "common.nav.plan.desc": "Simulate a route, compare windows",
  "common.nav.compare.title": "Compare my spots",
  "common.nav.compare.desc": "My favourites side by side",
};
