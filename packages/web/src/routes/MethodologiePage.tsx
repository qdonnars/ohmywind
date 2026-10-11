// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { lazy, Suspense, type ComponentProps } from "react";
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
import courantsFr from "../content/methodologie-courants.md?raw";
import courantsEn from "../content/methodologie-courants.en.md?raw";
import segmentationSvgUrl from "../content/segmentation.svg?url";
import "./methodologie.css";

// The interactive map is Leaflet plus the vector basemap: loaded only when
// the article mounts it, so a reader who never scrolls to the currents
// section never pays for it.
const TidalSourcesMap = lazy(() => import("./TidalSourcesMap"));

/**
 * ``<div data-widget="tidal-map">`` in the markdown becomes the map. Any
 * other div stays a div: rehype-raw hands us every raw HTML element, and
 * this is the one hook the content needs.
 */
function MarkdownDiv({ node, ...props }: ComponentProps<"div"> & { node?: unknown }) {
  void node; // the hast node react-markdown hands over; not a DOM attribute
  const widget = (props as Record<string, unknown>)["data-widget"];
  if (widget === "tidal-map") {
    return (
      <Suspense fallback={<div className="methodo-map-canvas" aria-busy="true" />}>
        <TidalSourcesMap />
      </Suspense>
    );
  }
  return <div {...props} />;
}

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

// The tidal-currents page: the cascade, the coverage map and the atlas
// predictor, split off the main text once it had grown to a third of it.
// Same renderer, same stylesheet, same chunk.
const COURANTS: Record<Lang, string> = {
  fr: courantsFr,
  en: courantsEn,
  de: courantsEn,
  it: courantsEn,
  es: courantsEn,
};

function DocPage({ md, back, label }: { md: string; back: { href: string; text: string }; label: string }) {
  return (
    <div className="methodo-root min-h-screen">
      <header className="methodo-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href={back.href} className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← {back.text}
          </a>
          <span className="text-xs opacity-60">{label}</span>
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
          components={{ div: MarkdownDiv }}
        >
          {md}
        </ReactMarkdown>
      </article>
    </div>
  );
}

export function MethodologiePage() {
  const { t, lang } = useT();
  // Resolve the relative ./segmentation.svg reference inside the markdown to
  // the URL Vite produces. Polar SVGs live under /polars/ in public/, the
  // markdown can reference them directly.
  const md = CONTENT[lang].replace("./segmentation.svg", segmentationSvgUrl);
  return <DocPage md={md} back={{ href: "/", text: "OhMyWind" }} label={t("config.docs.methodology")} />;
}

export function MethodologieCourantsPage() {
  const { t, lang } = useT();
  return (
    <DocPage
      md={COURANTS[lang]}
      back={{ href: "/methodologie", text: t("config.docs.methodology") }}
      label={t("config.docs.tidalCurrents")}
    />
  );
}
