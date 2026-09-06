// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import "katex/dist/katex.min.css";

import { useT, type Lang } from "../i18n";
import methodologieFr from "../content/methodologie.md?raw";
import methodologieEn from "../content/methodologie.en.md?raw";
import segmentationSvgUrl from "../content/segmentation.svg?url";
import "./methodologie.css";

// French original and English translation. German, Italian and Spanish
// readers get the English text: four thousand technical words are a lot to
// keep in step across five languages, and a sailor who reads the app in
// German reads English well enough for a methodology. The translation opens on a line
// naming the French text as the reference.
const CONTENT: Record<Lang, string> = {
  fr: methodologieFr,
  en: methodologieEn,
  de: methodologieEn,
  it: methodologieEn,
  es: methodologieEn,
};

export function MethodologiePage() {
  const { t, lang } = useT();
  // Resolve the relative ./segmentation.svg reference inside the markdown to
  // the URL Vite produces. Polar SVGs live under /polars/ in public/, the
  // markdown can reference them directly.
  const md = CONTENT[lang].replace("./segmentation.svg", segmentationSvgUrl);

  return (
    <div className="methodo-root min-h-screen">
      <header className="methodo-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OhMyWind
          </a>
          <span className="text-xs opacity-60">{t("config.docs.methodology")}</span>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-10 prose-methodo">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[
            // Order matters: render math FIRST, otherwise rehype-raw re-parses
            // the tree as plain HTML and strips the `math-display` class — display
            // math then collapses to inline. With rehype-katex first, math is
            // already finished KaTeX HTML by the time rehype-raw runs.
            rehypeKatex,
            rehypeRaw,
            rehypeSlug,
          ]}
        >
          {md}
        </ReactMarkdown>
      </article>
    </div>
  );
}
