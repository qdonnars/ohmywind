// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { backStack, useBackDismiss } from "../hooks/useBackDismiss";
import { useT } from "../i18n";
import { getLocation, subscribe } from "../navigation";
import { hasPlanDraft } from "../plan/draft";
import { matchRoute } from "../routeTable";
import { currentMobilePlatform, inInstalledApp } from "./platform";
import {
  INVITE_FIRST_DELAY_MS,
  inviteStoreUrl,
  isQuietMoment,
  readAnsweredAt,
  saveAnsweredAt,
} from "./invite";
import { STORE_URLS, type MobilePlatform } from "./stores";

/** How often a quiet moment is looked for, once the first delay is over. */
const POLL_MS = 1_000;

interface Offer {
  platform: MobilePlatform;
  url: string;
}

/** Decided once, at load: none of it changes while the page is open. */
function initialOffer(): Offer | null {
  const platform = currentMobilePlatform();
  const url = inviteStoreUrl({
    platform,
    installed: inInstalledApp(),
    storeUrls: STORE_URLS,
    answeredAt: readAnsweredAt(),
    now: Date.now(),
  });
  return platform && url ? { platform, url } : null;
}

function isTextField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "submit"].includes(el.type);
}

/**
 * The invitation to install the app, as a sheet at the bottom of the screen.
 * Site on a phone only: inside the apps it never renders (see `invite.ts`
 * for who sees it and when).
 *
 * Not modal: the page behind stays usable, and the sheet only waits for a
 * quiet moment to appear. Back, Escape and « Plus tard » close it for
 * `INVITE_SNOOZE_DAYS`; so does the store button, which opens the store in a
 * new tab so this one's history is left alone.
 */
export function InstallInvite() {
  const { t } = useT();
  const { path } = useSyncExternalStore(subscribe, getLocation);
  const [offer] = useState(initialOffer);
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  // The page the app opens in Chrome to hand its data over: a step of the
  // app's own setup, where an invitation to install it makes no sense.
  const excluded = matchRoute(path) === "transfer";

  const answer = useCallback(() => {
    saveAnsweredAt(Date.now());
    setAnswered(true);
    setOpen(false);
  }, []);

  useBackDismiss(open, answer);

  // Watch for a quiet moment. The input times are kept from load on, so the
  // first check already knows whether the reader is mid-gesture.
  useEffect(() => {
    if (!offer || answered || open || excluded) return;
    const loadedAt = Date.now();
    let lastInput = loadedAt;
    const onInput = () => {
      lastInput = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onInput, { capture: true, passive: true });
    const check = () => {
      const now = Date.now();
      const moment = {
        sinceLoadMs: now - loadedAt,
        sinceInputMs: now - lastInput,
        layersOpen: backStack.depth,
        drafting: hasPlanDraft(),
        otherDialog: document.querySelector('[role="dialog"], [role="alertdialog"]') !== null,
        typing: isTextField(document.activeElement),
        visible: document.visibilityState === "visible",
      };
      if (isQuietMoment(moment)) setOpen(true);
    };
    let poll: number | undefined;
    const start = window.setTimeout(() => {
      check();
      poll = window.setInterval(check, POLL_MS);
    }, INVITE_FIRST_DELAY_MS);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(poll);
      for (const e of events) window.removeEventListener(e, onInput, { capture: true });
    };
  }, [offer, answered, open, excluded]);

  // Focus moves to the sheet, so a screen reader announces it and the
  // keyboard reaches its buttons; it goes back where it was on close.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnFocus.current?.focus?.();
    };
  }, [open, answer]);

  if (!offer || !open || excluded) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1100] flex justify-center pointer-events-none"
      style={{
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-install-invite=""
        className="pointer-events-auto w-full max-w-[480px] rounded-t-2xl px-4 pt-4 animate-fade-in outline-none"
        style={{
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          background: "var(--ow-bg-1)",
          color: "var(--ow-fg-0)",
          border: "1px solid var(--ow-line-2)",
          borderBottom: "none",
          boxShadow: "var(--ow-shadow-pop)",
        }}
      >
        <div className="flex items-start gap-3">
          <img
            src="/icon-192.png"
            alt=""
            width={48}
            height={48}
            className="shrink-0 rounded-xl"
            style={{ border: "1px solid var(--ow-line)" }}
          />
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-bold tracking-tight leading-snug">
              {t("common.install.title")}
            </h2>
            <p id={bodyId} className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
              {t("common.install.body")}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={answer}
            className="min-h-[44px] px-4 rounded-lg text-[13px] font-semibold transition-colors"
            style={{ color: "var(--ow-fg-1)", background: "var(--ow-bg-2)" }}
          >
            {t("common.install.later")}
          </button>
          {/* A new tab: closing the sheet pops its history entry, and in this
              tab that pop would race the navigation to the store. */}
          <a
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={answer}
            className="min-h-[44px] px-4 rounded-lg text-[13px] font-semibold inline-flex items-center transition-all active:scale-[0.98]"
            style={{ color: "var(--ow-on-accent)", background: "var(--ow-accent-strong)" }}
          >
            {t(offer.platform === "ios" ? "common.install.open.ios" : "common.install.open.android")}
          </a>
        </div>
      </section>
    </div>
  );
}
