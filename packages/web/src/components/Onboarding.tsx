import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  STORAGE_KEY as CUSTOM_SPOTS_KEY,
  LEGACY_STORAGE_KEY as CUSTOM_SPOTS_LEGACY_KEY,
} from "../hooks/useCustomSpots";
import { migrateLegacyKey } from "../utils/localStorageMigration";

const STORAGE_KEY = "ohmywind:onboarding-v1";
const LEGACY_STORAGE_KEY = "openwind:onboarding-v1";
const LAST_SIMULATION_KEY = "ow_last_simulation_v1";
// Time between page load and the planner hint surfacing — for first-time
// users only. The check is a snapshot at mount; subsequent state changes
// (adding/removing spots during the 15 s) don't cancel the popup.
const SHOW_DELAY_MS = 15_000;
const AUTO_DISMISS_MS = 8_000;
const CARD_WIDTH = 288;

const TITLE = "Planifier une route ?";
const BODY = "Pour tracer un trajet entre deux spots et estimer la durée, cliquez sur le compas.";

// "First-time user" snapshot read once at mount. The popup fires only if all
// three storage signals say "no prior engagement": no saved spots, no
// previously-run plan in cache, and the onboarding flag itself unset. Any
// storage access failure (private browsing strict mode, blocked) falls
// through to false — better silently skip the hint than crash the home page.
function isFirstTimeUser(): boolean {
  try {
    migrateLegacyKey(LEGACY_STORAGE_KEY, STORAGE_KEY);
    if (localStorage.getItem(STORAGE_KEY) === "done") return false;
    migrateLegacyKey(CUSTOM_SPOTS_LEGACY_KEY, CUSTOM_SPOTS_KEY);
    const spotsRaw = localStorage.getItem(CUSTOM_SPOTS_KEY);
    if (spotsRaw) {
      const parsed = JSON.parse(spotsRaw);
      if (Array.isArray(parsed) && parsed.length > 0) return false;
    }
    if (localStorage.getItem(LAST_SIMULATION_KEY)) return false;
    return true;
  } catch {
    return false;
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

export function Onboarding({ fabRef }: OnboardingProps) {
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState<CardPosition | null>(null);
  const [haloRect, setHaloRect] = useState<DOMRect | null>(null);

  const finish = useCallback(() => {
    markCompleted();
    setActive(false);
  }, []);

  // Eligibility is decided once, at mount. Snapshot semantics: a user who
  // qualifies as "first-time" sees the popup 15 s later no matter what they
  // do in the meantime — even if they drop and remove a spot during those
  // 15 s. Returning users (any saved spot OR any past simulation OR the
  // onboarding flag already set) never see it.
  useEffect(() => {
    if (!isFirstTimeUser()) return;
    const t = window.setTimeout(() => setActive(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

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
