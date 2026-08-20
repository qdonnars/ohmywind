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

      <style>{`
        /* Force a white-paper look on this page regardless of theme. */
        .methodo-root {
          background: #ffffff;
          color: #1f2937;
        }
        .methodo-header {
          background: rgba(255, 255, 255, 0.85);
          border-color: rgba(15, 23, 42, 0.10);
        }
        .methodo-root a {
          color: #0d9488;
        }
        .prose-methodo {
          font-size: 16px;
          line-height: 1.7;
        }
        .prose-methodo h1 {
          font-size: 2.25rem;
          font-weight: 700;
          margin: 0 0 1.75rem;
          line-height: 1.15;
          color: #0f172a;
        }
        .prose-methodo h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 2.75rem 0 1rem;
          line-height: 1.2;
          padding-bottom: 0.4rem;
          border-bottom: 1px solid rgba(15, 23, 42, 0.12);
          color: #0f172a;
        }
        .prose-methodo h3 {
          font-size: 1.15rem;
          font-weight: 600;
          margin: 2rem 0 0.75rem;
          color: #0f172a;
        }
        .prose-methodo p {
          margin: 0 0 1rem;
        }
        .prose-methodo ul, .prose-methodo ol {
          margin: 0 0 1rem;
          padding-left: 1.5rem;
        }
        .prose-methodo li {
          margin-bottom: 0.4rem;
        }
        .prose-methodo ul { list-style: disc; }
        .prose-methodo ol { list-style: decimal; }
        .prose-methodo strong { font-weight: 600; color: #0f172a; }
        .prose-methodo a {
          color: #0d9488;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .prose-methodo a:hover { color: #0f766e; }
        .prose-methodo code {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 0.875em;
          padding: 0.1em 0.35em;
          border-radius: 4px;
          background: rgba(15, 23, 42, 0.06);
          color: #0f172a;
        }
        .prose-methodo pre {
          background: #f8fafc;
          padding: 0.9rem 1rem;
          border-radius: 8px;
          overflow-x: auto;
          margin: 0 0 1.25rem;
          font-size: 0.875rem;
          line-height: 1.5;
          border: 1px solid rgba(15, 23, 42, 0.06);
        }
        .prose-methodo pre code {
          background: transparent;
          padding: 0;
          font-size: inherit;
        }
        .prose-methodo table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0 1.5rem;
          font-size: 0.9rem;
        }
        .prose-methodo th, .prose-methodo td {
          padding: 0.5rem 0.75rem;
          border: 1px solid rgba(15, 23, 42, 0.12);
          text-align: left;
        }
        .prose-methodo th {
          background: #f1f5f9;
          font-weight: 600;
        }
        .prose-methodo img {
          display: block;
          max-width: 100%;
          height: auto;
          margin: 1rem auto 1.5rem;
        }
        .prose-methodo blockquote {
          border-left: 3px solid #14b8a6;
          background: #f0fdfa;
          padding: 0.75rem 1rem;
          margin: 1rem 0;
          color: #134e4a;
          border-radius: 0 6px 6px 0;
        }
        .prose-methodo blockquote p { margin-bottom: 0; }
        .prose-methodo blockquote p + p { margin-top: 0.5rem; }
        .prose-methodo details {
          margin: 0.75rem 0;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          background: #f8fafc;
        }
        .prose-methodo details[open] {
          padding-bottom: 1rem;
          border-color: rgba(13, 148, 136, 0.4);
        }
        .prose-methodo summary {
          cursor: pointer;
          font-weight: 500;
          color: #0d9488;
          user-select: none;
        }
        .prose-methodo summary:hover { color: #0f766e; }
        .prose-methodo details[open] summary {
          margin-bottom: 0.75rem;
        }
        /* Center display math; KaTeX block defaults to text-align center but
           rehype-raw can swallow that, so we force it. */
        .prose-methodo .katex-display {
          margin: 1.5rem 0;
          text-align: center;
          overflow-x: auto;
          overflow-y: hidden;
        }
        .prose-methodo .katex-display > .katex {
          display: inline-block;
          text-align: initial;
        }
        /* Anchor scroll-margin so TOC clicks land below the sticky header. */
        .prose-methodo h2, .prose-methodo h3 {
          scroll-margin-top: 80px;
        }
      `}</style>
    </div>
  );
}
