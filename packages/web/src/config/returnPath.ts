// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Remember which page the user was on before opening /config so the back
// link can land them where they came from instead of always bouncing to "/".
// Stored in sessionStorage (not local) because the value is only meaningful
// within the current tab session — a fresh tab opened on /config has no
// meaningful "previous page".

import { SESSION_STORAGE_KEYS } from "../storage/keys";

const KEY = SESSION_STORAGE_KEYS.configReturnPath;

export function rememberReturnPath(): void {
  try {
    const here = window.location.pathname + window.location.search;
    // Never recurse into /config itself.
    if (here.startsWith("/config")) return;
    sessionStorage.setItem(KEY, here);
  } catch {
    // sessionStorage unavailable (Safari private mode etc.) — back link
    // gracefully falls back to "/".
  }
}

export function consumeReturnPath(): string {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v ?? "/";
  } catch {
    return "/";
  }
}
