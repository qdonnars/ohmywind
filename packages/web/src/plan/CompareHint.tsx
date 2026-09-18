// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePlan } from "./session/planContext";
import { spotlightDoors } from "./doorsSpotlight";
import { LG_MEDIA_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { useT } from "../i18n";

const STORAGE_KEY = LOCAL_STORAGE_KEYS.compareHint;
/** After the first plan lands: long enough to read the figures first. */
const SHOW_DELAY_MS = 2_500;
/**
 * The card announces a change of the interface, so it has a shelf life: a
 * month on, nobody is new to the two doors any more. From this instant the
 * component renders nothing, and it can go with its four `panel.hint.*`
 * keys.
 */
const SHOWN_UNTIL = Date.UTC(2026, 9, 19); // 2026-10-19T00:00Z, exclusive
const CARD_WIDTH = 320;
/** Between the card and the doors it points at. */
const GAP_PX = 14;
const MARGIN_PX = 16;
/** Under this much room above the doors, the card goes back over the map. */
const MIN_ROOM_ABOVE_PX = 220;
/** Sub-pixel slack in the on-screen test: the drawer fits its content to a
    fraction of a pixel, and a box 0.5 px past the edge is on screen. */
const SLACK_PX = 1;

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

/** The doors block, what the panel scrolls to. */
function findDoors(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-compare-doors]");
}

/** The row of the two buttons, what the card points at. */
function findDoorsRow(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-compare-doors-row]");
}

/** Scroll the panel to the doors, wherever the results left them. */
function goToDoors(): void {
  findDoors()?.scrollIntoView?.({ behavior: "smooth", block: "end" });
}

/** The ancestors that clip `el`: the panel it scrolls in, first of all. */
function clippers(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (/auto|scroll|hidden|clip/.test(overflowX + overflowY)) out.push(node);
  }
  return out;
}

interface Box {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** `el`'s rect when the whole of it is on screen, not scrolled out of its panel; null otherwise. */
function visibleRect(el: HTMLElement): DOMRect | null {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const inside = (box: Box) =>
    rect.top >= box.top - SLACK_PX &&
    rect.bottom <= box.bottom + SLACK_PX &&
    rect.left >= box.left - SLACK_PX &&
    rect.right <= box.right + SLACK_PX;
  if (!inside({ top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth })) return null;
  for (const c of clippers(el)) if (!inside(c.getBoundingClientRect())) return null;
  return rect;
}

/**
 * Where the card goes. Over the map by default, in the corner nearest the
 * panel. When the doors are already on screen, next to them instead, with a
 * caret pointing at them: on the map to their left on desktop, where the
 * panel is a sidebar on the right; just above them under `lg`, where the
 * panel is a drawer below the map.
 */
type Placement =
  | { kind: "default" }
  | { kind: "beside"; right: number; bottom: number; caretBottom: number }
  | { kind: "above"; bottom: number };

function placeCard(rect: DOMRect | null, desktop: boolean): Placement {
  if (!rect) return { kind: "default" };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (desktop) {
    const right = vw - rect.left + GAP_PX;
    if (vw - right - CARD_WIDTH < MARGIN_PX) return { kind: "default" };
    // Bottom edges aligned, the caret at the doors' middle, measured from
    // the card's bottom so the card's own height needs no measuring.
    const bottom = Math.max(MARGIN_PX, vh - rect.bottom);
    const caretBottom = Math.max(MARGIN_PX, vh - bottom - (rect.top + rect.height / 2) - 8);
    return { kind: "beside", right, bottom, caretBottom };
  }
  const bottom = vh - rect.top + GAP_PX;
  if (vh - bottom < MIN_ROOM_ABOVE_PX) return { kind: "default" };
  return { kind: "above", bottom };
}

function samePlacement(a: Placement, b: Placement): boolean {
  const left = a as Record<string, unknown>;
  return a.kind === b.kind && Object.entries(b).every(([k, v]) => left[k] === v);
}

/**
 * Once, over the map, after the first plan is computed: the interface has
 * changed, departures compare as before and routes compare now too, through
 * the two doors at the end of the results. « Y aller » scrolls the panel to
 * the doors and lights them up. Gone for good once dismissed, or once the
 * comparison has been opened by any door, and gone for everyone past
 * `SHOWN_UNTIL`.
 */
export function CompareHint() {
  const { t } = useT();
  const { state, isLoading } = usePlan();
  const { mode, passage, isStale, waypoints } = state;
  const desktop = useMediaQuery(LG_MEDIA_QUERY);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(() => isDone() || Date.now() >= SHOWN_UNTIL);
  const [placement, setPlacement] = useState<Placement>({ kind: "default" });
  const eligible = mode === "single" && passage !== null && !isStale && !isLoading && waypoints.length >= 2;
  const visible = shown && !done && eligible;

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

  // The doors move with the panel's scroll, the window, and the panel's own
  // size (the drawer dragged up, the sidebar widened): the placement follows
  // all three. A layout effect, so the card never paints in the corner for a
  // frame before jumping next to the doors.
  useLayoutEffect(() => {
    if (!visible) return;
    const row = findDoorsRow();
    // Scroll fires a stream of events: only a placement that moved re-renders.
    const update = () => {
      const next = placeCard(row ? visibleRect(row) : null, desktop);
      setPlacement((prev) => (samePlacement(prev, next) ? prev : next));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer = row && typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (observer && row) for (const c of clippers(row)) observer.observe(c);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [visible, desktop]);

  const dismiss = useCallback(() => {
    markDone();
    setDone(true);
  }, []);

  if (!visible) return null;
  const anchored = placement.kind !== "default";
  const style: React.CSSProperties | undefined =
    placement.kind === "beside"
      ? { right: placement.right, bottom: placement.bottom, width: CARD_WIDTH }
      : placement.kind === "above"
        ? { left: MARGIN_PX, right: MARGIN_PX, bottom: placement.bottom }
        : undefined;
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("panel.hint.title")}
      className={
        anchored
          ? "fixed z-[702] onboard-card-enter"
          : "absolute inset-x-4 bottom-4 z-[600] onboard-card-enter lg:inset-x-auto lg:left-4 lg:w-[320px]"
      }
      style={style}
    >
      {placement.kind === "beside" && (
        <div aria-hidden="true" className="absolute onboard-caret-right" style={{ bottom: placement.caretBottom }} />
      )}
      {placement.kind === "above" && <div aria-hidden="true" className="absolute onboard-caret-down" />}
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
              spotlightDoors();
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
