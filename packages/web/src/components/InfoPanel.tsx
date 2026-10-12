// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ReactNode } from "react";
import { rich, useT, type Key } from "../i18n";
import { APP_VERSION } from "../utils/version";

/** Every credit link opens in a new tab, hence the same three attributes on
    each: the panel is read mid-planning and must not take the map away. */
function ext(href: string) {
  return (chunk: ReactNode) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline hover:opacity-80">
      {chunk}
    </a>
  );
}

/** A titled block of the panel: the eyebrow in the accent, then whatever
    the section has to say. */
function Section({ title, children }: { title: Key; children: ReactNode }) {
  const { t } = useT();
  return (
    <section className="mb-5">
      <h3
        className="text-sm font-semibold mb-1.5 uppercase tracking-wider"
        style={{ color: "var(--ow-accent)" }}
      >
        {t(title)}
      </h3>
      {children}
    </section>
  );
}

/** The way from a section to its full page, in-app. */
function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
      style={{ color: "var(--ow-accent)" }}
    >
      {children}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </a>
  );
}

// "Quoi de neuf": a four-point sparkle, the usual mark for something new.
const SparkleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />
    <path d="M19 15.5c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2Z" />
  </svg>
);

/** `whatsNewUnseen`: the app runs a release this browser has not read about
    yet, so the "Quoi de neuf" entry carries the same dot as the button. */
export function InfoPanel({ whatsNewUnseen = false }: { whatsNewUnseen?: boolean }) {
  const { t } = useT();
  return (
    <div
      className="px-4 py-5 lg:px-6 lg:py-6 max-w-3xl mx-auto"
      style={{ color: "var(--ow-fg-0)" }}
    >
      <h1
        className="text-lg lg:text-xl font-bold tracking-tight mb-4"
        style={{ color: "var(--ow-fg-0)" }}
      >
        {t("explore.infoPanel.title")}
      </h1>

      {/* The version the app runs and the way to what changed in it, under
          the title: the page is "about the app", and the release log, its
          sub-page, is the part of it that moves. Opening the log is what
          clears the dot. */}
      <a
        href="/a-propos/nouveautes"
        className="mb-4 flex items-center gap-[11px] rounded-xl transition-colors hover:bg-surface-2"
        style={{ padding: "10px 11px", border: "1px solid var(--ow-line)" }}
      >
        <span
          aria-hidden="true"
          className="shrink-0 rounded-lg flex items-center justify-center"
          style={{ width: 30, height: 30, background: "var(--ow-bg-3)", color: "var(--ow-fg-1)" }}
        >
          <span style={{ width: 16, height: 16 }}>{SparkleIcon}</span>
        </span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[13.5px] font-semibold leading-tight" style={{ color: "var(--ow-fg-0)" }}>
            {t("common.nav.whatsNew.title")}
          </span>
          <span className="text-[11px] leading-tight mt-px" style={{ color: "var(--ow-fg-2)" }}>
            {t("common.version", { version: APP_VERSION })}
          </span>
        </span>
        {whatsNewUnseen && (
          <>
            <span
              aria-hidden="true"
              className="shrink-0 rounded-full"
              style={{ width: 8, height: 8, background: "var(--ow-accent)" }}
            />
            <span className="sr-only">{t("common.nav.whatsNew.unseen")}</span>
          </>
        )}
        <span aria-hidden="true" className="shrink-0" style={{ color: "var(--ow-fg-2)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </span>
      </a>

      {/* Usage disclaimer. Used to be a sticky band at the bottom of the plan
          panel; it now lives here, first thing in the panel, so the plan view
          stays free of a permanent warning while the caveat remains one tap
          away. The same text also lives in the README and in the `disclaimer`
          field of every `plan_passage` payload. Keep them in sync. */}
      <section
        className="mb-5 rounded-xl p-4"
        style={{
          background: "color-mix(in srgb, var(--ow-warn) 12%, var(--ow-bg-0))",
          border: "1px solid var(--ow-warn-line)",
        }}
      >
        <h3 className="text-sm font-semibold mb-1.5 inline-flex items-center gap-2" style={{ color: "var(--ow-fg-0)" }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="var(--ow-warn)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden="true"
          >
            <path d="M8 2 14 13H2z" />
            <path d="M8 7v3" />
            <circle cx="8" cy="12" r="0.5" fill="var(--ow-warn)" />
          </svg>
          {t("explore.infoPanel.disclaimer.title")}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          {t("explore.infoPanel.disclaimer.body")}
        </p>
      </section>

      <Section title="explore.infoPanel.project.title">
        <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          {t("explore.infoPanel.project.body")}
        </p>
      </Section>

      <Section title="explore.infoPanel.privacy.title">
        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--ow-fg-1)" }}>
          {t("explore.infoPanel.privacy.body")}
        </p>
        <MoreLink href="/confidentialite">{t("explore.infoPanel.privacy.link")}</MoreLink>
      </Section>

      {/* One sentence each and a link: the panel says what the page covers,
          the page carries the detail. Listing every model and source here
          made the paragraph the longest in the panel and the least read. */}
      <Section title="explore.infoPanel.sources.title">
        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--ow-fg-1)" }}>
          {t("explore.infoPanel.sources.body")}
        </p>
        <MoreLink href="/methodologie">{t("explore.infoPanel.sources.link")}</MoreLink>
      </Section>

      <Section title="explore.infoPanel.press.title">
        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--ow-fg-1)" }}>
          {t("explore.infoPanel.press.body")}
        </p>
        <MoreLink href="/presse">{t("explore.infoPanel.press.link")}</MoreLink>
      </Section>

      <Section title="explore.infoPanel.licence.title">
        <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          {rich(t("explore.infoPanel.licence.body"), {
            licence: ext("https://github.com/qdonnars/ohmywind/blob/main/LICENSE"),
            trademark: ext("https://github.com/qdonnars/ohmywind/blob/main/TRADEMARK.md"),
          })}
        </p>
      </Section>

      <section
        className="rounded-xl p-4 lg:p-5"
        style={{
          background: "var(--ow-accent-soft)",
          border: "1px solid var(--ow-accent-line)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-2 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          {t("explore.infoPanel.support.title")}
        </h3>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--ow-fg-0)" }}>
          {t("explore.infoPanel.support.body")}
        </p>
        <a
          href="https://ko-fi.com/ohmywind"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "var(--ow-accent)",
            color: "var(--ow-on-accent)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          {t("explore.infoPanel.support.cta")}
        </a>
      </section>

      {/* Map credits, last, as the small print of the panel. The OSM
          Foundation allows the attribution to sit off the map, but only if
          it stays findable through an info button or an About menu, which
          is exactly this panel. Removing this block without putting the
          corner notice back on the map would breach the ODbL. */}
      <footer className="mt-6">
        <p className="text-xs leading-relaxed" style={{ color: "var(--ow-fg-2)" }}>
          {rich(t("explore.infoPanel.credits.basemap"), {
            osm: ext("https://www.openstreetmap.org/copyright"),
            ofm: ext("https://openfreemap.org"),
            omt: ext("https://openmaptiles.org"),
            seamap: ext("https://www.openseamap.org"),
            photon: ext("https://photon.komoot.io"),
          })}
        </p>
        <p className="text-xs leading-relaxed mt-2" style={{ color: "var(--ow-fg-2)" }}>
          {rich(t("explore.infoPanel.credits.bathymetry"), {
            emodnet: ext("https://emodnet.ec.europa.eu/en/bathymetry"),
          })}
        </p>
      </footer>
    </div>
  );
}
