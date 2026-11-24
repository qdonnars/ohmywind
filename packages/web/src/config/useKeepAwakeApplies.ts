// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { usePointerWording } from "../hooks/usePointerWording";

/**
 * Whether keeping the screen on means anything on this device.
 *
 * It serves a phone or a tablet at the chart table or in the cockpit, whose
 * screen dims after a few seconds while the plan is being read. A computer
 * sleeps on its own, much longer schedule and is not what a reader glances
 * at under way: there the screen is left alone and the setting is not shown.
 * Same test as the wording of the map hints: the primary pointer, a finger
 * or a mouse.
 */
export function useKeepAwakeApplies(): boolean {
  return usePointerWording() === "touch";
}
