// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo } from "react";
import { PRESS_ARTICLES, type PressArticle } from "../content/press";
import { LANG_NAMES, LOCALE_BY_LANG, rich, useT, type Lang } from "../i18n";
import "./press.css";

/** Every article opens in a new tab: the reader is on our page to find the
    piece, not to leave the app on the way. */
const EXTERNAL = { target: "_blank", rel: "noreferrer" } as const;

const ExternalIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
  </svg>
);

const ArrowIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

/** "2026-09-02" as a local date. `new Date(iso)` would read it as UTC
    midnight, which west of Greenwich prints as the day before. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ArticleCard({ article, lang }: { article: PressArticle; lang: Lang }) {
  const { t } = useT();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(LOCALE_BY_LANG[lang], {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [lang],
  );
  const { primary } = article;

  return (
    <article className="press-card">
      <p className="press-card-meta">
        <span className="press-card-outlet">{article.outlet}</span>
        {article.publisher && <span className="press-card-publisher">{article.publisher}</span>}
        <span className="press-card-sep" aria-hidden="true" />
        <time dateTime={article.date}>{dateFormat.format(localDate(article.date))}</time>
      </p>
      {/* Title and lead are the outlet's words in the outlet's language, hence
          the `lang` attribute: a screen reader switches voice on it, and
          hyphenation follows the right rules. */}
      <h2 className="press-card-title" lang={primary.lang}>
        <a href={primary.url} {...EXTERNAL}>
          {primary.title}
        </a>
      </h2>
      <p className="press-card-author">{article.author}</p>
      <blockquote className="press-card-lead" lang={primary.lang}>
        {primary.lead}
      </blockquote>
      <p className="press-card-actions">
        <a className="press-card-cta" href={primary.url} hrefLang={primary.lang} {...EXTERNAL}>
          {t("press.article.read", { site: primary.site })}
          {ExternalIcon}
        </a>
        <span className="press-chip" lang={primary.lang}>
          {LANG_NAMES[primary.lang]}
        </span>
      </p>
      {article.editions.length > 0 && (
        <p className="press-card-editions">
          <span className="press-card-editions-label">{t("press.article.editions")}</span>
          {article.editions.map((e) => (
            <a
              key={e.url}
              className="press-chip press-chip-link"
              href={e.url}
              hrefLang={e.lang}
              lang={e.lang}
              title={e.site}
              {...EXTERNAL}
            >
              {LANG_NAMES[e.lang]}
            </a>
          ))}
        </p>
      )}
    </article>
  );
}

/**
 * The press page: what the sailing press has written about the project,
 * newest first, and who to write to for the next piece. Reached from the
 * info panel; the app's theme rather than the doc pages' white paper, since
 * it is a page of the app, not a document.
 */
export function PressPage() {
  const { t, lang } = useT();

  return (
    <div className="press-root min-h-screen">
      <header className="press-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OhMyWind
          </a>
          <span className="text-xs opacity-60">{t("press.header.title")}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <p className="press-eyebrow">{t("press.eyebrow")}</p>
        <h1 className="press-title">{t("press.title")}</h1>
        <p className="press-intro">{t("press.intro")}</p>

        <ol className="press-list">
          {PRESS_ARTICLES.map((article) => (
            <li key={article.primary.url}>
              <ArticleCard article={article} lang={lang} />
            </li>
          ))}
        </ol>

        <section className="press-contact">
          <h2 className="press-contact-title">{t("press.contact.title")}</h2>
          <p className="press-contact-body">
            {rich(t("press.contact.body"), {
              a: (chunk) => <a href="mailto:contact@ohmywind.fr">{chunk}</a>,
            })}
          </p>
          <p className="press-contact-links">
            <a href="/methodologie">
              {t("press.contact.methodology")}
              {ArrowIcon}
            </a>
            <a href="https://github.com/qdonnars/ohmywind" {...EXTERNAL}>
              {t("press.contact.github")}
              {ExternalIcon}
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
