// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "../hooks/useBackDismiss";
import { useT } from "../i18n";
import { getLocation, subscribe as subscribeLocation } from "../navigation";
import { SettingsNavCtx, type SettingsNav } from "./nav";
import { SETTINGS_VIEWS, type SettingsViewId } from "./registry";
import { hideSettings, openerToRefocus, useSettingsOpen } from "./settingsStore";
import "./settings.css";
// The styles of the model and boat editors some views show, which were
// those of the /config page.

/**
 * The settings, mounted once for the whole app (`main.tsx`) and opened with
 * `openSettings()` (`config/openSettings.ts`).
 *
 * One component on every screen, only its container changes: a sheet from
 * the bottom on a phone, a centred window from `lg` up (`settings.css`).
 * Inside, a stack of views (`registry.ts`): the header offers « ‹ <parent> »
 * in a view opened over another, the view's title, and « OK », which closes.
 * Every view scrolls on its own and starts at the top each time it is shown.
 * Nothing to save: each control stores its value as it changes.
 */
export function SettingsSheet() {
  const open = useSettingsOpen();
  // Mounted only while open: every opening starts afresh on the root view.
  return open ? <SettingsDialog /> : null;
}

/**
 * The history entry the settings spend on the back button.
 *
 * One entry for the whole stack, not one per view: the « ‹ » of the header
 * and « OK » then never have to unwind several entries, whose `back()` calls
 * land late and could take a navigation started at the same moment with them.
 * A back press consumes the entry: at the root it closes the settings, deeper
 * it goes up one view and the settings take a fresh entry, by remounting this
 * component under a new key.
 *
 * Opened from a layer that closes in the same breath (the navigation drawer
 * closing on its « Réglages » entry): the drawer's entry is popped by an
 * asynchronous `history.back()`, and `BackStack.open` holds this entry back
 * until that pop has landed, so the pop cannot take it.
 */
function BackEntry({ onBack }: { onBack: () => void }) {
  useBackDismiss(true, onBack);
  return null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function SettingsDialog() {
  const { t } = useT();
  const [stack, setStack] = useState<SettingsViewId[]>(["root"]);
  const [entry, setEntry] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const close = useCallback(() => hideSettings(), []);
  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);
  const nav = useMemo<SettingsNav>(
    () => ({
      push: (id) => setStack((s) => [...s, id]),
      back: () => {
        // At the root there is nothing under: back means leaving.
        if (stack.length > 1) back();
        else close();
      },
      close,
    }),
    [stack.length, back, close],
  );

  const onBackButton = () => {
    if (stack.length > 1) {
      back();
      setEntry((n) => n + 1);
    } else {
      close();
    }
  };

  // Leaving the page (a link inside a view) closes the settings. On the path
  // change rather than on the click: the router replaces the settings' entry
  // with the new page and forgets it (`goTo`), so closing afterwards pops
  // nothing, where closing on the click would have popped the new page.
  const path = useSyncExternalStore(subscribeLocation, () => getLocation().path);
  const [openedOn] = useState(path);
  useEffect(() => {
    if (path !== openedOn) hideSettings();
  }, [path, openedOn]);

  // The rest of the app is inert while the settings are open: no focus, no
  // click, nothing read out behind them. Given back before the focus returns
  // to the control that opened them.
  useEffect(() => {
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    return () => {
      root?.removeAttribute("inert");
      openerToRefocus()?.focus();
    };
  }, []);

  // Each view, on opening, puts the focus on its title: a screen reader
  // announces where the reader now is, and Tab goes on from there.
  const top = stack[stack.length - 1];
  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [top, stack.length]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    // Focus trapped in the dialog: past the last control, back to the first.
    const panel = panelRef.current;
    if (!panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = items.includes(active as HTMLElement);
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const view = SETTINGS_VIEWS[top];
  const parent = stack.length > 1 ? SETTINGS_VIEWS[stack[stack.length - 2]] : null;
  const title = t(view.title);
  const titleId = "ow-settings-title";
  const View = view.Component;

  return createPortal(
    <div className="ow-settings-overlay ow-visible-viewport" onKeyDown={onKeyDown}>
      <BackEntry key={entry} onBack={onBackButton} />
      {/* A tap beside the sheet closes it. Not a control of its own: the
          keyboard has OK and Escape, a screen reader the OK button. */}
      <div className="ow-settings-scrim" aria-hidden="true" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Focusable itself, so a click on its text keeps the focus inside
        // the dialog (and Escape working) rather than dropping it on <body>.
        tabIndex={-1}
        className="ow-settings-panel outline-none"
      >
        <div className="ow-settings-handle" aria-hidden="true" />
        <div className="ow-settings-header">
          <div className="min-w-0">
            {parent && (
              <button type="button" className="ow-settings-headbtn" onClick={back}>
                <svg width="11" height="18" viewBox="0 0 11 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                  <path d="M9 2 2 9l7 7" />
                </svg>
                <span>{t(parent.title)}</span>
              </button>
            )}
          </div>
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className="ow-settings-title">
            {title}
          </h2>
          <div className="flex justify-end min-w-0">
            <button type="button" className="ow-settings-headbtn ow-settings-done" onClick={close}>
              <span>{t("settings.done")}</span>
            </button>
          </div>
        </div>
        <SettingsNavCtx.Provider value={nav}>
          {/* Keyed on the depth and the view: a view shown again is a new
              scroll area, at its top. */}
          <div
            key={`${stack.length}:${top}`}
            className="ow-settings-body relative overflow-y-auto overscroll-contain"
          >
            <View />
          </div>
        </SettingsNavCtx.Provider>
      </div>
    </div>,
    document.body,
  );
}
