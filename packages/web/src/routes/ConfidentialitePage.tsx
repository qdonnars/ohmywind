import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import confidentialiteMd from "../content/confidentialite.md?raw";

/** Page statique exigée par le Play Store (formulaire Data safety) et liée
    depuis le panneau d'infos. Même habillage "papier blanc" que la page
    méthodologie, sans les plugins math dont elle n'a pas besoin. */
export function ConfidentialitePage() {
  return (
    <div className="conf-root min-h-screen">
      <header className="conf-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OhMyWind
          </a>
          <span className="text-xs opacity-60">Confidentialité</span>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-10 prose-conf">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{confidentialiteMd}</ReactMarkdown>
      </article>

      <style>{`
        /* Force a white-paper look on this page regardless of theme. */
        .conf-root {
          background: #ffffff;
          color: #1f2937;
        }
        .conf-header {
          background: rgba(255, 255, 255, 0.85);
          border-color: rgba(15, 23, 42, 0.10);
        }
        .conf-root a {
          color: #0d9488;
        }
        .prose-conf {
          font-size: 16px;
          line-height: 1.7;
        }
        .prose-conf h1 {
          font-size: 2.25rem;
          font-weight: 700;
          margin: 0 0 1.75rem;
          line-height: 1.15;
          color: #0f172a;
        }
        .prose-conf h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 2.75rem 0 1rem;
          line-height: 1.2;
          padding-bottom: 0.4rem;
          border-bottom: 1px solid rgba(15, 23, 42, 0.12);
          color: #0f172a;
        }
        .prose-conf h3 {
          font-size: 1.15rem;
          font-weight: 600;
          margin: 2rem 0 0.75rem;
          color: #0f172a;
        }
        .prose-conf p {
          margin: 0 0 1rem;
        }
        .prose-conf ul, .prose-conf ol {
          margin: 0 0 1rem;
          padding-left: 1.5rem;
        }
        .prose-conf li {
          margin-bottom: 0.4rem;
        }
        .prose-conf ul { list-style: disc; }
        .prose-conf ol { list-style: decimal; }
        .prose-conf strong { font-weight: 600; color: #0f172a; }
        .prose-conf a {
          color: #0d9488;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .prose-conf a:hover { color: #0f766e; }
        .prose-conf table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0 1.5rem;
          font-size: 0.9rem;
        }
        .prose-conf th, .prose-conf td {
          padding: 0.5rem 0.75rem;
          border: 1px solid rgba(15, 23, 42, 0.12);
          text-align: left;
        }
        .prose-conf th {
          background: #f1f5f9;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
