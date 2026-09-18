// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { press as frPress } from "../fr/press";

export const press: Record<keyof typeof frPress, string> = {
  "press.header.title": "Press",
  "press.eyebrow": "Press coverage",
  "press.title": "OhMyWind in the press",
  "press.intro":
    "What the sailing press has written about OhMyWind. Each entry links to the English edition where one exists; the other editions are listed below it.",

  "press.article.read": "Read the article on {site}",
  "press.article.editions": "Other editions",

  "press.contact.title": "Press contact",
  "press.contact.body":
    "Working on a story about OhMyWind? Write to <a>contact@ohmywind.fr</a>. The code, the methodology and the screenshots are public: all of it can be quoted.",
  "press.contact.methodology": "Read the methodology",
  "press.contact.github": "See the source code",
};
