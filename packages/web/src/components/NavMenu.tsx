// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "../hooks/useBackDismiss";
import { useT, type Key } from "../i18n";

/**
 * Where the reader is in the app. The three destinations the menu offers,
 * each a page of its own: the map and its forecast, the passage planner, the
 * favourites side by side.
 */
export type NavDestination = "explore" | "plan" | "compare";

interface Destination {
  id: NavDestination;
  /** `query` is the camera hand-over ("?center=…&zoom=…"), applied to the
      two pages that own a map the reader has framed. The comparison frames
      its own map on the favourites, so it does not take one. */
  href: (query: string) => string;
  title: Key;
  description: Key;
  icon: ReactNode;
}

// The glyphs are the ones the rest of the app already uses for these ideas:
// the wind mark for the forecast, a compass for the planner, and the layers
// stack for spots read on top of each other.
const WindIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
    <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
    <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
  </svg>
);

const CompassIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <polygon points="16.2,7.8 14.1,14.1 7.8,16.2 9.9,9.9" fill="currentColor" stroke="none" />
  </svg>
);

const LayersIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3-9 4.5 9 4.5 9-4.5L12 3z" />
    <path d="m3 12 9 4.5 9-4.5" />
    <path d="m3 16.5 9 4.5 9-4.5" />
  </svg>
);

const BurgerIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

// The "you are here" mark on the current entry. A crosshair, the same
// vocabulary as the locate button: it points at where the reader stands.
const HereIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </svg>
);

const DESTINATIONS: readonly Destination[] = [
  {
    id: "explore",
    href: (query) => `/${query}`,
    title: "common.nav.explore.title",
    description: "common.nav.explore.desc",
    icon: WindIcon,
  },
  {
    id: "plan",
    href: (query) => `/plan${query}`,
    title: "common.nav.plan.title",
    description: "common.nav.plan.desc",
    icon: CompassIcon,
  },
  {
    id: "compare",
    href: () => "/comparer",
    title: "common.nav.compare.title",
    description: "common.nav.compare.desc",
    icon: LayersIcon,
  },
];

const PANEL_WIDTH = 272;
const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 12;

interface PanelPosition {
  top: number;
  left: number;
}

/** Below the trigger, left-aligned with it, kept inside the viewport. */
function panelPosition(rect: DOMRect): PanelPosition {
  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN);
  return {
    top: rect.bottom + PANEL_GAP,
    left: Math.min(Math.max(VIEWPORT_MARGIN, rect.left), maxLeft),
  };
}

interface NavMenuProps {
  current: NavDestination;
  /** Camera hand-over for the map pages, "" when there is none to carry. */
  mapQuery?: string;
  /**
   * "map": the round control floating over the map, top left, on a wide
   * screen. "header": the compact one that takes the logo's place in the
   * header on a phone. Same gesture, same place on the screen, one of the
   * two mounted at a time.
   */
  variant: "map" | "header";
  className?: string;
  /** The trigger, for the onboarding card that points at it. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * The app's navigation: one control at rest, the burger with the current
 * destination as a badge, and on opening the three destinations with their
 * name and their reason to exist.
 *
 * The panel is portaled to `<body>`: the header blurs its backdrop, which
 * makes it both a stacking context and the containing block of any fixed
 * descendant, so a panel rendered in place would slide under the data
 * overlay on the map. Positioned from the trigger's rectangle instead, and
 * re-measured on resize.
 */
export function NavMenu({ current, mapQuery = "", variant, className = "", triggerRef }: NavMenuProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const ownRef = useRef<HTMLButtonElement>(null);
  const buttonRef = triggerRef ?? ownRef;
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  // Android's back button closes the menu instead of leaving the app, the
  // same as Escape and a tap outside (issue #300).
  useBackDismiss(open, close);

  // Measured before paint so the panel never flashes at (0, 0).
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setPosition(panelPosition(rect));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, buttonRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Keyboard readers land on the current page's entry, the one they are
    // most likely to want to move away from.
    panelRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, buttonRef]);

  const active = DESTINATIONS.find((d) => d.id === current) ?? DESTINATIONS[0];
  const isMap = variant === "map";
  const size = isMap ? "w-14 h-14" : "w-10 h-10";
  const glyph = isMap ? "w-7 h-7" : "w-[22px] h-[22px]";
  const badge = isMap ? "w-6 h-6 -right-0.5 -bottom-0.5" : "w-[18px] h-[18px] -right-1 -bottom-1";
  const badgeGlyph = isMap ? "w-3.5 h-3.5" : "w-2.5 h-2.5";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={open ? t("common.nav.close") : t("common.nav.open")}
        title={t("common.nav.open")}
        className={`${isMap ? "absolute z-[400]" : "relative"} ${size} shrink-0 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 ${className}`}
        style={{ background: "var(--ow-accent)", color: "var(--ow-on-accent)" }}
      >
        <span className={glyph}>{BurgerIcon}</span>
        {/* The badge says where the reader is without a word: the panel
            only spells it out once open. */}
        <span
          aria-hidden="true"
          className={`absolute ${badge} rounded-full flex items-center justify-center`}
          style={{
            background: "var(--ow-accent-strong)",
            color: "var(--ow-on-accent)",
            boxShadow: "0 0 0 2px var(--ow-bg-0)",
          }}
        >
          <span className={badgeGlyph}>{active.icon}</span>
        </span>
      </button>

      {open &&
        position &&
        createPortal(
          <>
            {/* Transparent, on purpose: the map stays readable behind the
                panel, and a tap anywhere on it only closes the menu. */}
            <div
              aria-hidden="true"
              className="fixed inset-0 z-[999]"
              onClick={close}
            />
            <div
              ref={panelRef}
              className="fixed z-[1000] p-2 rounded-2xl animate-fade-in"
              style={{
                top: position.top,
                left: position.left,
                width: PANEL_WIDTH,
                background: "var(--ow-surface-pop)",
                border: "1px solid var(--ow-accent-line)",
                boxShadow: "var(--ow-shadow-pop)",
                backdropFilter: "blur(8px)",
              }}
            >
              <nav aria-label={t("common.nav.label")}>
                <ul className="flex flex-col gap-1">
                  {DESTINATIONS.map((d) => {
                    const isCurrent = d.id === current;
                    return (
                      <li key={d.id}>
                        <a
                          href={d.href(mapQuery)}
                          aria-current={isCurrent ? "page" : undefined}
                          // Closing here matters on the current entry: the
                          // router ignores a click on the page one is on,
                          // and the menu would otherwise stay open on it.
                          onClick={close}
                          className={`flex items-center gap-3 px-2.5 py-2 rounded-xl border transition-colors ${
                            isCurrent
                              ? "bg-accent-soft border-accent-line"
                              : "border-transparent hover:bg-surface-2"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                            style={{
                              background: isCurrent ? "var(--ow-accent)" : "var(--ow-bg-2)",
                              color: isCurrent ? "var(--ow-on-accent)" : "var(--ow-fg-1)",
                            }}
                          >
                            <span className="w-5 h-5">{d.icon}</span>
                          </span>
                          <span className="flex-1 min-w-0 flex flex-col leading-tight">
                            <span
                              className="text-[14px] font-bold"
                              style={{ color: isCurrent ? "var(--ow-accent)" : "var(--ow-fg-0)" }}
                            >
                              {t(d.title)}
                            </span>
                            <span className="text-[12px]" style={{ color: "var(--ow-fg-1)" }}>
                              {t(d.description)}
                            </span>
                          </span>
                          {isCurrent && (
                            <span
                              aria-hidden="true"
                              className="shrink-0 w-4 h-4"
                              style={{ color: "var(--ow-accent)" }}
                            >
                              {HereIcon}
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
