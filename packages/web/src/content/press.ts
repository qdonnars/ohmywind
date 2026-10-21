// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { Lang } from "../i18n";

/**
 * One edition of an article: the language it is written in and where it
 * lives. Bateaux.com publishes each piece on five sister sites, one per
 * language, so an article is a set of editions rather than one URL.
 */
interface PressEdition {
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

/** Our own press release in one language: the head, the body being a
    markdown file next to this one. */
export interface PressRelease {
  dateline: string;
  title: string;
  lead: string;
  /**
   * The one news item set apart from the body: a box under the lead on the
   * release, a badge on the press page's card. Drop the field and both go
   * away.
   */
  highlight?: { badge: string; title: string; body: string; link: { href: string; text: string } };
}

const CAP_INNOVATION = "https://www.parisnauticshow.com/cap-innovation/";

/**
 * Our own press release, at `/presse/communique`, in each of the app's
 * languages; the interface language picks one. The heads live here so the
 * press page can show the release as a card without loading its chunk; the
 * bodies are `communique.md` (French, the reference) and `communique.<lang>.md`.
 * A change to the release goes into all five.
 */
export const PRESS_RELEASES: Record<Lang, PressRelease> = {
  fr: {
    dateline: "Marseille, octobre 2026",
    title: "OhMyWind : l'innovation qui simplifie l'accès aux données météo et marines gratuites",
    lead:
      "OhMyWind simplifie l'accès des plaisanciers aux données publiques et gratuites de météo, d'état de la mer et de courants de marée. Sa nouvelle version les met à portée de conversation : on décrit sa navigation à un assistant d'intelligence artificielle (Claude, ChatGPT, Le Chat…) et il répond, carte et horaires à l'appui. Gratuit, sans compte et open source, OhMyWind fonctionne aussi sur le web et sur Android. Sans campagne de lancement, il réunit déjà plus de 600 utilisateurs par jour, en France et en Allemagne.",
    highlight: {
      badge: "Cap Innovation 2026",
      title: "Candidat au concours Cap Innovation du Paris Nautic Show",
      body:
        "OhMyWind se présente au concours Cap Innovation du Paris Nautic Show (Le Bourget, du 25 au 29 novembre 2026), dans la catégorie Service innovant. Le service présenté : planifier une navigation en conversation avec un assistant d'intelligence artificielle, qui compare les départs, montre la route sur une carte et répond aux questions de marée.",
      link: { href: CAP_INNOVATION, text: "Le concours Cap Innovation" },
    },
  },
  en: {
    dateline: "Marseille, October 2026",
    title: "OhMyWind: the innovation that makes free marine weather data easy to use",
    lead:
      "OhMyWind makes it simple for sailors to use free public data on weather, sea state and tidal currents. Its new version puts that data within reach of a conversation: sailors describe their passage to an AI assistant (Claude, ChatGPT, Le Chat…) and it answers, with the map and the times. Free, open source and with no account needed, OhMyWind also runs on the web and on Android. With no launch campaign, it already has more than 600 users a day, in France and Germany.",
    highlight: {
      badge: "Cap Innovation 2026",
      title: "Entered in the Paris Nautic Show's Cap Innovation competition",
      body:
        "OhMyWind is entering the Cap Innovation competition of the Paris Nautic Show (Le Bourget, 25 to 29 November 2026), in the Innovative Service category. The service entered: planning a passage in conversation with an AI assistant, which compares departures, shows the route on a map and answers tide questions.",
      link: { href: CAP_INNOVATION, text: "The Cap Innovation competition (in French)" },
    },
  },
  de: {
    dateline: "Marseille, Oktober 2026",
    title: "OhMyWind: die Innovation, die den Zugang zu kostenlosen Wetter- und Meeresdaten vereinfacht",
    lead:
      "OhMyWind vereinfacht Seglern den Zugang zu den kostenlosen öffentlichen Daten über Wetter, Seegang und Gezeitenströme. Die neue Version macht sie im Gespräch zugänglich: Man beschreibt seinen Törn einem KI-Assistenten (Claude, ChatGPT, Le Chat…), und er antwortet, mit Karte und Uhrzeiten. Kostenlos, ohne Konto und Open Source, läuft OhMyWind auch im Web und auf Android. Ohne Einführungskampagne zählt es bereits mehr als 600 Nutzer pro Tag, in Frankreich und Deutschland.",
    highlight: {
      badge: "Cap Innovation 2026",
      title: "Bewerber beim Wettbewerb Cap Innovation der Paris Nautic Show",
      body:
        "OhMyWind bewirbt sich beim Wettbewerb Cap Innovation der Paris Nautic Show (Le Bourget, 25. bis 29. November 2026) in der Kategorie Innovativer Service. Vorgestellt wird: einen Törn im Gespräch mit einem KI-Assistenten planen, der die Abfahrten vergleicht, die Route auf einer Karte zeigt und Gezeitenfragen beantwortet.",
      link: { href: CAP_INNOVATION, text: "Der Wettbewerb Cap Innovation (auf Französisch)" },
    },
  },
  it: {
    dateline: "Marsiglia, ottobre 2026",
    title: "OhMyWind: l'innovazione che semplifica l'accesso ai dati meteo e marini gratuiti",
    lead:
      "OhMyWind semplifica ai diportisti l'accesso ai dati pubblici e gratuiti su meteo, stato del mare e correnti di marea. La nuova versione li mette a portata di conversazione: si descrive la propria navigazione a un assistente di intelligenza artificiale (Claude, ChatGPT, Le Chat…) e lui risponde, con mappa e orari. Gratuito, senza account e open source, OhMyWind funziona anche sul web e su Android. Senza campagna di lancio, conta già più di 600 utenti al giorno, in Francia e in Germania.",
    highlight: {
      badge: "Cap Innovation 2026",
      title: "Candidato al concorso Cap Innovation del Paris Nautic Show",
      body:
        "OhMyWind partecipa al concorso Cap Innovation del Paris Nautic Show (Le Bourget, dal 25 al 29 novembre 2026), nella categoria Servizio innovativo. Il servizio presentato: pianificare una navigazione conversando con un assistente di intelligenza artificiale, che confronta le partenze, mostra la rotta su una mappa e risponde alle domande sulla marea.",
      link: { href: CAP_INNOVATION, text: "Il concorso Cap Innovation (in francese)" },
    },
  },
  es: {
    dateline: "Marsella, octubre de 2026",
    title: "OhMyWind: la innovación que simplifica el acceso a los datos meteorológicos y marinos gratuitos",
    lead:
      "OhMyWind simplifica a los navegantes el acceso a los datos públicos y gratuitos de meteorología, estado del mar y corrientes de marea. Su nueva versión los pone al alcance de una conversación: basta con describir la navegación a un asistente de inteligencia artificial (Claude, ChatGPT, Le Chat…) y responde, con el mapa y los horarios. Gratuito, sin cuenta y de código abierto, OhMyWind funciona también en la web y en Android. Sin campaña de lanzamiento, ya reúne a más de 600 usuarios al día, en Francia y Alemania.",
    highlight: {
      badge: "Cap Innovation 2026",
      title: "Candidato al concurso Cap Innovation del Paris Nautic Show",
      body:
        "OhMyWind se presenta al concurso Cap Innovation del Paris Nautic Show (Le Bourget, del 25 al 29 de noviembre de 2026), en la categoría Servicio innovador. El servicio presentado: planificar una navegación conversando con un asistente de inteligencia artificial, que compara las salidas, muestra la ruta en un mapa y responde a las preguntas de marea.",
      link: { href: CAP_INNOVATION, text: "El concurso Cap Innovation (en francés)" },
    },
  },
};

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
