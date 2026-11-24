// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import {
  ACTIVE_LIMIT,
  MODEL_META,
  defaultConfig,
  loadModelConfig,
  saveModelConfig,
  subscribeModelConfig,
  type ModelName,
} from "../../config/modelConfig";
import { DRAG_HANDLE_CLASS, useDragReorder } from "../../hooks/useDragReorder";
import { LOCALE_BY_LANG, rich, useT } from "../../i18n";
import { SettingsNote } from "../parts";
import "./models.css";

// A string, so the snapshot compares equal for as long as nothing wrote.
const readOrder = () => loadModelConfig().order.join(",");

/** How long a toast stays up, in step with its CSS animation. */
const TOAST_MS = 2200;

/** The model a reorder brought into the table and the one it pushed out,
    or null when the shown models stayed the same. */
function swapAcrossCut(prev: readonly ModelName[], next: readonly ModelName[]) {
  const before = prev.slice(0, ACTIVE_LIMIT);
  const after = next.slice(0, ACTIVE_LIMIT);
  const shown = after.find((m) => !before.includes(m));
  const ignored = before.find((m) => !after.includes(m));
  return shown && ignored ? { shown, ignored } : null;
}

/**
 * « Modèles météo »: the ordered list of the models, the first
 * `ACTIVE_LIMIT` of which fill the forecast table, in that order; the rest
 * are ignored, kept in order as the fallbacks of a shown model that does not
 * cover the point (`api/openmeteo.ts`).
 *
 * The rules are those of `config/modelConfig.ts`, unchanged: a row moves by
 * its handle (`useDragReorder`: the handle or a mouse grabs at once, a finger
 * on the row lifts it after a hold, a swipe scrolls), or one rank at a time
 * with the arrow keys on the handle. Every move is saved at once. A move
 * that takes a model into the table says so in a toast, which is also what a
 * screen reader hears.
 *
 * The stored order is read through `subscribeModelConfig`, so the reset and
 * any other writer land here without a state of the view's own.
 */
export function ModelsView() {
  const { t, lang } = useT();
  const orderKey = useSyncExternalStore(subscribeModelConfig, readOrder, readOrder);
  const order = useMemo(() => orderKey.split(",") as ModelName[], [orderKey]);
  const hintId = useId();

  // The toast: its text, and a counter that remounts it so the same text
  // said twice runs its animation again.
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const say = useCallback((text: string) => setToast((prev) => ({ text, n: (prev?.n ?? 0) + 1 })), []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  // A keyboard move that stays on its side of the cut has no toast: the new
  // rank is read out from a live region of its own.
  const [moved, setMoved] = useState("");

  const commit = useCallback(
    (next: ModelName[]) => {
      if (next.join(",") === orderKey) return;
      const swap = swapAcrossCut(order, next);
      saveModelConfig({ order: next });
      if (swap) {
        say(
          t("settings.models.toast.swap", {
            shown: MODEL_META[swap.shown].label,
            ignored: MODEL_META[swap.ignored].label,
          }),
        );
      }
    },
    [order, orderKey, say, t],
  );

  const { listRef, previewOrder, dragging, rowProps } = useDragReorder(order, commit);

  const position = (model: ModelName, idx: number) =>
    t(idx < ACTIVE_LIMIT ? "settings.models.position.shown" : "settings.models.position.ignored", {
      model: MODEL_META[model].label,
      rank: idx + 1,
    });

  // The handle of a row moved by the keyboard keeps the focus: React may
  // move its node within the list, which drops the focus.
  const handles = useRef(new Map<ModelName, HTMLButtonElement>());
  const refocus = useRef<ModelName | null>(null);
  useLayoutEffect(() => {
    const model = refocus.current;
    refocus.current = null;
    if (model) handles.current.get(model)?.focus();
  }, [orderKey]);

  const onHandleKey = (e: KeyboardEvent, model: ModelName, idx: number) => {
    const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    const to = Math.max(0, Math.min(order.length - 1, idx + step));
    if (to === idx) return;
    const next = [...order];
    next.splice(idx, 1);
    next.splice(to, 0, model);
    refocus.current = model;
    commit(next);
    if (!swapAcrossCut(order, next)) setMoved(position(model, to));
  };

  const reset = () => {
    saveModelConfig(defaultConfig());
    say(t("settings.models.toast.reset"));
  };

  const number = useMemo(() => new Intl.NumberFormat(LOCALE_BY_LANG[lang], { maximumFractionDigits: 1 }), [lang]);
  const horizon = (hours: number) =>
    hours < 72
      ? t("config.models.horizonHours", { hours })
      : t("config.models.horizonDays", { days: Math.round(hours / 24) });

  return (
    <>
      {/* Pinned to the top of the view's scroll area, so it shows wherever
          the list is scrolled to. Always in the tree: a live region has to
          be there before its text changes to be heard. */}
      <div className="ow-models-toast-anchor" role="status">
        {toast && (
          <div key={toast.n} className="ow-models-toast">
            {toast.text}
          </div>
        )}
      </div>
      <p className="sr-only" role="status">
        {moved}
      </p>
      <p id={hintId} hidden>
        {t("settings.models.handle.hint")}
      </p>

      <div className="ow-models-intro">
        <SettingsNote>
          {rich(t("settings.models.intro", { limit: ACTIVE_LIMIT }), {
            b: (c) => <b className="ow-models-strong">{c}</b>,
          })}
        </SettingsNote>
      </div>

      <div className="ow-models-head" aria-hidden="true">
        <span>{t("settings.models.headShown")}</span>
        <span>{t("settings.models.headIgnored")}</span>
      </div>

      <ol className="ow-models-list" ref={listRef} aria-label={t("config.models.title")}>
        {previewOrder.map((model, idx) => {
          const meta = MODEL_META[model];
          const shown = idx < ACTIVE_LIMIT;
          const cut = idx === ACTIVE_LIMIT - 1 && previewOrder.length > ACTIVE_LIMIT;
          return (
            <li
              key={model}
              {...rowProps(model, idx)}
              className={`ow-models-row ${shown ? "is-shown" : "is-ignored"}${cut ? " is-cut" : ""}${
                dragging === model ? " is-dragging" : ""
              }`}
            >
              <span className="ow-models-rank" aria-hidden="true">
                {idx + 1}
              </span>
              <span className="ow-models-text">
                <span className="ow-models-label">
                  {meta.label} <span className="ow-models-provider">{t(meta.provider)}</span>
                </span>
                <span className="ow-models-desc">{t(meta.description)}</span>
                <span className="ow-models-meta">
                  {t("settings.models.meta", {
                    resolution: number.format(meta.resolutionKm),
                    horizon: horizon(meta.horizonHours),
                    coverage: t(meta.coverage),
                  })}
                </span>
              </span>
              <button
                type="button"
                ref={(el) => {
                  if (el) handles.current.set(model, el);
                  else handles.current.delete(model);
                }}
                className={`${DRAG_HANDLE_CLASS} ow-models-handle`}
                aria-label={position(model, idx)}
                aria-roledescription={t("settings.models.handle.role")}
                aria-describedby={hintId}
                onKeyDown={(e) => onHandleKey(e, model, idx)}
              >
                <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
                  <path d="M2 2h16M2 7h16M2 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              {cut && (
                <span className="ow-models-cut" aria-hidden="true">
                  {t("settings.models.cut")}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <button type="button" className="ow-models-reset" onClick={reset}>
        {t("settings.models.reset")}
      </button>
    </>
  );
}
