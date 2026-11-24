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
import { useDragReorder } from "../hooks/useDragReorder";
import { t as translate, useT } from "../i18n";
import "../routes/config.css";

// Reads the store directly, under an alias: this helper runs outside the tree
// while the component below binds its own `t` through useT().
function formatHorizon(hours: number): string {
  if (hours < 72) return translate("config.models.horizonHours", { hours });
  return translate("config.models.horizonDays", { days: Math.round(hours / 24) });
}

/**
 * The ordering of the weather models: intro, the list to reorder by drag,
 * the bracket of the rows used and ignored, and the reset. The "Modèles
 * météo" tab of /config, and for now the "Modèles météo" view of the
 * settings, which show it as it is. Owns its state: loaded at mount, saved
 * on every change.
 */
export function ModelOrderEditor() {
  const { t } = useT();
  const [config, setConfig] = useState<ModelConfig>(() => loadModelConfig());
  const [savedOnce, setSavedOnce] = useState(false);

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
    <>
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
  );
}
