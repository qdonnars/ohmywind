// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useSyncExternalStore } from "react";

/**
 * Whether the settings are open, outside React.
 *
 * The settings are mounted once for the whole app (`main.tsx`) and opened
 * from wherever a control offers them: the gear of the header today, the
 * navigation drawer and a floating button later. A module store rather than
 * a context, so a caller needs neither a provider above it nor a hook: the
 * public entry point is `openSettings()` in `config/openSettings.ts`.
 */

let open = false;
/** The control that had the focus when the settings opened, given back the
    focus when they close (WAI-ARIA dialog pattern). */
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function showSettings(): void {
  if (open) return;
  const active = typeof document === "undefined" ? null : document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body ? active : null;
  open = true;
  notify();
}

export function hideSettings(): void {
  if (!open) return;
  open = false;
  notify();
}

/** The control to give the focus back to on closing. Null when there is
    none left to give it to (the drawer entry that opened them has unmounted
    with the drawer). */
export function openerToRefocus(): HTMLElement | null {
  return opener && opener.isConnected ? opener : null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => open;

export function useSettingsOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** `subscribe` for a store that has to hear the settings open and close
    (see `useAppliedModelOrder`). */
export const subscribeSettings = subscribe;
export const isSettingsOpen = getSnapshot;
