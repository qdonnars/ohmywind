// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useEffect, useState } from "react";
import { usePlan } from "./session/planContext";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { useT } from "../i18n";

const STORAGE_KEY = LOCAL_STORAGE_KEYS.compareHint;
/** After the first plan lands: long enough to read the figures first. */
const SHOW_DELAY_MS = 2_500;

function isDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "done";
  } catch {
    // Storage blocked: better no hint than a hint on every plan.
    return true;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "done");
  } catch {
    /* localStorage blocked: no-op */
  }
}

/** Scroll the panel to the doors, wherever the results left them. */
function goToDoors(): void {
  document.querySelector("[data-compare-doors]")?.scrollIntoView?.({ behavior: "smooth", block: "end" });
}

/**
 * Once, over the map, after the first plan is computed: the comparison is
 * at the end of the results, and what comparing two routes means (same
 * ends, other points in between). Gone for good once dismissed, or once the
 * comparison has been opened by any door.
 */
export function CompareHint() {
  const { t } = useT();
  const { state, isLoading } = usePlan();
  const { mode, passage, isStale, waypoints } = state;
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(isDone);
  const eligible = mode === "single" && passage !== null && !isStale && !isLoading && waypoints.length >= 2;

  useEffect(() => {
    if (!eligible || shown || done) return;
    const timer = window.setTimeout(() => setShown(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [eligible, shown, done]);

  // Opening the comparison, by any door, is the lesson learnt. Only the
  // storage is written here; the card follows `done` at the next render.
  useEffect(() => {
    if (mode === "compare") markDone();
  }, [mode]);
  if (mode === "compare" && !done) setDone(true);

  const dismiss = useCallback(() => {
    markDone();
    setDone(true);
  }, []);

  if (!shown || done || !eligible) return null;
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("panel.hint.title")}
      className="absolute inset-x-4 bottom-4 z-[600] onboard-card-enter lg:inset-x-auto lg:left-4 lg:w-[320px]"
    >
      <div
        className="rounded-2xl p-4"
        style={{
          background: "var(--ow-surface-pop)",
          border: "1px solid var(--ow-accent-line)",
          boxShadow: "var(--ow-shadow-pop)",
          backdropFilter: "blur(8px)",
        }}
      >
        <h3 className="text-sm font-bold tracking-tight mb-1.5" style={{ color: "var(--ow-fg-0)" }}>
          {t("panel.hint.title")}
        </h3>
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--ow-fg-1)" }}>
          {t("panel.hint.body")}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "var(--ow-fg-1)", background: "var(--ow-bg-2)" }}
          >
            {t("panel.hint.dismiss")}
          </button>
          <button
            type="button"
            onClick={() => {
              dismiss();
              goToDoors();
            }}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "var(--ow-on-accent)", background: "var(--ow-accent-strong)" }}
          >
            {t("panel.hint.go")}
          </button>
        </div>
      </div>
    </div>
  );
}
