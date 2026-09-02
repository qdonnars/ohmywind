// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import "katex/dist/katex.min.css";

import methodologieMd from "../content/methodologie.md?raw";
import segmentationSvgUrl from "../content/segmentation.svg?url";
import "./methodologie.css";

export function MethodologiePage() {
  // Resolve the relative ./segmentation.svg reference inside the markdown to
  // the URL Vite produces. Polar SVGs live under /polars/ in public/, the
  // markdown can reference them directly.
  const md = methodologieMd.replace("./segmentation.svg", segmentationSvgUrl);

  return (
    <div className="methodo-root min-h-screen">
      <header className="methodo-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OhMyWind
          </a>
          <span className="text-xs opacity-60">Méthodologie</span>
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
