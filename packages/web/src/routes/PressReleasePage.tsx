// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PRESS_RELEASES } from "../content/press";
import bodyFr from "../content/communique.md?raw";
import bodyEn from "../content/communique.en.md?raw";
import bodyDe from "../content/communique.de.md?raw";
import bodyIt from "../content/communique.it.md?raw";
import bodyEs from "../content/communique.es.md?raw";
import { useT, type Lang } from "../i18n";
import "./press.css";
import "./press-release.css";

// All five in this page's chunk, like the privacy page: loaded on demand,
// and together lighter than one screenshot.
const BODIES: Record<Lang, string> = { fr: bodyFr, en: bodyEn, de: bodyDe, it: bodyIt, es: bodyEs };

/**
 * A link leaving the site opens in a new tab, like every external link of
 * the press page; one to another page of the app, or a mailto, stays where
 * it is. Decided on the scheme alone: in-app links are written as paths
 * (`/plan`), so they follow whichever host serves the page, dev or prod.
 */
function MarkdownLink({ node, href, ...props }: ComponentProps<"a"> & { node?: unknown }) {
  void node; // the hast node react-markdown hands over; not a DOM attribute
  const external = href !== undefined && /^https?:\/\//.test(href);
  return <a href={href} {...props} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} />;
}

/**
 * The press release, reached from `/presse`. Same theme as the press page
 * rather than the doc pages' white paper: it is the project speaking, not a
 * reference document. Written in the interface language, so a journalist
 * sent the link reads it in the language the browser asks for.
 */
export function PressReleasePage() {
  const { t, lang } = useT();
  const release = PRESS_RELEASES[lang];
  const { highlight } = release;

  return (
    <div className="press-root min-h-screen">
      <header className="press-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/presse" className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← {t("press.header.title")}
          </a>
          <span className="text-xs opacity-60">{t("press.release.label")}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <p className="press-eyebrow">{t("press.release.label")}</p>
        <article>
          <p className="press-release-dateline">{release.dateline}</p>
          <h1 className="press-title press-release-title">{release.title}</h1>
          <p className="press-release-lead">{release.lead}</p>
          {highlight && (
            <aside className="press-release-highlight" aria-labelledby="press-release-highlight-title">
              <p className="press-release-highlight-badge">{highlight.badge}</p>
              <h2 id="press-release-highlight-title" className="press-release-highlight-title">
                {highlight.title}
              </h2>
              <p className="press-release-highlight-body">{highlight.body}</p>
              <a href={highlight.link.href} target="_blank" rel="noreferrer">
                {highlight.link.text}
              </a>
            </aside>
          )}
          <div className="prose-press">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
              {BODIES[lang]}
            </ReactMarkdown>
          </div>
        </article>
      </main>
    </div>
  );
}
