// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { isNativeShell, loadPlugins } from "./index";

/**
 * A short tap felt in the hand when a waypoint lands on the plan map.
 *
 * In the app, the system's own light impact (Taptic Engine on iPhone, the
 * haptic motor on Android), through the Haptics plugin. In a browser, a
 * brief `navigator.vibrate` where it exists (Chrome on Android); Safari has
 * none, and then nothing happens. Never more than one kind of tap: the
 * feedback says "placed", not how.
 */

/** Long enough to be felt, short enough to read as a tick, not a buzz. */
const WEB_VIBRATION_MS = 12;

export interface HapticsEnv {
  inShell: boolean;
  nativeImpact(): Promise<void>;
  /** `navigator.vibrate`, bound, or undefined where the browser has none. */
  vibrate: ((ms: number) => boolean) | undefined;
}

function browserEnv(): HapticsEnv {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    inShell: isNativeShell(),
    nativeImpact: async () => {
      const plugins = await loadPlugins();
      await plugins?.impactLight();
    },
    vibrate: typeof nav?.vibrate === "function" ? (ms) => nav.vibrate(ms) : undefined,
  };
}

/** Fire and forget: a tap that fails must never reach the map. */
export function waypointPlacedFeedback(env: HapticsEnv = browserEnv()): void {
  if (env.inShell) {
    env.nativeImpact().catch(() => undefined);
    return;
  }
  try {
    env.vibrate?.(WEB_VIBRATION_MS);
  } catch {
    /* blocked by a permissions policy: no tap, nothing else changes */
  }
}
