// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { showSettings } from "../settings/settingsStore";

/**
 * Opens the settings, always on their root view. The one way in, for every
 * control that offers them (the gear of the header, the drawer's entry, a
 * floating button), and callable outside React.
 *
 * Safe to call from a handler that closes another layer in the same breath
 * (the drawer closes, then the settings open): the history entry the
 * settings take waits for the drawer's own to be popped, see `BackStack.open`
 * in `hooks/useBackDismiss.ts`.
 */
export function openSettings(): void {
  showSettings();
}
