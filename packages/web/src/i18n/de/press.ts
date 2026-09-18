// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { press as frPress } from "../fr/press";

export const press: Record<keyof typeof frPress, string> = {
  "press.header.title": "Presse",
  "press.eyebrow": "Pressespiegel",
  "press.title": "OhMyWind in der Presse",
  "press.intro":
    "Was die Wassersportpresse über OhMyWind geschrieben hat. Jeder Eintrag verweist auf die englische Ausgabe, sofern es eine gibt; die anderen Ausgaben stehen darunter.",

  "press.article.read": "Artikel auf {site} lesen",
  "press.article.editions": "Weitere Ausgaben",

  "press.contact.title": "Pressekontakt",
  "press.contact.body":
    "Sie bereiten einen Beitrag über OhMyWind vor? Schreiben Sie an <a>contact@ohmywind.fr</a>. Code, Methodik und Bildschirmfotos sind öffentlich: alles darf zitiert werden.",
  "press.contact.methodology": "Methodik lesen",
  "press.contact.github": "Quellcode ansehen",
};
