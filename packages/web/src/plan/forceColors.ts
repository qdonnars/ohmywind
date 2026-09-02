// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * One colour per force on the leg diagram and in the numbers beside it, so
 * the eye links "−1,4 courant" to the flow arrows of the same hue.
 *
 *   wind    = foreground (double-shaft arrow)
 *   waves   = amber (wavy line)
 *   current = blue (flow field)
 *
 * The current used to change colour with its sense (green along, orange
 * against, blue across). Walking through the steps of a leg, the same force
 * then switched hue from one step to the next, and the reader had to relearn
 * the legend each time. The sign of its contribution is already explicit in
 * the build-up, so the colour now only says "this is the current".
 */
export const FORCE_COLORS = {
  wind: "var(--ow-fg-0)",
  waves: "var(--ow-warn)",
  // blue-500: clearly visible in both themes, distinct from the teal accent.
  current: "#3b82f6",
} as const;
