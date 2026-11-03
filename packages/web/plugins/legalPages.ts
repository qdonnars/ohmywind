// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * La politique de confidentialite et les conditions d'utilisation, servies en
 * HTML avec leur texte.
 *
 * Les deux pages sont rendues par React : Cloudflare Pages servait la coque
 * vide d'index.html et le texte n'apparaissait qu'une fois le script execute.
 * Un robot sans JavaScript, comme le verificateur du portail de plugins
 * d'OpenAI, voyait une page blanche. Apres le build, ce plugin ecrit donc
 * `confidentialite.html`, `conditions.html` et `terms.html` (l'alias de
 * src/routeTable.ts) : chacun est une copie de dist/index.html, memes balises
 * de script et de style hachees, avec le texte de la page deja rendu dans
 * `#root`, un titre, une description et une URL canonique propres. React
 * remplace ce contenu au montage, comme sur n'importe quelle autre route.
 *
 * Des fichiers plats et non `confidentialite/index.html` : Pages sert `/foo`
 * depuis `foo.html` avec un 200, alors qu'un dossier declenche un 308 vers
 * `/foo/`, et une redirection sur /confidentialite a deja fait echouer le
 * verificateur d'URL de la Play Console (voir public/_redirects).
 *
 * L'anglais, parce que c'est la langue que prend l'application quand elle ne
 * reconnait pas celle du navigateur (detectLang, src/i18n/langPreference.ts).
 * Chaque traduction renvoie elle-meme au texte francais de reference.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Plugin } from "vite";

/** Langue du texte servi, celle du repli de detectLang. */
export const STATIC_LANG = "en";

const SITE = "https://ohmywind.fr";

export interface LegalPage {
  /** File written at the root of the build output. */
  file: string;
  /** Markdown the page renders, relative to packages/web. */
  source: string;
  /** Route the page answers on; an alias points its canonical at the original. */
  canonicalPath: string;
  /** Lazy chunk of the page component, whose stylesheet the page links. */
  chunk: string;
  /** Short label in the page header, as the component shows it in English. */
  label: string;
  title: string;
  description: string;
}

const PRIVACY = {
  source: "src/content/confidentialite.en.md",
  canonicalPath: "/confidentialite",
  chunk: "ConfidentialitePage",
  label: "Privacy",
  title: "Privacy policy · OhMyWind",
  description:
    "Privacy policy of OhMyWind, the open-source sailing planner run by the association " +
    "Libramer: no account, no database, no audience measurement, no personal data kept on " +
    "its servers.",
};

const TERMS = {
  source: "src/content/conditions.en.md",
  canonicalPath: "/conditions",
  chunk: "ConditionsPage",
  label: "Terms of use",
  title: "Terms of use · OhMyWind",
  description:
    "Terms of use of OhMyWind, the open-source sailing planner published by the association " +
    "Libramer: a decision-support tool, neither a navigation instrument nor an official " +
    "weather bulletin.",
};

export const LEGAL_PAGES: readonly LegalPage[] = [
  { file: "confidentialite.html", ...PRIVACY },
  { file: "conditions.html", ...TERMS },
  { file: "terms.html", ...TERMS },
];

/** Markdown to HTML with the same renderer and plugins as the page component. */
export function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm] }, markdown));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Same layout as ConfidentialitePage / ConditionsPage, so the text sits where
 * it will stay once React has mounted.
 */
function pageMarkup(page: LegalPage, articleHtml: string): string {
  return (
    '<div class="conf-root min-h-screen">' +
    '<header class="conf-header sticky top-0 z-10 border-b backdrop-blur">' +
    '<div class="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">' +
    '<a href="/" class="text-sm font-medium opacity-80 hover:opacity-100 transition">← OhMyWind</a>' +
    `<span class="text-xs opacity-60">${escapeHtml(page.label)}</span>` +
    "</div></header>" +
    `<article class="max-w-3xl mx-auto px-6 py-10 prose-conf">${articleHtml}</article>` +
    "</div>"
  );
}

/** Replace exactly one match, or fail the build: index.html changed shape. */
function replaceOnce(html: string, pattern: RegExp, replacement: string): string {
  const matches = html.match(new RegExp(pattern.source, "g"));
  if (matches?.length !== 1) {
    throw new Error(`legal pages: expected one ${pattern} in index.html, found ${matches?.length ?? 0}`);
  }
  return html.replace(pattern, () => replacement);
}

/**
 * The built index.html with the page's text in `#root` and its own head.
 *
 * `cssHrefs` are the page chunk's stylesheets: linked here, the text is laid
 * out as it will be once React has mounted, and Vite's preload helper finds
 * them already in the document when the chunk asks for them. `jsHrefs` are
 * the chunk and its imports, preloaded so the page component does not wait
 * for the entry to boot before it is fetched. The "Loading…" of the route
 * still shows between the static text and the page: React keeps a Suspense
 * fallback on screen for at least 300 ms, preload or not.
 */
export function buildLegalHtml(
  indexHtml: string,
  page: LegalPage,
  articleHtml: string,
  cssHrefs: readonly string[] = [],
  jsHrefs: readonly string[] = [],
): string {
  const url = SITE + page.canonicalPath;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  let html = indexHtml;
  html = replaceOnce(html, /<html lang="[^"]*">/, `<html lang="${STATIC_LANG}">`);
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = replaceOnce(
    html,
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${description}">`,
  );
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`);
  html = replaceOnce(
    html,
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${description}">`,
  );
  html = replaceOnce(html, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title}">`);
  html = replaceOnce(
    html,
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${description}">`,
  );
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  const links =
    cssHrefs.map((href) => `<link rel="stylesheet" crossorigin href="${href}">`).join("") +
    jsHrefs
      .filter((href) => !html.includes(`href="${href}"`) && !html.includes(`src="${href}"`))
      .map((href) => `<link rel="modulepreload" crossorigin href="${href}">`)
      .join("");
  html = replaceOnce(html, /<\/head>/, `${links}</head>`);
  html = replaceOnce(html, /<div id="root"><\/div>/, `<div id="root">${pageMarkup(page, articleHtml)}</div>`);
  return html;
}

/** Writes the legal pages next to index.html once the bundle is on disk. */
export function legalPagesPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: "ohmywind:legal-pages",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    // writeBundle, before vite-plugin-pwa's closeBundle: the files exist when
    // Workbox lists the precache, and globIgnores (vite.config.ts) keeps them
    // out of it.
    async writeBundle(options, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset") return;
      const indexHtml = String(index.source);
      const outDir = options.dir!;
      await Promise.all(
        LEGAL_PAGES.map(async (page) => {
          const chunk = Object.values(bundle).find((o) => o.type === "chunk" && o.name === page.chunk);
          const css = chunk?.type === "chunk" ? [...(chunk.viteMetadata?.importedCss ?? [])] : [];
          const js = chunk?.type === "chunk" ? [chunk.fileName, ...chunk.imports] : [];
          const markdown = await readFile(join(root, page.source), "utf8");
          const html = buildLegalHtml(
            indexHtml,
            page,
            renderMarkdown(markdown),
            css.map((f) => `/${f}`),
            js.map((f) => `/${f}`),
          );
          return writeFile(join(outDir, page.file), html);
        }),
      );
    },
  };
}
