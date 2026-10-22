// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useT, type Lang } from "../i18n";
import conditionsFr from "../content/conditions.md?raw";
import conditionsEn from "../content/conditions.en.md?raw";
import conditionsDe from "../content/conditions.de.md?raw";
import conditionsIt from "../content/conditions.it.md?raw";
import conditionsEs from "../content/conditions.es.md?raw";
import "./confidentialite.css";

// Same layout as the privacy policy: one file per language, French as the
// reference, all five in this page's chunk.
const CONTENT: Record<Lang, string> = {
  fr: conditionsFr,
  en: conditionsEn,
  de: conditionsDe,
  it: conditionsIt,
  es: conditionsEs,
};

/** Conditions d'utilisation, exigées par l'annuaire d'apps de ChatGPT (avec
    site, support et confidentialité) et liées depuis le panneau d'infos.
    Même habillage "papier blanc" que /confidentialite, dont elle reprend la
    feuille de style. */
export function ConditionsPage() {
  const { t, lang } = useT();
  return (
    <div className="conf-root min-h-screen">
      <header className="conf-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OhMyWind
          </a>
          <span className="text-xs opacity-60">{t("config.docs.terms")}</span>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-10 prose-conf">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{CONTENT[lang]}</ReactMarkdown>
      </article>
    </div>
  );
}
