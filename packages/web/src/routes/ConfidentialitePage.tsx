// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useT, type Lang } from "../i18n";
import confidentialiteFr from "../content/confidentialite.md?raw";
import confidentialiteEn from "../content/confidentialite.en.md?raw";
import confidentialiteDe from "../content/confidentialite.de.md?raw";
import confidentialiteIt from "../content/confidentialite.it.md?raw";
import "./confidentialite.css";

// One file per language, all four in this page's chunk: the page is loaded
// on demand and the four together weigh less than one polar diagram. Each
// translation opens on a line naming the French text as the reference.
const CONTENT: Record<Lang, string> = {
  fr: confidentialiteFr,
  en: confidentialiteEn,
  de: confidentialiteDe,
  it: confidentialiteIt,
};

/** Page statique exigée par le Play Store (formulaire Data safety) et liée
    depuis le panneau d'infos. Même habillage "papier blanc" que la page
    méthodologie, sans les plugins math dont elle n'a pas besoin. */
export function ConfidentialitePage() {
  const { t, lang } = useT();
  return (
    <div className="conf-root min-h-screen">
      <header className="conf-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OhMyWind
          </a>
          <span className="text-xs opacity-60">{t("config.docs.privacy")}</span>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-10 prose-conf">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{CONTENT[lang]}</ReactMarkdown>
      </article>
    </div>
  );
}
