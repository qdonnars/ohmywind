// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PRESS_RELEASE } from "../content/press";
import releaseBody from "../content/communique.md?raw";
import { LANG_NAMES, useT } from "../i18n";
import "./press.css";
import "./press-release.css";

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
 * reference document. The release is French only, so everything under the
 * eyebrow carries `lang="fr"`, and the eyebrow names the language for a
 * reader whose interface is set to another one.
 */
export function PressReleasePage() {
  const { t } = useT();

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
        <p className="press-eyebrow press-release-eyebrow">
          {t("press.release.label")}
          <span className="press-chip" lang={PRESS_RELEASE.lang}>
            {LANG_NAMES[PRESS_RELEASE.lang]}
          </span>
        </p>
        <article lang={PRESS_RELEASE.lang}>
          <p className="press-release-dateline">{PRESS_RELEASE.dateline}</p>
          <h1 className="press-title press-release-title">{PRESS_RELEASE.title}</h1>
          <p className="press-release-lead">{PRESS_RELEASE.lead}</p>
          <div className="prose-press">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
              {releaseBody}
            </ReactMarkdown>
          </div>
        </article>
      </main>
    </div>
  );
}
