// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useT } from "../i18n";
import confidentialiteMd from "../content/confidentialite.md?raw";
import "./confidentialite.css";

/** Page statique exigée par le Play Store (formulaire Data safety) et liée
    depuis le panneau d'infos. Même habillage "papier blanc" que la page
    méthodologie, sans les plugins math dont elle n'a pas besoin. */
export function ConfidentialitePage() {
  const { t } = useT();
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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{confidentialiteMd}</ReactMarkdown>
      </article>
    </div>
  );
}
