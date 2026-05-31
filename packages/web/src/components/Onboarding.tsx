import { useCallback, useEffect, useState, type RefObject } from "react";

const STORAGE_KEY = "openwind:onboarding-v1";
// Delay between the user dropping their first spot and the planner hint
// surfacing. Long enough that the user has time to look around the spot's
// forecast, short enough that the cue still feels related to the action.
const SHOW_DELAY_AFTER_SPOT_MS = 30_000;
const AUTO_DISMISS_MS = 8_000;
const CARD_WIDTH = 288;

const TITLE = "Planifier une route ?";
const BODY = "Pour tracer un trajet entre deux spots et estimer la durée, cliquez sur la boussole.";

function hasCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "done";
  } catch {
    return true;
  }
}

function markCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "done");
  } catch {
    /* localStorage blocked — no-op */
  }
}

interface OnboardingProps {
  fabRef: RefObject<HTMLElement | null>;
  hasSpot: boolean;
}

interface CardPosition {
  top: number;
  left: number;
  caret: "left" | "up";
  caretOffset?: number;
}

function computeCardPosition(rect: DOMRect | null): CardPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  const centeredLeft = Math.max(margin, Math.min(vw - CARD_WIDTH - margin, (vw - CARD_WIDTH) / 2));

  if (vw < 640 || !rect) {
    return { top: rect ? rect.bottom + 12 : 110, left: centeredLeft, caret: "up" };
  }
  const left = Math.min(vw - CARD_WIDTH - margin, rect.right + 16);
  const top = Math.max(margin + 56, Math.min(vh - 200, rect.top + rect.height / 2 - 60));
  const caretOffset = Math.max(20, Math.min(80, rect.top + rect.height / 2 - top));
  return { top, left, caret: "left", caretOffset };
}

export function Onboarding({ fabRef, hasSpot }: OnboardingProps) {
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState<CardPosition | null>(null);
  const [haloRect, setHaloRect] = useState<DOMRect | null>(null);

  const finish = useCallback(() => {
    markCompleted();
    setActive(false);
  }, []);

  // Surface the planner hint 30 s after the user drops their first spot.
  // Reading the localStorage flag inside the effect (not at module load)
  // means a user who clears it during the same session can re-trigger.
  useEffect(() => {
    if (!hasSpot) return;
    if (hasCompleted()) return;
    const t = window.setTimeout(() => setActive(true), SHOW_DELAY_AFTER_SPOT_MS);
    return () => clearTimeout(t);
  }, [hasSpot]);

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(finish, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [active, finish]);

  useEffect(() => {
    if (!active) return;
    const update = () => {
      const rect = fabRef.current?.getBoundingClientRect() ?? null;
      setPosition(computeCardPosition(rect));
      setHaloRect(rect);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, fabRef]);

  if (!active || !position) return null;

  return (
    <>
      {haloRect && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none z-[700] onboard-halo"
          style={{
            top: haloRect.top - 6,
            left: haloRect.left - 6,
            width: haloRect.width + 12,
            height: haloRect.height + 12,
            borderRadius: "9999px",
          }}
        />
      )}

      <div
        role="dialog"
        aria-live="polite"
        aria-label={TITLE}
        className="fixed z-[702] onboard-card-enter"
        style={{
          top: position.top,
          left: position.left,
          width: CARD_WIDTH,
        }}
      >
        {position.caret === "left" && (
          <div
            aria-hidden="true"
            className="absolute onboard-caret-left"
            style={{ top: position.caretOffset ?? 24 }}
          />
        )}
        {position.caret === "up" && (
          <div aria-hidden="true" className="absolute onboard-caret-up" />
        )}

        <div
          className="rounded-2xl p-4"
          style={{
            background: "var(--ow-surface-pop)",
            border: "1px solid var(--ow-accent-line)",
            boxShadow: "var(--ow-shadow-pop)",
            backdropFilter: "blur(8px)",
          }}
        >
          <h3
            className="text-sm font-bold tracking-tight mb-1.5"
            style={{ color: "var(--ow-fg-0)" }}
          >
            {TITLE}
          </h3>
          <p
            className="text-[13px] leading-relaxed mb-3"
            style={{ color: "var(--ow-fg-1)" }}
          >
            {BODY}
          </p>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={finish}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                color: "var(--ow-accent)",
                background: "var(--ow-accent-soft)",
              }}
            >
              Compris
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
