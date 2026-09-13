// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { Lang } from "../i18n";

/**
 * One edition of an article: the language it is written in and where it
 * lives. Bateaux.com publishes each piece on five sister sites, one per
 * language, so an article is a set of editions rather than one URL.
 */
export interface PressEdition {
  lang: Lang;
  url: string;
  /** The host the reader lands on, shown in the link so the jump from
      "Bateaux.com" to boatnews.com is not a surprise. */
  site: string;
}

export interface PressArticle {
  /** The masthead the reader knows the outlet by. */
  outlet: string;
  /** The publishing house, when the masthead alone does not say who is
      behind it. */
  publisher?: string;
  author: string;
  /** ISO date, the day the piece went online. */
  date: string;
  /**
   * The edition the card links to: the English one whenever the outlet
   * published one, so a reader in any of the app's languages gets the
   * edition most of them can read. Title and lead are quoted from it as
   * published, hence not translated.
   */
  primary: PressEdition & { title: string; lead: string };
  /** Every other edition, listed under the card in its own language. */
  editions: PressEdition[];
}

/** Newest first. Text is quoted verbatim from each outlet, do not edit. */
export const PRESS_ARTICLES: readonly PressArticle[] = [
  {
    outlet: "BOOTE",
    publisher: "Delius Klasing",
    author: "Hauke Schmidt",
    date: "2026-09-02",
    primary: {
      lang: "en",
      url: "https://www.boote-magazin.de/en/equipment/technology/navigation-ohmywind-a-free-weather-planner-with-ai-functionality/",
      site: "boote-magazin.de",
      title: "OhMyWind: Free weather planner with AI integration",
      lead:
        "The open-source software OhMyWind uses freely available weather data, boat polars and a route to calculate expected sailing times and conditions, and can compare departure times.",
    },
    editions: [
      {
        lang: "de",
        url: "https://www.boote-magazin.de/ausruestung/technik/ohmywind-wetterrouting-open-source/",
        site: "boote-magazin.de",
      },
    ],
  },
  {
    outlet: "Bateaux.com",
    author: "Rédaction de Bateaux.com",
    date: "2026-08-30",
    primary: {
      lang: "en",
      url: "https://www.boatnews.com/story/52477/ohmywind-the-open-source-project-that-aims-to-rethink-how-we-prepare-for-a-sailing-trip",
      site: "boatnews.com",
      title: "OhMyWind, the open-source project that aims to rethink how we prepare for a sailing trip",
      lead:
        "OhMyWind began as a personal project focused on weather and sailboat trip planning. The software is now developed as open source and accessible without an account. The main goal behind this initiative is to offer recreational sailors a different way to view useful data before setting sail.",
    },
    editions: [
      {
        lang: "fr",
        url: "https://www.bateaux.com/article/52477/ohmywind-le-projet-open-source-qui-veut-repenser-la-preparation-d-une-navigation",
        site: "bateaux.com",
      },
      {
        lang: "de",
        url: "https://www.boote.com/artikel/52477/ohmywind-das-open-source-projekt-das-die-vorbereitung-einer-segeltour-neu-konzipieren-will",
        site: "boote.com",
      },
      {
        lang: "es",
        url: "https://www.barcosnews.es/noticias/52477/ohmywind-el-proyecto-de-codigo-abierto-que-pretende-replantear-la-preparacion-de-una-travesia",
        site: "barcosnews.es",
      },
      {
        lang: "it",
        url: "https://www.barchenews.it/news/52477/ohmywind-il-progetto-open-source-che-punta-a-ripensare-la-preparazione-di-una-navigazione",
        site: "barchenews.it",
      },
    ],
  },
];
