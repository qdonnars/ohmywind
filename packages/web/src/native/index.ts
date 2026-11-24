// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Entry point of everything specific to the native shell, kept to a test on
 * a global so the PWA pays nothing for it.
 *
 * The shell injects `window.Capacitor` before the page's scripts run. Asking
 * it directly, rather than through `@capacitor/core`, keeps Capacitor out of
 * the main chunk: the plugins are fetched only once we know they will answer.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export function isNativeShell(): boolean {
  try {
    const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

type NativePlugins = typeof import("./plugins");

/**
 * The native plugins, or null outside the shell. The module is fetched at
 * the first call and kept by the module loader afterwards. A failed fetch
 * (offline before it was ever cached) resolves to null: every caller treats
 * the plugin as a bonus and has a way to do without it.
 */
export function loadPlugins(): Promise<NativePlugins | null> {
  if (!isNativeShell()) return Promise.resolve(null);
  return import("./plugins").catch(() => null);
}

export function startNativeShell(): void {
  if (!isNativeShell()) return;
  // A failure here (chunk missing offline, a plugin rejecting) must never
  // reach the app: the bridge is a convenience, the app works without it.
  import("./capacitorShell")
    .then((m) => m.runNativeShell())
    .catch(() => undefined);
}
