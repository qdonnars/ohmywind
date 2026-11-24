// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { goTo } from "../router";
import { rememberReturnPath } from "./returnPath";

/**
 * Where the « Réglages » entry of the navigation drawer leads. The one place
 * that decides it: today the /config page, remembering the page it was opened
 * from for its back link; once the settings open as a sheet over the page,
 * only this function changes.
 *
 * Called after the drawer has asked to close, from the same click: the
 * navigation replaces the drawer's history entry before its close is
 * committed, so the drawer finds nothing left to pop (see `goTo`).
 */
export function openSettings(): void {
  rememberReturnPath();
  goTo("/config");
}
