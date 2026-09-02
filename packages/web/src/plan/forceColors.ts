// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * One colour per force on the leg diagram and in the numbers beside it, so
 * the eye links "+1,5 courant" to the flow arrows of the same hue.
 *
 *   wind    = foreground (double-shaft arrow)
 *   waves   = amber (wavy line)
 *   current = green when it carries the boat, orange against, blue across
 */
export const FORCE_COLORS = {
  wind: "var(--ow-fg-0)",
  waves: "var(--ow-warn)",
  currentPortant: "var(--ow-ok)",
  // Distinct from the waves' amber.
  currentContraire: "#fb923c",
  // blue-500: clearly visible in both themes (grey washed out in light).
  currentTravers: "#3b82f6",
} as const;

export type CurrentRelative = "portant" | "contraire" | "travers" | null;

export function currentColorFor(relative: CurrentRelative): string {
  if (relative === "portant") return FORCE_COLORS.currentPortant;
  if (relative === "contraire") return FORCE_COLORS.currentContraire;
  return FORCE_COLORS.currentTravers;
}
