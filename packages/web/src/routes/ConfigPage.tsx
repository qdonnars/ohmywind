// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useMemo, useRef, useState } from "react";
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

// Tab id "polar" predates the tab's rename to "Bateau"; kept to avoid churn
// in return-path links.
type Tab = "models" | "polar";

function formatHorizon(hours: number): string {
  if (hours < 72) return `${hours} h`;
  return `${Math.round(hours / 24)} j`;
}

export function ConfigPage() {
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
  // Track the dragged item by model identity (not by index) so the visual
  // index of the dragged row can shift as the preview reorders without us
  // losing track of which row is being moved.
  const [dragModel, setDragModel] = useState<ModelName | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function update(next: ModelConfig) {
    setConfig(next);
    saveModelConfig(next);
    setSavedOnce(true);
  }

  function reset() {
    update(defaultConfig());
  }

  // Order the user currently sees while dragging. When the user hovers a row,
  // we splice the dragged item to that target slot so the rest of the list
  // visibly shifts in real time. Drop just commits this preview to state.
  const previewOrder = useMemo<ModelName[]>(() => {
    if (dragModel == null || overIdx == null) return config.order;
    const from = config.order.indexOf(dragModel);
    if (from < 0) return config.order;
    if (from === overIdx) return config.order;
    const next = [...config.order];
    const [item] = next.splice(from, 1);
    next.splice(overIdx, 0, item);
    return next;
  }, [config.order, dragModel, overIdx]);

  // Reordering is driven by Pointer Events, not the HTML5 drag-and-drop API:
  // Firefox Android never fires dragstart from a touch, so long-pressing a row
  // did nothing there while Chrome (which does synthesize touch drags) worked.
  // Pointer events behave identically across desktop and mobile browsers.
  const listRef = useRef<HTMLOListElement>(null);

  // Row whose vertical center is closest to the pointer. Pointer capture means
  // move events keep firing on the row where the drag started, so the target
  // slot must be derived from geometry rather than from event targets.
  function targetIndexFromY(clientY: number): number | null {
    const list = listRef.current;
    if (!list) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    [...list.children].forEach((row, i) => {
      const r = (row as HTMLElement).getBoundingClientRect();
      const d = Math.abs(clientY - (r.top + r.height / 2));
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  // Long-press state: touch on a row body arms a hold; a still finger for
  // HOLD_MS lifts the row (native lists' reorder pattern), real movement
  // before that cancels the hold and lets the page scroll instead.
  const HOLD_MS = 350;
  const HOLD_SLOP_PX = 10;
  const holdRef = useRef<{ timer: number; model: ModelName; idx: number; x: number; y: number; pointerId: number; row: HTMLLIElement } | null>(null);
  const dragActiveRef = useRef(false);
  useEffect(() => { dragActiveRef.current = dragModel != null; }, [dragModel]);

  // Once a row is lifted, native scrolling must stop competing for the touch.
  // touch-action can't change mid-gesture and React registers touchmove as
  // passive, so the preventDefault goes through a manual non-passive listener.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const block = (e: TouchEvent) => { if (dragActiveRef.current) e.preventDefault(); };
    list.addEventListener("touchmove", block, { passive: false });
    return () => list.removeEventListener("touchmove", block);
  }, []);

  function activateDrag(row: HTMLLIElement, pointerId: number, model: ModelName, idx: number) {
    // Capture can be refused (pointer already lifted, synthetic events in
    // tests); the drag still works without it since the target slot is
    // computed from geometry, capture just avoids losing fast pointers.
    try { row.setPointerCapture(pointerId); } catch { /* best-effort */ }
    setDragModel(model);
    setOverIdx(idx);
  }

  function clearHold() {
    if (holdRef.current) {
      window.clearTimeout(holdRef.current.timer);
      holdRef.current = null;
    }
  }

  function onRowPointerDown(e: React.PointerEvent<HTMLLIElement>, model: ModelName, idx: number) {
    if (e.button !== 0) return;
    const onHandle = !!(e.target as HTMLElement).closest(".config-handle");
    if (e.pointerType === "mouse" || onHandle) {
      // Immediate grab: a mouse doesn't compete with scrolling, and the
      // handle opts out of it via touch-action: none.
      e.preventDefault();
      activateDrag(e.currentTarget, e.pointerId, model, idx);
      return;
    }
    // Touch on the row body: no preventDefault, a quick swipe must stay a
    // scroll. Arm the hold instead.
    const row = e.currentTarget;
    clearHold();
    holdRef.current = {
      model, idx, x: e.clientX, y: e.clientY, pointerId: e.pointerId, row,
      timer: window.setTimeout(() => {
        if (holdRef.current?.row === row) {
          const { pointerId } = holdRef.current;
          holdRef.current = null;
          activateDrag(row, pointerId, model, idx);
        }
      }, HOLD_MS),
    };
  }

  function onRowPointerMove(e: React.PointerEvent<HTMLLIElement>) {
    if (dragModel != null) {
      const idx = targetIndexFromY(e.clientY);
      if (idx != null && idx !== overIdx) setOverIdx(idx);
      return;
    }
    const hold = holdRef.current;
    if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > HOLD_SLOP_PX) clearHold();
  }

  function onRowPointerUp(e: React.PointerEvent<HTMLLIElement>) {
    clearHold();
    if (dragModel == null) return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    update({ ...config, order: previewOrder });
    setDragModel(null);
    setOverIdx(null);
  }

  function onRowPointerCancel() {
    // Browser reclaimed the gesture (e.g. system interruption): revert, the
    // preview falls back to config.order once dragModel is null.
    clearHold();
    setDragModel(null);
    setOverIdx(null);
  }

  const totalRows = previewOrder.length;
  const ignoredRows = totalRows - ACTIVE_LIMIT;

  return (
    <div className="config-root min-h-screen">
      <header className="config-header sticky top-0 z-10 border-b backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href={returnPath} className="text-sm font-medium opacity-80 hover:opacity-100 transition">
            ← OhMyWind
          </a>
          <span className="text-xs opacity-60">Configuration</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="config-tabs flex gap-2 mb-6" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "models"}
            onClick={() => setTab("models")}
            className={`config-tab ${tab === "models" ? "is-active" : ""}`}
          >
            Modèles météo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "polar"}
            onClick={() => setTab("polar")}
            className={`config-tab ${tab === "polar" ? "is-active" : ""}`}
          >
            Bateau
          </button>
        </div>

        {tab === "models" ? (
          <>
        <h1 className="text-3xl font-bold mb-2">Modèles météo</h1>
        <p className="text-sm opacity-80 mb-8 leading-relaxed">
          Les {ACTIVE_LIMIT} premiers modèles sont affichés dans la table de
          prévision, dans cet ordre. Glissez-déposez pour réordonner (sur
          mobile, appui maintenu sur une ligne, ou directement la poignée
          ⋮⋮). Cette configuration ne touche pas les plans de passage.
        </p>

        <div className="config-list-with-zones">
          <ol className="config-list" ref={listRef}>
            {previewOrder.map((model, idx) => {
              const meta = MODEL_META[model];
              const isActive = idx < ACTIVE_LIMIT;
              const isDragging = dragModel === model;
              return (
                <li
                  key={model}
                  onPointerDown={(e) => onRowPointerDown(e, model, idx)}
                  onPointerMove={onRowPointerMove}
                  onPointerUp={onRowPointerUp}
                  onPointerCancel={onRowPointerCancel}
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
                        {meta.provider}
                      </span>
                    </div>
                    <p className="text-sm opacity-80 mt-1">{meta.description}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs opacity-70">
                      <span>{meta.resolutionKm} km</span>
                      <span>~{formatHorizon(meta.horizonHours)}</span>
                      <span>{meta.coverage}</span>
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
              <span className="config-zone-label">Utilisé dans l'app</span>
            </div>
            {ignoredRows > 0 && (
              <div
                className="config-zone is-ignored"
                style={{ flexGrow: ignoredRows }}
              >
                <span className="config-zone-label">Ignorés</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap mt-6">
          <button type="button" onClick={reset} className="config-reset">
            Réinitialiser
          </button>
          {savedOnce && (
            <span className="text-xs opacity-50">· enregistré</span>
          )}
        </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-2">Bateau</h1>
            <p className="text-sm opacity-80 mb-8 leading-relaxed">
              Décrivez votre bateau : ces réglages nourrissent tous vos plans de
              passage. L'essentiel suffit pour bien commencer ; la tuile
              Avancé permet d'importer votre propre polaire et d'affiner le
              comportement au près et sous spi.
            </p>
            <div className="flex flex-col gap-5">
              <ConfigTile title="Essentiel">
                <BoatEssentials config={polarCfg} onChange={updatePolar} />
              </ConfigTile>
              <ConfigTile
                title="Avancé"
                subtitle="polaire perso, angle de près, spi"
                collapsible
                defaultOpen={false}
              >
                <BoatAdvanced config={polarCfg} onChange={updatePolar} />
              </ConfigTile>
              <ConfigTile title="Polaire résultante" subtitle="ce que le planificateur utilisera">
                <BoatResult config={polarCfg} />
              </ConfigTile>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => updatePolar(defaultPolarConfig())}
                  className="config-reset"
                >
                  Tout réinitialiser
                </button>
                {savedOnce && <span className="text-xs opacity-50">· enregistré</span>}
              </div>
            </div>
          </>
        )}

        <footer className="config-storage-note mt-10">
          OhMyWind ne propose volontairement pas de comptes utilisateurs :
          aucune donnée n'est envoyée sur un serveur pour identifier qui vous êtes.
          Vos préférences (modèles, polaire perso) sont stockées localement
          dans votre navigateur. Si vous changez d'appareil, de navigateur ou si
          vous effacez les cookies de ce site, ces ajustements seront perdus.
        </footer>
      </main>

      <style>{`
        /* Shared controls for the boat tiles (BoatEssentials / BoatAdvanced). */
        .polar-block {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .polar-block-disabled .polar-spi-segment {
          opacity: 0.45;
        }
        .polar-block-disabled .polar-spi-btn {
          cursor: not-allowed;
        }
        .polar-select, .polar-range {
          background: var(--ow-bg-1);
          color: var(--ow-fg-0);
          border: 1px solid var(--ow-line-2);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
        }
        .polar-select:disabled {
          opacity: 0.5;
        }
        .polar-range {
          padding: 0;
          accent-color: var(--ow-accent);
        }
        .polar-hint {
          font-size: 11.5px;
          line-height: 1.5;
          opacity: 0.65;
          margin: 0;
        }
        .polar-spi-segment, .polar-source-segment {
          display: inline-flex;
          gap: 2px;
          padding: 2px;
          border-radius: 10px;
          background: var(--ow-bg-1);
          border: 1px solid var(--ow-line-2);
        }
        .polar-spi-btn {
          padding: 5px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--ow-fg-1);
          background: transparent;
          border: 0;
          transition: background 120ms ease, color 120ms ease;
        }
        .polar-spi-btn:hover:not(.is-active) {
          background: var(--ow-bg-2);
          color: var(--ow-fg-0);
        }
        .polar-spi-btn.is-active {
          background: var(--ow-accent);
          color: #fff;
        }
        .polar-tws-btn {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          background: var(--ow-bg-1);
          color: var(--ow-fg-1);
          border: 1px solid var(--ow-line-2);
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .polar-tws-btn:hover {
          background: var(--ow-bg-2);
        }
        .polar-tws-btn.is-selected {
          background: var(--ow-accent);
          color: #fff;
          border-color: var(--ow-accent);
        }
        .polar-btn {
          font-size: 12px;
          padding: 6px 12px;
          border-radius: 8px;
          color: var(--ow-fg-1);
          background: transparent;
          border: 1px solid var(--ow-line-2);
          transition: background 120ms ease, color 120ms ease;
        }
        .polar-btn:hover {
          background: var(--ow-bg-2);
          color: var(--ow-fg-0);
        }
        .polar-btn-accent {
          border-color: var(--ow-accent);
          color: var(--ow-accent);
        }
        .polar-btn-accent:hover {
          background: color-mix(in srgb, var(--ow-accent) 15%, transparent);
          color: var(--ow-accent);
        }
        .polar-import-current {
          font-size: 12.5px;
          line-height: 1.5;
        }
        .polar-import-name {
          font-weight: 700;
          color: var(--ow-accent);
          font-family: ui-monospace, monospace;
        }
        .polar-import-notice {
          font-size: 11.5px;
          line-height: 1.5;
          margin: 0;
        }
        .polar-import-notice.is-ok {
          color: var(--ow-accent);
        }
        .polar-import-notice.is-error {
          color: var(--ow-err);
        }
        .polar-motor {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 14px;
          border-radius: 10px;
          background: var(--ow-bg-0);
          border: 1px solid var(--ow-line-2);
        }
        .polar-motor-legend {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          opacity: 0.7;
          padding: 0 6px;
        }
        .polar-motor-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .polar-motor-label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
          color: var(--ow-fg-1);
        }
        .polar-motor-input {
          background: var(--ow-bg-1);
          color: var(--ow-fg-0);
          border: 1px solid var(--ow-line-2);
          border-radius: 8px;
          padding: 7px 10px;
          font-size: 13px;
          font-family: ui-monospace, monospace;
        }
        .polar-motor-input:focus {
          outline: none;
          border-color: var(--ow-accent);
        }
        .polar-motor-hint {
          font-size: 11.5px;
          line-height: 1.5;
          opacity: 0.65;
          margin: 0;
        }
        .polar-motor-warn {
          font-size: 11.5px;
          line-height: 1.5;
          color: var(--ow-warn);
          margin: 0;
        }
        .polar-tuning-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: transparent;
          border: 0;
          color: inherit;
          cursor: pointer;
          padding: 0;
          text-align: left;
        }
        .config-root {
          background: var(--ow-bg-0, #0b1220);
          color: var(--ow-fg-0, #e2e8f0);
        }
        .config-tab {
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          color: var(--ow-fg-1, #cbd5e1);
          background: var(--ow-bg-1, rgba(255,255,255,0.04));
          border: 1px solid var(--ow-line-2, rgba(255,255,255,0.10));
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .config-tab:hover {
          background: var(--ow-bg-2, rgba(255,255,255,0.08));
          color: var(--ow-fg-0, #e2e8f0);
        }
        .config-tab.is-active {
          background: var(--ow-accent, #14b8a6);
          color: #fff;
          border-color: var(--ow-accent, #14b8a6);
        }
        .config-storage-note {
          font-size: 12px;
          line-height: 1.55;
          color: var(--ow-fg-2, #94a3b8);
          padding: 14px 16px;
          border-radius: 10px;
          background: var(--ow-bg-1, rgba(255,255,255,0.03));
          border: 1px solid var(--ow-line-2, rgba(255,255,255,0.08));
          border-left-width: 3px;
          border-left-color: var(--ow-fg-2, #94a3b8);
        }
        .config-header {
          background: color-mix(in srgb, var(--ow-bg-0, #0b1220) 75%, transparent);
          border-color: var(--ow-line-2, rgba(255,255,255,0.08));
        }
        .config-list-with-zones {
          display: grid;
          grid-template-columns: 1fr 140px;
          gap: 18px;
          align-items: stretch;
        }
        @media (max-width: 640px) {
          .config-list-with-zones {
            grid-template-columns: 1fr 28px;
            gap: 10px;
          }
        }
        .config-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .config-row {
          background: var(--ow-bg-1, rgba(255,255,255,0.04));
          border-color: var(--ow-line-2, rgba(255,255,255,0.08));
          cursor: grab;
          transition: opacity 150ms ease, transform 200ms ease, border-color 120ms ease, background 120ms ease, box-shadow 150ms ease;
          /* Un appui long saisit la ligne: sans ceci iOS superpose son menu
             contextuel (copier/definir) au moment exact du soulevement. */
          -webkit-touch-callout: none;
          -webkit-user-select: none;
        }
        .config-row:active {
          cursor: grabbing;
        }
        .config-row.is-inactive {
          opacity: 0.45;
        }
        .config-row.is-dragging {
          /* "Soulevée": la ligne suit le doigt dans l'aperçu, elle doit se
             lire comme saisie, pas comme un fantôme. */
          opacity: 0.92;
          transform: scale(1.02);
          border-style: dashed;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
        }
        .config-handle {
          font-size: 14px;
          opacity: 0.35;
          letter-spacing: -2px;
          font-weight: 700;
          color: var(--ow-fg-1, #cbd5e1);
          cursor: grab;
          /* Without this, mobile browsers claim the gesture for scrolling and
             fire pointercancel before a drag can start (Firefox Android is
             strict about it). Scoped to the handle so the row body still
             scrolls the page. */
          touch-action: none;
          padding: 10px 6px;
          margin: -10px -6px;
        }
        .config-rank {
          display: inline-flex;
          width: 22px;
          height: 22px;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--ow-accent, #14b8a6);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
        }
        .config-rank-off {
          background: var(--ow-bg-2, rgba(255,255,255,0.08));
          color: var(--ow-fg-2, #94a3b8);
        }
        .config-reset {
          font-size: 13px;
          padding: 8px 14px;
          border-radius: 8px;
          color: var(--ow-fg-1, #cbd5e1);
          background: transparent;
          border: 1px solid var(--ow-line-2, rgba(255,255,255,0.12));
          transition: background 120ms ease, color 120ms ease;
        }
        .config-reset:hover {
          background: var(--ow-bg-2, rgba(255,255,255,0.06));
          color: var(--ow-fg-0, #e2e8f0);
        }
        .config-zones {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .config-zone {
          position: relative;
          display: flex;
          align-items: center;
          padding-left: 14px;
          min-height: 0;
        }
        .config-zone::before {
          content: "";
          position: absolute;
          top: 6px;
          bottom: 6px;
          left: 0;
          width: 2px;
          border-radius: 2px;
        }
        .config-zone.is-active::before {
          background: var(--ow-accent, #14b8a6);
        }
        .config-zone.is-ignored::before {
          background: var(--ow-line-2, rgba(255,255,255,0.20));
        }
        .config-zone-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          line-height: 1.2;
        }
        .config-zone.is-active .config-zone-label {
          color: var(--ow-accent, #14b8a6);
        }
        .config-zone.is-ignored .config-zone-label {
          color: var(--ow-fg-2, #94a3b8);
        }
        @media (max-width: 640px) {
          .config-row {
            padding: 8px 10px;
            gap: 8px;
            border-radius: 10px;
          }
          .config-row .text-base {
            font-size: 14px;
          }
          .config-row p {
            font-size: 12px;
            margin-top: 2px;
            line-height: 1.35;
          }
          .config-row .text-xs {
            font-size: 11px;
          }
          .config-handle {
            /* Visible on mobile: it is the only touch surface that starts a
               drag (the row body scrolls), so hiding it would make reordering
               impossible by touch. */
            font-size: 16px;
            opacity: 0.5;
          }
          .config-zone {
            padding-left: 10px;
            justify-content: center;
          }
          .config-zone::before {
            top: 4px;
            bottom: 4px;
          }
          .config-zone-label {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            font-size: 10px;
            letter-spacing: 0.08em;
          }
        }
      `}</style>
    </div>
  );
}
