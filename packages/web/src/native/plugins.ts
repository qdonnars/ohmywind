// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { App } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { InAppReview } from "@capacitor-community/in-app-review";
import { KeepAwake } from "@capacitor-community/keep-awake";

/**
 * The native plugins the site calls outside of `capacitorShell.ts`, behind
 * plain functions. Imported only with `import()` and only once
 * `isNativeShell()` said yes (see `loadPlugins` in `native/index.ts`): the
 * PWA never downloads this module, and the modules that choose between a
 * plugin and a web API stay free of Capacitor, so they run and test anywhere.
 */

/** One light tap, the same one everywhere it is used. */
export function impactLight(): Promise<void> {
  return Haptics.impact({ style: ImpactStyle.Light });
}

export function keepScreenOn(): Promise<void> {
  return KeepAwake.keepAwake();
}

export function allowScreenOff(): Promise<void> {
  return KeepAwake.allowSleep();
}

/** The store decides whether a sheet shows; nothing says if it did. */
export function requestStoreReview(): Promise<void> {
  return InAppReview.requestReview();
}

/** Version of the installed app (the shell), not of the site. */
export async function shellVersion(): Promise<string> {
  return (await App.getInfo()).version;
}
