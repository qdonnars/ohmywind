// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Remember which page the reader was on before opening /a-propos, so its
// back link lands them where they came from instead of always bouncing to
// "/". Stored in sessionStorage (not local) because the value is only
// meaningful within the current tab session: a fresh tab opened on
// /a-propos has no meaningful "previous page".
//
// The path is kept rather than consumed: the page is read again on the way
// back from its own sub-page (/a-propos/nouveautes). The next visit
// overwrites it.

import { SESSION_STORAGE_KEYS } from "../storage/keys";

const ABOUT_KEY = SESSION_STORAGE_KEYS.aboutReturnPath;

export function rememberAboutReturnPath(): void {
  try {
    const here = window.location.pathname + window.location.search;
    if (here.startsWith("/a-propos")) return;
    sessionStorage.setItem(ABOUT_KEY, here);
  } catch {
    // sessionStorage unavailable: the back link falls back to "/".
  }
}

export function aboutReturnPath(): string {
  try {
    return sessionStorage.getItem(ABOUT_KEY) ?? "/";
  } catch {
    return "/";
  }
}
