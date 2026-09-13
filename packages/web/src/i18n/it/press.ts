// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { press as frPress } from "../fr/press";

export const press: Record<keyof typeof frPress, string> = {
  "press.header.title": "Stampa",
  "press.eyebrow": "Rassegna stampa",
  "press.title": "OhMyWind sulla stampa",
  "press.intro":
    "Cosa ha scritto la stampa nautica su OhMyWind. Ogni scheda rimanda all'edizione in inglese quando esiste; le altre edizioni sono indicate sotto.",

  "press.article.read": "Leggi l'articolo su {site}",
  "press.article.editions": "Altre edizioni",

  "press.contact.title": "Contatto stampa",
  "press.contact.body":
    "State preparando un articolo su OhMyWind? Scrivete a <a>contact@ohmywind.fr</a>. Codice, metodologia e schermate sono pubblici: tutto può essere citato.",
  "press.contact.methodology": "Leggi la metodologia",
  "press.contact.github": "Vedi il codice sorgente",
};
