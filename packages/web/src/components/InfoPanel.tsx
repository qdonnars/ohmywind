// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ReactNode } from "react";
import { rich, useT } from "../i18n";

/** Every credit link opens in a new tab, hence the same three attributes on
    each: the panel is read mid-planning and must not take the map away. */
function ext(href: string) {
  return (chunk: ReactNode) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline hover:opacity-80">
      {chunk}
    </a>
  );
}

export function InfoPanel() {
  const { t } = useT();
  return (
    <div
      className="px-4 py-5 lg:px-6 lg:py-6 max-w-3xl mx-auto"
      style={{ color: "var(--ow-fg-0)" }}
    >
      <h2
        className="text-lg lg:text-xl font-bold tracking-tight mb-4"
        style={{ color: "var(--ow-fg-0)" }}
      >
        {t("explore.infoPanel.title")}
      </h2>

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

      <section className="mb-5">
        <h3
          className="text-sm font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          {t("explore.infoPanel.project.title")}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          {t("explore.infoPanel.project.body")}
        </p>
      </section>

      <section className="mb-5">
        <h3
          className="text-sm font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          {t("explore.infoPanel.privacy.title")}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          {t("explore.infoPanel.privacy.body")}
        </p>
      </section>

      <section className="mb-5">
        <h3
          className="text-sm font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          {t("explore.infoPanel.sources.title")}
        </h3>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--ow-fg-1)" }}>
          {t("explore.infoPanel.sources.body")}
        </p>
        <a
          href="/methodologie"
          className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: "var(--ow-accent)" }}
        >
          {t("explore.infoPanel.sources.link")}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
        {/* Map credits. The OSM Foundation allows the attribution to sit off
            the map, but only if it stays findable through an info button or
            an About menu, which is exactly this panel. Removing the corner
            notice without this block would breach the ODbL. */}
        <p className="text-xs leading-relaxed mt-4" style={{ color: "var(--ow-fg-2)" }}>
          {rich(t("explore.infoPanel.sources.basemap"), {
            osm: ext("https://www.openstreetmap.org/copyright"),
            ofm: ext("https://openfreemap.org"),
            omt: ext("https://openmaptiles.org"),
            seamap: ext("https://www.openseamap.org"),
            photon: ext("https://photon.komoot.io"),
          })}
        </p>
        <p className="text-xs leading-relaxed mt-2" style={{ color: "var(--ow-fg-2)" }}>
          {rich(t("explore.infoPanel.sources.bathymetry"), {
            emodnet: ext("https://emodnet.ec.europa.eu/en/bathymetry"),
          })}
        </p>
        <p className="text-xs leading-relaxed mt-2" style={{ color: "var(--ow-fg-2)" }}>
          {rich(t("explore.infoPanel.sources.privacy"), {
            a: (chunk) => (
              <a href="/confidentialite" className="underline hover:opacity-80">
                {chunk}
              </a>
            ),
          })}
        </p>
      </section>

      <section className="mb-5">
        <h3
          className="text-sm font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: "var(--ow-accent)" }}
        >
          {t("explore.infoPanel.licence.title")}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          {rich(t("explore.infoPanel.licence.body"), {
            licence: ext("https://github.com/qdonnars/ohmywind/blob/main/LICENSE"),
            trademark: ext("https://github.com/qdonnars/ohmywind/blob/main/TRADEMARK.md"),
          })}
        </p>
      </section>

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
    </div>
  );
}
