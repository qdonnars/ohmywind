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
  /** Size of the glyph on the panel's tile. The drawn compass needs more
      room than a stroked outline to carry the same weight. */
  tileGlyph?: number;
}

// The glyphs are the ones the rest of the app already uses for these ideas:
// the wind mark for the forecast, the dividers for the planner, and the
// layers stack for spots read on top of each other.
const WindIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
    <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
    <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
  </svg>
);

// The planner keeps the pair of dividers the floating button carried before
// the menu existed: the very asset, painted through a mask so `currentColor`
// gives it the ink of wherever it sits, light theme or dark.
const CompassIcon = (
  <span
    aria-hidden="true"
    style={{
      display: "inline-block",
      width: "100%",
      height: "100%",
      background: "currentColor",
      WebkitMaskImage: "url(/compass.png)",
      maskImage: "url(/compass.png)",
      WebkitMaskSize: "contain",
      maskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskPosition: "center",
    }}
  />
);

const LayersIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

const BurgerIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

// The "you are here" mark on the current entry. A crosshair, the same
// vocabulary as the locate button: it points at where the reader stands.
const HereIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
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
    tileGlyph: 18,
  },
  {
    id: "compare",
    href: () => "/comparer",
    title: "common.nav.compare.title",
    description: "common.nav.compare.desc",
    icon: LayersIcon,
  },
];

const PANEL_WIDTH = 268;
const PANEL_GAP = 10;
/** On a phone the panel spans the width, this far from each edge. */
const PHONE_MARGIN = 10;

interface PanelPosition {
  top: number;
  left: number;
  width: number;
}

/** Below the trigger: left-aligned with it on a wide screen, kept inside
    the viewport; edge to edge on a phone. */
function panelPosition(rect: DOMRect, variant: "map" | "header"): PanelPosition {
  if (variant === "header") {
    return {
      top: rect.bottom + PANEL_GAP - 2,
      left: PHONE_MARGIN,
      width: window.innerWidth - 2 * PHONE_MARGIN,
    };
  }
  const maxLeft = Math.max(PHONE_MARGIN, window.innerWidth - PANEL_WIDTH - PHONE_MARGIN);
  return {
    top: rect.bottom + PANEL_GAP,
    left: Math.min(Math.max(PHONE_MARGIN, rect.left), maxLeft),
    width: PANEL_WIDTH,
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
      if (rect) setPosition(panelPosition(rect, variant));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, buttonRef, variant]);

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
  // The design's proportions: 52 px on the map, 44 px in the header, the
  // glyph at 0.42 of that, the badge at 0.44 with its own glyph at 0.24.
  const size = isMap ? 52 : 44;
  const glyph = Math.round(size * 0.42);
  const badge = Math.round(size * 0.44);
  const badgeGlyph = Math.round(size * 0.24);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={open ? t("common.nav.close") : t("common.nav.open")}
        title={t(active.title)}
        className={`${isMap ? "absolute z-[400]" : "relative"} shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-colors ${className}`}
        style={{
          width: size,
          height: size,
          // At rest a quiet surface; open, the accent: the same states as
          // the marine-chart toggle on the map.
          background: open ? "var(--ow-accent-strong)" : "var(--ow-surface-pop)",
          color: open ? "var(--ow-on-accent)" : "var(--ow-fg-0)",
          border: open ? "1px solid transparent" : "1px solid var(--ow-line-2)",
          boxShadow: "var(--ow-shadow-2)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span style={{ width: glyph, height: glyph }}>{BurgerIcon}</span>
        {/* The badge says where the reader is without a word: the panel
            only spells it out once open. */}
        <span
          aria-hidden="true"
          className="absolute rounded-full flex items-center justify-center"
          style={{
            right: -1,
            bottom: -1,
            width: badge,
            height: badge,
            background: "var(--ow-accent-strong)",
            color: "var(--ow-on-accent)",
            border: "2px solid var(--ow-bg-1)",
          }}
        >
          <span style={{ width: badgeGlyph, height: badgeGlyph }}>{active.icon}</span>
        </span>
      </button>

      {open &&
        position &&
        createPortal(
          <>
            {/* On a phone the map dims under the panel; on a wide screen a
                tap anywhere else only closes the menu. Either way the
                header above the panel stays clear. */}
            <div
              aria-hidden="true"
              className="fixed inset-x-0 bottom-0 z-[999]"
              style={{
                top: isMap ? 0 : position.top - PANEL_GAP,
                background: isMap ? "transparent" : "var(--ow-scrim)",
              }}
              onClick={close}
            />
            <div
              ref={panelRef}
              className="fixed z-[1000] p-1.5 rounded-xl animate-fade-in"
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                background: "var(--ow-bg-1)",
                border: "1px solid var(--ow-line-2)",
                boxShadow: "var(--ow-shadow-pop)",
              }}
            >
              <nav aria-label={t("common.nav.label")}>
                <ul className="flex flex-col">
                  {DESTINATIONS.map((d) => {
                    const isCurrent = d.id === current;
                    return (
                      <li key={d.id}>
                        <a
                          href={d.href(mapQuery)}
                          aria-current={isCurrent ? "page" : undefined}
                          // Only the current page closes the menu by hand,
                          // and it is the one link the router will not act
                          // on. Closing on the others swallowed the
                          // navigation: `useBackDismiss` pops the layer
                          // entry on cleanup, the router then replaced the
                          // URL, and the pending `history.back()` landed on
                          // the page one had just left. Left to the router,
                          // the page change unmounts the menu and the
                          // cleanup finds its entry already gone.
                          onClick={(e) => {
                            if (!isCurrent) return;
                            e.preventDefault();
                            close();
                          }}
                          className={`flex items-center gap-[11px] rounded-lg transition-colors ${
                            isCurrent ? "bg-accent-soft" : "hover:bg-surface-2"
                          }`}
                          style={{ padding: "10px 11px" }}
                        >
                          <span
                            aria-hidden="true"
                            className="shrink-0 rounded-lg flex items-center justify-center"
                            style={{
                              width: 30,
                              height: 30,
                              background: isCurrent ? "var(--ow-accent-strong)" : "var(--ow-bg-3)",
                              color: isCurrent ? "var(--ow-on-accent)" : "var(--ow-fg-1)",
                            }}
                          >
                            <span style={{ width: d.tileGlyph ?? 15, height: d.tileGlyph ?? 15 }}>
                              {d.icon}
                            </span>
                          </span>
                          <span className="flex-1 min-w-0 flex flex-col">
                            <span
                              className="text-[13.5px] font-semibold leading-tight"
                              style={{ color: isCurrent ? "var(--ow-accent)" : "var(--ow-fg-0)" }}
                            >
                              {t(d.title)}
                            </span>
                            <span className="text-[11px] leading-tight mt-px" style={{ color: "var(--ow-fg-2)" }}>
                              {t(d.description)}
                            </span>
                          </span>
                          {isCurrent && (
                            <span
                              aria-hidden="true"
                              className="shrink-0"
                              style={{ width: 14, height: 14, color: "var(--ow-accent)" }}
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
