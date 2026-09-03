// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useState } from "react";
import { useBackDismiss } from "../../hooks/useBackDismiss";
import {
  ARCHETYPE_LABELS,
  defaultPolarConfig,
  isImportedActive,
  isPersoActive,
  isPolarCustomized,
  savePolarConfig,
} from "../../config/polarConfig";
import { usePolarConfig } from "../../config/usePolarConfig";
import { rememberReturnPath } from "../../config/returnPath";
import { usePlan } from "../session/planContext";
import { useT } from "../../i18n";

// ── ArchetypeSelector ─────────────────────────────────────────────────────────

export function ArchetypeSelector() {
  const { t } = useT();
  const { state, actions, archetypes, compute } = usePlan();
  const currentSlug = state.archetype;
  const onChange = actions.setArchetype;
  // Select the « Perso » entry (shown first as soon as the polar deviates
  // from the stock archetype default).
  const onPersoSelect = actions.selectPerso;
  // Clearing the custom polar has to re-compute: the new fingerprint will not
  // match the cached one, and the request stops carrying the custom matrix.
  const onCustomCleared = compute;

  const [open, setOpen] = useState(false);
  // Back closes the boat picker instead of leaving the planner (issue #300),
  // like the click-away overlay below.
  const close = useCallback(() => setOpen(false), []);
  useBackDismiss(open, close);
  const polarCfg = usePolarConfig();
  const persoDefined = isPolarCustomized(polarCfg);
  const persoSelected = isPersoActive(polarCfg);
  const baseLabel = ARCHETYPE_LABELS[polarCfg.base] ?? polarCfg.base;
  const current = archetypes.find((a) => a.slug === currentSlug);
  const label = persoSelected ? t("panel.boat.custom") : (current?.name ?? currentSlug);
  // Detail line of the « Perso » entry, same shape as the archetype rows:
  // provenance of the customization rather than hull specs.
  const persoDetail = isImportedActive(polarCfg)
    ? t("panel.boat.detailImported", {
        name: polarCfg.imported?.name ?? t("panel.boat.polarFallback"),
      })
    : t("panel.boat.detailAdjusted", { base: baseLabel });

  function resetCustom() {
    savePolarConfig(defaultPolarConfig());
    setOpen(false);
    onCustomCleared();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm transition-colors"
        style={{ color: persoSelected ? "var(--ow-accent)" : "var(--ow-fg-1)" }}
        title={
          persoSelected
            ? t("panel.boat.customActiveTitle", { detail: persoDetail })
            : t("panel.boat.changeTitle")
        }
      >
        {label}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.5 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-7 z-20 min-w-[240px] rounded-xl shadow-xl border overflow-hidden"
            style={{ background: "var(--ow-bg-1)", borderColor: "var(--ow-line-2)", boxShadow: "var(--ow-shadow-pop)" }}
          >
            {persoDefined && (
              <>
                <button
                  onClick={() => { onPersoSelect(); setOpen(false); }}
                  className="w-full text-left px-4 py-3 text-sm transition-colors"
                  style={{
                    background: persoSelected ? "var(--ow-accent-soft)" : "transparent",
                    color: persoSelected ? "var(--ow-accent)" : "var(--ow-fg-0)",
                  }}
                >
                  <div className="font-semibold">{t("panel.boat.custom")}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--ow-fg-2)" }}>
                    {persoDetail}
                  </div>
                </button>
                <div
                  className="flex gap-2 px-4 pb-2.5 text-[11px]"
                  style={{
                    background: persoSelected ? "var(--ow-accent-soft)" : "transparent",
                    color: "var(--ow-accent)",
                    borderBottom: "1px solid var(--ow-line)",
                  }}
                >
                  <a href="/config" onClick={rememberReturnPath} className="underline">
                    {t("panel.boat.edit")}
                  </a>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <button type="button" onClick={resetCustom} className="underline">
                    {t("panel.boat.reset")}
                  </button>
                </div>
              </>
            )}
            {archetypes.map((a) => (
              <button
                key={a.slug}
                onClick={() => { onChange(a.slug); setOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm transition-colors"
                style={{
                  background: !persoSelected && a.slug === currentSlug ? "var(--ow-accent-soft)" : "transparent",
                  color: !persoSelected && a.slug === currentSlug ? "var(--ow-accent)" : "var(--ow-fg-0)",
                  borderBottom: "1px solid var(--ow-line)",
                }}
              >
                <div className="font-semibold">{a.name}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--ow-fg-2)" }}>
                  {a.length_ft} ft · {a.type} · {a.examples[0]}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
