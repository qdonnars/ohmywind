// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import { consumeReturnPath } from "../config/returnPath";
import { loadKeepAwakeEnabled, saveKeepAwakeEnabled } from "../config/keepAwakePreference";
import { BoatEditor } from "../components/BoatEditor";
import { ModelOrderEditor } from "../components/ModelOrderEditor";
import {
  AVAILABLE_LANGS,
  LANG_NAMES,
  LANG_SHORT_NAMES,
  setLang,
  useT,
} from "../i18n";
import "./config.css";

// Tab id "polar" predates the tab's rename to "Bateau"; kept to avoid churn
// in return-path links.
type Tab = "models" | "polar";

export function ConfigPage() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("models");
  // Resolved at mount so the back link is stable across re-renders. Consuming
  // here also clears the stash, so a hard reload of /config (no remembered
  // path) falls back to "/" on the next click, which is the right default.
  const [returnPath] = useState<string>(() => consumeReturnPath());

  // The content of each tab lives in its own component, shared with the
  // settings (`settings/views/`), and owns its state: loaded at mount, saved
  // on every change.
  return (
    <div className="config-root min-h-screen">
      <header className="config-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href={returnPath} className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OhMyWind
          </a>
          <span className="text-xs opacity-60">{t("config.header.title")}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <LangPicker />
        <KeepAwakeSetting />
        <div className="config-tabs flex gap-2 mb-6" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "models"}
            onClick={() => setTab("models")}
            className={`config-tab ${tab === "models" ? "is-active" : ""}`}
          >
            {t("config.models.title")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "polar"}
            onClick={() => setTab("polar")}
            className={`config-tab ${tab === "polar" ? "is-active" : ""}`}
          >
            {t("config.boat.title")}
          </button>
        </div>

        {tab === "models" ? (
          <>
            <h1 className="text-3xl font-bold mb-2">{t("config.models.title")}</h1>
            <ModelOrderEditor />
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-2">{t("config.boat.title")}</h1>
            <BoatEditor />
          </>
        )}

        <footer className="config-storage-note mt-10">{t("config.storageNote")}</footer>
      </main>
    </div>
  );
}

/**
 * Language, above the tabs so it is reachable from both. Endonyms rather than
 * translated names: a reader lost in the wrong language must recognise their
 * own. The choice persists at once, no save step, and the dictionary loads
 * before the switch lands (see i18n/store).
 *
 * The five pills stay on a single line at every width, by decision: no wrap,
 * no inner scroll, no dropdown. Below the width where the full endonyms fit
 * (the breakpoint and its measurement live in config.css) each pill falls
 * back to its trigram, FRA / ENG / DEU / ITA / ESP, which is still the native
 * name and still recognisable to the reader it is meant for. The full name
 * comes back as soon as there is room for it.
 *
 * Both labels are rendered and CSS picks the one that shows, so nothing
 * depends on measuring at runtime. The accessible name is pinned to the full
 * endonym on the button itself: a screen reader announces "Deutsch", never
 * "DEU", whichever label is on screen.
 */
export function LangPicker() {
  const { t, lang } = useT();
  return (
    <section className="mb-6 flex items-center justify-between gap-3 flex-wrap">
      <span className="text-sm font-medium opacity-80">{t("config.lang.label")}</span>
      <div className="config-segment" role="radiogroup" aria-label={t("config.lang.label")}>
        {AVAILABLE_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            aria-label={LANG_NAMES[l]}
            lang={l}
            className={`config-segment-btn ${lang === l ? "is-active" : ""}`}
            onClick={() => void setLang(l)}
          >
            <span className="config-segment-full" aria-hidden="true">
              {LANG_NAMES[l]}
            </span>
            <span className="config-segment-short" aria-hidden="true">
              {LANG_SHORT_NAMES[l]}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Whether the screen stays on while a computed plan is shown (on by default,
 * see `native/keepAwake.ts`). Same two-pill control as the language, saved
 * at once. The plan page reads it when it opens.
 */
export function KeepAwakeSetting() {
  const { t } = useT();
  const [enabled, setEnabled] = useState(() => loadKeepAwakeEnabled());
  const choose = (next: boolean) => {
    setEnabled(next);
    saveKeepAwakeEnabled(next);
  };
  return (
    <section className="mb-6 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <span id="config-keep-awake-label" className="text-sm font-medium opacity-80">
          {t("config.keepAwake.label")}
        </span>
        <p className="text-xs opacity-60 mt-0.5">{t("config.keepAwake.hint")}</p>
      </div>
      <div className="config-segment" role="radiogroup" aria-labelledby="config-keep-awake-label">
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={enabled === value}
            className={`config-segment-btn ${enabled === value ? "is-active" : ""}`}
            onClick={() => choose(value)}
          >
            {t(value ? "config.keepAwake.on" : "config.keepAwake.off")}
          </button>
        ))}
      </div>
    </section>
  );
}
