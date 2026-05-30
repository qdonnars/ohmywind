import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const STORAGE_KEY = "openwind:onboarding-v1";
const STEP_DURATION_MS = 6500;
const START_DELAY_MS = 700;
const CARD_WIDTH = 288;

type StepKey = "spot" | "table" | "plan";

interface Step {
  key: StepKey;
  title: string;
  body: string;
  bodyMobile?: string;
}

const STEPS: Step[] = [
  {
    key: "spot",
    title: "Vos spots à portée de clic",
    body: "Clic droit sur la carte pour ajouter un spot. Il restera mémorisé pour vos prochaines visites.",
    bodyMobile: "Appui long sur la carte pour ajouter un spot. Il restera mémorisé pour vos prochaines visites.",
  },
  {
    key: "table",
    title: "Les modèles, côte à côte",
    body: "Glissez le tableau horizontalement pour parcourir les prochains jours. Plusieurs modèles sont empilés pour les comparer.",
  },
  {
    key: "plan",
    title: "Planifiez un passage",
    body: "Pour tracer un trajet entre deux spots et estimer la durée, cliquez sur la boussole.",
  },
];

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
  mapRef: RefObject<HTMLElement | null>;
  tableRef: RefObject<HTMLElement | null>;
  fabRef: RefObject<HTMLElement | null>;
  ready: boolean;
}

interface CardPosition {
  top: number;
  left: number;
  caret: "up" | "down" | "left" | null;
  caretOffset?: number;
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function computeCardPosition(stepKey: StepKey, rect: DOMRect | null): CardPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  const centeredLeft = Math.max(margin, Math.min(vw - CARD_WIDTH - margin, (vw - CARD_WIDTH) / 2));

  switch (stepKey) {
    case "spot": {
      const top = rect ? Math.min(vh - 280, rect.top + 24) : 80;
      return { top, left: centeredLeft, caret: "up" };
    }
    case "table": {
      const desired = rect ? rect.top - 168 : vh - 360;
      const top = Math.max(margin + 56, Math.min(vh - 220, desired));
      return { top, left: centeredLeft, caret: "down" };
    }
    case "plan": {
      if (vw < 640 || !rect) {
        return { top: rect ? rect.bottom + 12 : 110, left: centeredLeft, caret: "up" };
      }
      const left = Math.min(vw - CARD_WIDTH - margin, rect.right + 16);
      const top = Math.max(margin + 56, rect.top + rect.height / 2 - 60);
      const caretOffset = Math.max(20, Math.min(80, rect.top + rect.height / 2 - top));
      return { top, left, caret: "left", caretOffset };
    }
  }
}

export function Onboarding({ mapRef, tableRef, fabRef, ready }: OnboardingProps) {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [position, setPosition] = useState<CardPosition | null>(null);
  const [haloRect, setHaloRect] = useState<DOMRect | null>(null);
  const [coarse] = useState<boolean>(() => isCoarsePointer());
  const timerRef = useRef<number | null>(null);

  const step = STEPS[stepIdx];

  const finish = useCallback(() => {
    markCompleted();
    setActive(false);
  }, []);

  const next = useCallback(() => {
    setStepIdx((i) => {
      if (i >= STEPS.length - 1) {
        markCompleted();
        setActive(false);
        return i;
      }
      return i + 1;
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (hasCompleted()) return;
    const t = window.setTimeout(() => setActive(true), START_DELAY_MS);
    return () => clearTimeout(t);
  }, [ready]);

  useEffect(() => {
    if (!active) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(next, STEP_DURATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, stepIdx, next]);

  useEffect(() => {
    if (!active) return;
    const update = () => {
      const targetRef =
        step.key === "spot" ? mapRef : step.key === "table" ? tableRef : fabRef;
      const rect = targetRef.current?.getBoundingClientRect() ?? null;
      setPosition(computeCardPosition(step.key, rect));
      setHaloRect(step.key === "plan" ? rect : null);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step.key, mapRef, tableRef, fabRef]);

  if (!active || !position) return null;

  const isLast = stepIdx === STEPS.length - 1;
  const body = (coarse && step.bodyMobile) || step.body;

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
        aria-label={step.title}
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
        {position.caret === "down" && (
          <div aria-hidden="true" className="absolute onboard-caret-down" />
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
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h3
              className="text-sm font-bold tracking-tight"
              style={{ color: "var(--ow-fg-0)" }}
            >
              {step.title}
            </h3>
            <span
              className="text-[10px] font-semibold tracking-widest uppercase shrink-0"
              style={{ color: "var(--ow-fg-2)" }}
            >
              {stepIdx + 1}/{STEPS.length}
            </span>
          </div>
          <p
            className="text-[13px] leading-relaxed mb-3"
            style={{ color: "var(--ow-fg-1)" }}
          >
            {body}
          </p>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={finish}
              className="text-[11px] font-medium underline-offset-2 hover:underline transition-colors"
              style={{ color: "var(--ow-fg-2)" }}
            >
              Passer
            </button>
            <button
              type="button"
              onClick={next}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                color: "var(--ow-accent)",
                background: "var(--ow-accent-soft)",
              }}
            >
              {isLast ? "Terminé" : "Suivant"}
            </button>
          </div>
          <div
            className="mt-3 h-[2px] rounded-full overflow-hidden"
            style={{ background: "var(--ow-line)" }}
          >
            <div
              key={stepIdx}
              className="h-full onboard-progress"
              style={{ background: "var(--ow-accent)" }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
