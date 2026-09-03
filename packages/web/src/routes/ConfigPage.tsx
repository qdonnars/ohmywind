// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useState } from "react";
import {
  ACTIVE_LIMIT,
  MODEL_META,
  defaultConfig,
  loadModelConfig,
  saveModelConfig,
  type ModelConfig,
  type ModelName,
} from "../config/modelConfig";
import { consumeReturnPath } from "../config/returnPath";
import {
  defaultPolarConfig,
  loadPolarConfig,
  savePolarConfig,
  type PolarConfig,
} from "../config/polarConfig";
import { BoatAdvanced } from "../components/BoatAdvanced";
import { BoatEssentials } from "../components/BoatEssentials";
import { BoatResult } from "../components/BoatResult";
import { ConfigTile } from "../components/ConfigTile";
import { useDragReorder } from "../hooks/useDragReorder";
import { AVAILABLE_LANGS, LANG_NAMES, setLang, t as translate, useT } from "../i18n";
import "./config.css";

// Tab id "polar" predates the tab's rename to "Bateau"; kept to avoid churn
// in return-path links.
type Tab = "models" | "polar";

// Reads the store directly, under an alias: this helper runs outside the tree
// while the components below bind their own `t` through useT().
function formatHorizon(hours: number): string {
  if (hours < 72) return translate("config.models.horizonHours", { hours });
  return translate("config.models.horizonDays", { days: Math.round(hours / 24) });
}

export function ConfigPage() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("models");
  const [config, setConfig] = useState<ModelConfig>(() => loadModelConfig());
  const [savedOnce, setSavedOnce] = useState(false);
  // Single owner of the boat/polar state: the tiles receive {config, onChange}
  // and never touch localStorage themselves, so the two of them always see
  // the same object and every change is persisted exactly once.
  const [polarCfg, setPolarCfg] = useState<PolarConfig>(() => loadPolarConfig());

  function updatePolar(next: PolarConfig) {
    // Any touch in the Bateau tab re-selects the perso polar on /plan (its
    // selector may have parked it in favour of a stock archetype).
    const activated = { ...next, persoActive: true };
    setPolarCfg(activated);
    savePolarConfig(activated);
    setSavedOnce(true);
  }
  // Resolved at mount so the back link is stable across re-renders. Consuming
  // here also clears the stash, so a hard reload of /config (no remembered
  // path) falls back to "/" on the next click, which is the right default.
  const [returnPath] = useState<string>(() => consumeReturnPath());

  function update(next: ModelConfig) {
    setConfig(next);
    saveModelConfig(next);
    setSavedOnce(true);
  }

  function reset() {
    update(defaultConfig());
  }

  // Reordering by drag, pointer events, mouse and touch alike. See the hook
  // for the hold-to-lift rule and why the HTML5 drag API is not used.
  const commitOrder = useCallback(
    (order: ModelName[]) => {
      setConfig((prev) => {
        const next = { ...prev, order };
        saveModelConfig(next);
        return next;
      });
      setSavedOnce(true);
    },
    [],
  );
  const { listRef, previewOrder, dragging, rowProps } = useDragReorder(
    config.order,
    commitOrder,
  );

  const totalRows = previewOrder.length;
  const ignoredRows = totalRows - ACTIVE_LIMIT;

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
        <p className="text-sm opacity-80 mb-8 leading-relaxed">
          {t("config.models.intro", { limit: ACTIVE_LIMIT })}
        </p>

        <div className="config-list-with-zones">
          <ol className="config-list" ref={listRef}>
            {previewOrder.map((model, idx) => {
              const meta = MODEL_META[model];
              const isActive = idx < ACTIVE_LIMIT;
              const isDragging = dragging === model;
              return (
                <li
                  key={model}
                  {...rowProps(model, idx)}
                  className={`config-row flex items-stretch gap-3 rounded-xl border p-3 select-none ${
                    isActive ? "is-active" : "is-inactive"
                  } ${isDragging ? "is-dragging" : ""}`}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="config-handle" aria-hidden>
                      ⋮⋮
                    </span>
                    <span
                      className={`config-rank ${
                        isActive ? "" : "config-rank-off"
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-base font-semibold">
                        {meta.label}
                      </span>
                      <span className="text-xs opacity-70">
                        {t(meta.provider)}
                      </span>
                    </div>
                    <p className="text-sm opacity-80 mt-1">{t(meta.description)}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs opacity-70">
                      <span>{meta.resolutionKm} km</span>
                      <span>~{formatHorizon(meta.horizonHours)}</span>
                      <span>{t(meta.coverage)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Right-side bracket annotating which rows are used vs ignored.
              Flex-grow proportional to row counts so the segments line up with
              the corresponding list rows. */}
          <div className="config-zones" aria-hidden>
            <div
              className="config-zone is-active"
              style={{ flexGrow: ACTIVE_LIMIT }}
            >
              <span className="config-zone-label">{t("config.models.zoneActive")}</span>
            </div>
            {ignoredRows > 0 && (
              <div
                className="config-zone is-ignored"
                style={{ flexGrow: ignoredRows }}
              >
                <span className="config-zone-label">{t("config.models.zoneIgnored")}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap mt-6">
          <button type="button" onClick={reset} className="config-reset">
            {t("config.reset")}
          </button>
          {savedOnce && <span className="text-xs opacity-50">{t("config.saved")}</span>}
        </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-2">{t("config.boat.title")}</h1>
            <p className="text-sm opacity-80 mb-8 leading-relaxed">{t("config.boat.intro")}</p>
            <div className="flex flex-col gap-5">
              <ConfigTile title={t("config.boat.essentials.title")}>
                <BoatEssentials config={polarCfg} onChange={updatePolar} />
              </ConfigTile>
              <ConfigTile
                title={t("config.boat.advanced.title")}
                subtitle={t("config.boat.advanced.subtitle")}
                collapsible
                defaultOpen={false}
              >
                <BoatAdvanced config={polarCfg} onChange={updatePolar} />
              </ConfigTile>
              <ConfigTile
                title={t("config.boat.result.title")}
                subtitle={t("config.boat.result.tileSubtitle")}
              >
                <BoatResult config={polarCfg} />
              </ConfigTile>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => updatePolar(defaultPolarConfig())}
                  className="config-reset"
                >
                  {t("config.boat.resetAll")}
                </button>
                {savedOnce && <span className="text-xs opacity-50">{t("config.saved")}</span>}
              </div>
            </div>
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
 */
function LangPicker() {
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
            lang={l}
            className={`config-segment-btn ${lang === l ? "is-active" : ""}`}
            onClick={() => void setLang(l)}
          >
            {LANG_NAMES[l]}
          </button>
        ))}
      </div>
      {lang !== "fr" && (
        <p className="w-full text-xs opacity-60 m-0">{t("config.lang.backendNote")}</p>
      )}
    </section>
  );
}
