// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { openSettings } from "../config/openSettings";
import { rememberAboutReturnPath } from "../config/returnPath";
import { useWhatsNewDot } from "../config/whatsNewSeen";
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
// the menu existed (public/compass.png), redrawn as strokes: the image has
// wide margins of its own and vanished once shrunk into the badge. The view
// box is cropped to the drawing so it fills whatever box it is given.
const CompassIcon = (
  <svg viewBox="3 1.6 18 19.4" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="4.6" r="1.9" />
    <path d="M11 6.4 6.3 19.6M13 6.4l4.7 13.2M5 16.5h3.4M15.6 16.5H19" />
  </svg>
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

const CloseIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
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

/** What the drawer can move focus between: its links and its buttons. */
const FOCUSABLE = "a[href], button:not([disabled])";

interface NavMenuProps {
  current: NavDestination;
  /** Camera hand-over for the map pages, "" when there is none to carry. */
  mapQuery?: string;
  /**
   * "map": the round control floating over the map, top left, on a wide
   * screen, with the current destination as a badge. "floating": the glass
   * one at the left end of the bar over the map on a phone, as tall as the
   * bar, without the badge. "header": the compact one that takes the logo's
   * place in a page header on a phone (the comparison). Same gesture, same
   * drawer, one of them mounted at a time.
   */
  variant: "map" | "floating" | "header";
  className?: string;
  /** The trigger, for the onboarding card that points at it. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * The app's navigation: one control at rest, the burger with the current
 * destination as a badge, and on opening a drawer from the left edge with
 * the three destinations, then the pages around them (what's new, settings,
 * methodology, about).
 *
 * The drawer is portaled to `<body>`: the header and the bar over the map
 * blur their backdrop, which makes them both a stacking context and the
 * containing block of any fixed descendant, so a drawer rendered in place
 * would be clipped to them.
 */
export function NavMenu({ current, mapQuery = "", variant, className = "", triggerRef }: NavMenuProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  // A release this browser has not read about yet. The trigger carries the
  // dot the « i » of the header used to: the drawer is now the way to the
  // release log, on every page.
  const whatsNewDot = useWhatsNewDot();
  const ownRef = useRef<HTMLButtonElement>(null);
  const buttonRef = triggerRef ?? ownRef;

  const close = useCallback(() => setOpen(false), []);
  // The back button (the browser's, or the phone's in the app) closes the
  // drawer instead of leaving the page, the same as Escape (issue #300).
  useBackDismiss(open, close);

  // Closing on the page (the cross, the scrim, Escape, the back button)
  // hands focus back to the control that opened it. Leaving the page
  // unmounts the whole menu, and there is nothing to hand back.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) buttonRef.current?.focus();
    wasOpen.current = open;
  }, [open, buttonRef]);

  const active = DESTINATIONS.find((d) => d.id === current) ?? DESTINATIONS[0];
  const isMap = variant === "map";
  const isFloating = variant === "floating";
  // The design's proportions: 52 px on the map, 48 in the bar of a phone,
  // 44 in a header, the glyph at 0.42 of that, the badge at 0.44 with its
  // own glyph at 0.3.
  const size = isMap ? 52 : isFloating ? 48 : 44;
  const glyph = Math.round(size * 0.42);
  const badge = Math.round(size * 0.44);
  const badgeGlyph = Math.round(size * 0.3);
  const label = whatsNewDot ? `${t("common.nav.open")}, ${t("common.nav.whatsNew.unseen")}` : t("common.nav.open");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={t(active.title)}
        className={`${isMap ? "absolute z-[400]" : "relative"} ${
          isFloating ? "ow-chrome-glass pointer-events-auto" : ""
        } shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-colors ${className}`}
        style={
          isFloating
            ? { width: size, height: size, color: "var(--ow-fg-0)" }
            : {
                width: size,
                height: size,
                background: "var(--ow-surface-pop)",
                color: "var(--ow-fg-0)",
                border: "1px solid var(--ow-line-2)",
                boxShadow: "var(--ow-shadow-2)",
                backdropFilter: "blur(8px)",
              }
        }
      >
        <span style={{ width: glyph, height: glyph }}>{BurgerIcon}</span>
        {/* The badge says where the reader is without a word: the drawer
            only spells it out once open. Not in the bar of a phone, where
            the button is one of a row and the page is the whole screen. */}
        {!isFloating && (
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
        )}
        {whatsNewDot && (
          <span
            aria-hidden="true"
            data-testid="whats-new-dot"
            className="absolute rounded-full"
            style={{
              top: isFloating ? 9 : 4,
              right: isFloating ? 9 : 4,
              width: 10,
              height: 10,
              background: "var(--ow-accent)",
              border: "2px solid var(--ow-bg-1)",
            }}
          />
        )}
      </button>

      {open && createPortal(<NavDrawer current={current} mapQuery={mapQuery} onClose={close} />, document.body)}
    </>
  );
}

interface NavDrawerProps {
  current: NavDestination;
  mapQuery: string;
  onClose: () => void;
}

/**
 * The drawer itself: a modal dialog along the left edge, over a scrim.
 *
 * Its links never close it by hand, save the one to the page it was opened
 * on. Closing on the others swallowed the navigation: `useBackDismiss` pops
 * the drawer's history entry on cleanup, the router then replaced the URL,
 * and the pending `history.back()` landed on the page one had just left.
 * Left to the router, the page change unmounts the drawer and the cleanup
 * finds its entry already gone.
 */
function NavDrawer({ current, mapQuery, onClose }: NavDrawerProps) {
  const { t } = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  // A release this browser has not read about yet: the dot of the trigger,
  // on the entry that opens the release log.
  const whatsNewDot = useWhatsNewDot();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Keyboard readers land on the current page's entry, the one they are
    // most likely to want to move away from.
    panelRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus stays inside the drawer while it is open: Tab past the last entry
  // comes back to the first, Shift+Tab before the first goes to the last.
  const trapFocus = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    if (e.shiftKey && (here === first || !panelRef.current.contains(here))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (here === last || !panelRef.current.contains(here))) {
      e.preventDefault();
      first.focus();
    }
  };

  const rowClass = "flex items-center gap-3 w-full rounded-xl text-left transition-colors hover:bg-surface-2 cursor-pointer";
  const rowStyle = { minHeight: 52, padding: "0 10px", fontSize: 15.5, color: "var(--ow-fg-0)" } as const;

  return (
    <div className="fixed inset-0 z-[1000]">
      {/* The page dims under the drawer; a tap on it closes the drawer. The
          cross is the way for the keyboard and for assistive technology. */}
      <div
        aria-hidden="true"
        data-testid="nav-scrim"
        className="absolute inset-0 ow-drawer-scrim"
        style={{ background: "var(--ow-scrim)" }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("common.nav.label")}
        onKeyDown={trapFocus}
        className="ow-nav-drawer absolute inset-y-0 left-0 flex flex-col overflow-y-auto overscroll-contain"
        style={{
          background: "var(--ow-bg-1)",
          borderRight: "1px solid var(--ow-line)",
          boxShadow: "var(--ow-shadow-pop)",
        }}
      >
        <div className="flex items-center gap-2.5" style={{ padding: "0 0 16px 8px" }}>
          <span
            aria-hidden="true"
            className="shrink-0 rounded-lg flex items-center justify-center"
            style={{ width: 32, height: 32, background: "var(--ow-bg-0)", color: "var(--ow-accent)" }}
          >
            <span style={{ width: 20, height: 20 }}>{WindIcon}</span>
          </span>
          <span className="text-[19px] font-extrabold tracking-tight">
            <span style={{ color: "var(--ow-fg-0)" }}>OhMy</span>
            <span style={{ color: "var(--ow-accent)" }}>Wind</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.nav.close")}
            className="ml-auto shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-surface-2"
            style={{ width: 44, height: 44, color: "var(--ow-fg-1)" }}
          >
            {CloseIcon}
          </button>
        </div>

        <nav aria-label={t("common.nav.label")} className="flex flex-col">
          <ul className="flex flex-col gap-1">
            {DESTINATIONS.map((d) => {
              const isCurrent = d.id === current;
              return (
                <li key={d.id}>
                  <a
                    href={d.href(mapQuery)}
                    aria-current={isCurrent ? "page" : undefined}
                    // Only the current page closes the drawer by hand: it is
                    // the one link the router will not act on (see above).
                    onClick={(e) => {
                      if (!isCurrent) return;
                      e.preventDefault();
                      onClose();
                    }}
                    className={`flex items-center gap-3 rounded-xl transition-colors ${
                      isCurrent ? "bg-accent-soft" : "hover:bg-surface-2"
                    }`}
                    style={{ minHeight: 56, padding: "8px 10px" }}
                  >
                    <span
                      aria-hidden="true"
                      className="shrink-0 rounded-[10px] flex items-center justify-center"
                      style={{
                        width: 36,
                        height: 36,
                        background: isCurrent ? "var(--ow-accent-strong)" : "var(--ow-bg-3)",
                        color: isCurrent ? "var(--ow-on-accent)" : "var(--ow-fg-1)",
                      }}
                    >
                      <span style={{ width: 19, height: 19 }}>{d.icon}</span>
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span
                        className="text-base font-semibold leading-tight"
                        style={{ color: isCurrent ? "var(--ow-accent)" : "var(--ow-fg-0)" }}
                      >
                        {t(d.title)}
                      </span>
                      <span className="text-[12.5px] leading-snug mt-0.5" style={{ color: "var(--ow-fg-1)" }}>
                        {t(d.description)}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>

          <div aria-hidden="true" style={{ height: 1, background: "var(--ow-line)", margin: "10px 8px" }} />

          <ul className="flex flex-col">
            <li>
              {/* The release log comes back to /a-propos, which comes back
                  here: the page to return to is remembered the same way as
                  from the « À propos » entry below. */}
              <a
                href="/a-propos/nouveautes"
                onClick={rememberAboutReturnPath}
                className={rowClass}
                style={rowStyle}
              >
                <span className="flex-1 min-w-0">{t("common.nav.whatsNew.title")}</span>
                {whatsNewDot && (
                  <>
                    <span
                      aria-hidden="true"
                      data-testid="whats-new-dot"
                      className="shrink-0 rounded-full"
                      style={{ width: 8, height: 8, background: "var(--ow-accent)" }}
                    />
                    <span className="sr-only">{t("common.nav.whatsNew.unseen")}</span>
                  </>
                )}
              </a>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openSettings();
                }}
                className={rowClass}
                style={rowStyle}
              >
                {t("common.nav.settings")}
              </button>
            </li>
            <li>
              <a href="/methodologie" className={rowClass} style={rowStyle}>
                {t("config.docs.methodology")}
              </a>
            </li>
            <li>
              <a href="/a-propos" onClick={rememberAboutReturnPath} className={rowClass} style={rowStyle}>
                {t("explore.infoButton.title")}
              </a>
            </li>
          </ul>
        </nav>

        <p className="mt-auto text-xs leading-normal" style={{ padding: "16px 10px 0", color: "var(--ow-fg-1)" }}>
          {t("common.nav.sourcesNote")}
        </p>
      </div>
    </div>
  );
}
