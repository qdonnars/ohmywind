// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

export interface BackButtonInput {
  /** What the shell reports: a history entry the system back would reach. */
  canGoBack: boolean;
  /** The plan the launch resumed is still on screen (`offline/lastView.ts`). */
  onResumedPlan: boolean;
  historyLength: number;
}

/**
 * What the system back does in the Android shell. Pure.
 *
 * Back through the history while there is some, then out of the app. One
 * exception: on the plan the app reopened at launch, the explorer is under
 * it, but Chromium skips that entry because the plan was pushed without a
 * tap, and the shell reports none. A page-side `history.back()` is not
 * subject to that rule and reaches it; from the explorer, the next back
 * finds no history and leaves the app.
 */
export function backButtonAction(input: BackButtonInput): "back" | "minimize" {
  if (input.canGoBack) return "back";
  if (input.onResumedPlan && input.historyLength > 1) return "back";
  return "minimize";
}
