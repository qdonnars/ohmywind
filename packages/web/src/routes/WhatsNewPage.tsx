// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useMemo, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { LOCALE_BY_LANG, useT, type Lang } from "../i18n";
import { formatReleaseDate, linkPullRequests, parseChangelog, visibleReleases, type Release } from "../content/changelog";
import { markWhatsNewSeen } from "../config/whatsNewSeen";
import { APP_VERSION } from "../utils/version";
// The release log lives at the root of the repository, where GitHub readers
// expect it and where the release notes are cut from. One source, read here
// as text: Vite allows the workspace root, and Cloudflare Pages builds from
// the whole repository (the npm workspace already needs it).
import changelogFr from "../../../../CHANGELOG.md?raw";
import changelogEn from "../../../../CHANGELOG.en.md?raw";
import "./whatsNew.css";

// French original and English translation, as for the methodology: German,
// Italian and Spanish readers get the English notes, and the page's intro
// says so in their language.
const CONTENT: Record<Lang, { md: string; lang: Lang }> = {
  fr: { md: changelogFr, lang: "fr" },
  en: { md: changelogEn, lang: "en" },
  de: { md: changelogEn, lang: "en" },
  it: { md: changelogEn, lang: "en" },
  es: { md: changelogEn, lang: "en" },
};

const RELEASES_URL = "https://github.com/qdonnars/ohmywind/releases";
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

/** Links in the notes (pull requests, the registry) all leave the app. */
function MarkdownLink({ node, ...props }: ComponentProps<"a"> & { node?: unknown }) {
  void node; // the hast node react-markdown hands over; not a DOM attribute
  return <a {...props} {...EXTERNAL} />;
}

function ReleaseCard({ release, contentLang, dateFormat }: {
  release: Release;
  contentLang: Lang;
  dateFormat: Intl.DateTimeFormat;
}) {
  const { t } = useT();
  const upcoming = release.date === null;
  const current = !upcoming && release.version === APP_VERSION;
  return (
    <article className={`wn-release${upcoming ? " wn-release-upcoming" : ""}`} id={`v${release.version}`}>
      <p className="wn-meta">
        <span className="wn-version">{release.version}</span>
        {release.date && (
          <>
            <span className="wn-sep" aria-hidden="true" />
            <time dateTime={release.date}>{formatReleaseDate(release.date, dateFormat)}</time>
          </>
        )}
        {upcoming && <span className="wn-chip wn-chip-upcoming">{t("common.whatsNew.upcoming")}</span>}
        {current && <span className="wn-chip wn-chip-current">{t("common.whatsNew.current")}</span>}
      </p>
      <h2 className="wn-title" lang={contentLang}>
        {release.title}
      </h2>
      <div className="wn-body" lang={contentLang}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
          {linkPullRequests(release.body)}
        </ReactMarkdown>
      </div>
    </article>
  );
}

/**
 * /a-propos/nouveautes: the release log, newest first. A page of the app rather than
 * a document, so it follows the theme like /presse. Opening it is what clears
 * the dot on the "i" in the header.
 */
export function WhatsNewPage() {
  const { t, lang } = useT();
  const content = CONTENT[lang];

  const releases = useMemo(
    () => visibleReleases(parseChangelog(content.md), window.location.hostname),
    [content.md],
  );
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(LOCALE_BY_LANG[lang], { day: "numeric", month: "long", year: "numeric" }),
    [lang],
  );

  useEffect(() => {
    markWhatsNewSeen();
  }, []);

  return (
    <div className="wn-root min-h-screen">
      <header className="wn-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* A sub-page of « À propos », where the « i » leads: the way back
              goes there, like the currents map goes back to the methodology. */}
          <a href="/a-propos" className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← {t("explore.infoButton.title")}
          </a>
          <span className="text-xs opacity-60">{t("common.nav.whatsNew.title")}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <p className="wn-eyebrow">{t("common.version", { version: APP_VERSION })}</p>
        <h1 className="wn-heading">{t("common.nav.whatsNew.title")}</h1>
        <p className="wn-intro">{t("common.whatsNew.intro")}</p>

        <ol className="wn-list">
          {releases.map((release) => (
            <li key={release.version}>
              <ReleaseCard release={release} contentLang={content.lang} dateFormat={dateFormat} />
            </li>
          ))}
        </ol>

        <p className="wn-footer">
          <a href={RELEASES_URL} {...EXTERNAL}>
            {t("common.whatsNew.allReleases")}
            {ExternalIcon}
          </a>
        </p>
      </main>
    </div>
  );
}
