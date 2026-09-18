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

  "common.quota.connection":
    "The free weather service (Open-Meteo) has reached its {window} request limit for your connection. {reset}",
  "common.quota.server":
    "The free weather service (Open-Meteo) has reached its {window} request limit for our server. This is unrelated to your usage. {reset}",
  "common.quota.window.minute": "per-minute",
  "common.quota.window.hour": "hourly",
  "common.quota.window.day": "daily",
  "common.quota.reset.soon": "It resets in under a minute.",
  "common.quota.reset.minutes.one": "It resets in {count} minute.",
  "common.quota.reset.minutes.other": "It resets in {count} minutes.",
  "common.quota.reset.hours.one": "It resets in about {count} hour.",
  "common.quota.reset.hours.other": "It resets in about {count} hours.",
};
