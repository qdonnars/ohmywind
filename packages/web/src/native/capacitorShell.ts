// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, SystemBars, registerPlugin } from "@capacitor/core";
import { forgetResume, isOnResumedPlan, markRestoredLaunch } from "../offline/lastView";
import { goTo } from "../router";
import { inAppPath } from "./appLinks";
import { backButtonAction } from "./backButton";
import { openExternalLinksInApp } from "./externalLinks";
import {
  BACKUP_PREFERENCE_KEY,
  createBackupWriter,
  restoreIfWiped,
  watchStorageWrites,
  type BackupDeps,
} from "./nativeBackup";
import { readPreference, writePreference } from "./plugins";
import { recordShellLaunch } from "./reviewPrompt";
import { systemBarsStyleFor } from "./systemBars";
import {
  generateNonce,
  restartShellImport as restartWith,
  startShellImport,
  type InstallInfo,
  type ShellDeps,
} from "./shellImport";

/**
 * The Capacitor side of the native shell, loaded only inside it (see
 * `native/index.ts`): the PWA never downloads a byte of this.
 */

/** Provided by the Android shell itself, not by an npm package. iOS has none. */
const ShellInfo = registerPlugin<{ getInstallInfo(): Promise<InstallInfo> }>("ShellInfo");

function capacitorDeps(): ShellDeps {
  return {
    platform: Capacitor.getPlatform(),
    storage: window.localStorage,
    origin: window.location.origin,
    getInstallInfo: () => ShellInfo.getInstallInfo(),
    openBrowser: (url) => Browser.open({ url }),
    getLaunchUrl: async () => (await App.getLaunchUrl())?.url,
    onAppUrlOpen: (listener) => {
      void App.addListener("appUrlOpen", (event) => listener(event.url)).catch(() => undefined);
    },
    reload: () => window.location.reload(),
    randomNonce: generateNonce,
    now: () => Date.now(),
  };
}

/**
 * Open the pages the system hands to the shell (launcher shortcuts, links to
 * the site). On a cold start the shell holds the URL back until this
 * listener exists, so the same path serves both a running and a starting app.
 */
function followAppLinks(): void {
  void App.addListener("appUrlOpen", (event) => {
    const path = inAppPath(event.url, window.location.origin);
    // Replaced, not stacked: the reader did not come from the page that
    // happened to be open, so back should leave the app. An entry pushed
    // here, without a tap, would be skipped by the system back anyway.
    if (path) {
      forgetResume();
      goTo(path, { replace: true });
    }
  }).catch(() => undefined);
}

/**
 * The system back button or gesture. Without a listener the shell goes back
 * while there is history and then swallows the press: at the first page the
 * app could not be left with back at all. With one, the decision is ours:
 * back through the history, then out of the app, kept in memory the way
 * Android does for a launcher app since version 12. See `backButton.ts` for
 * the plan resumed at launch.
 */
function handleBackButton(): void {
  void App.addListener("backButton", ({ canGoBack }) => {
    const action = backButtonAction({
      canGoBack,
      onResumedPlan: isOnResumedPlan(),
      historyLength: window.history.length,
    });
    if (action === "back") window.history.back();
    else void App.minimizeApp().catch(() => undefined);
  }).catch(() => undefined);
}

/**
 * Keep the status bar icons readable. The shell styles them after the
 * system's light or dark mode, but the page follows the theme picked in the
 * settings: with the two apart, the icons were white on white or dark on
 * dark. The theme is the `data-theme` attribute stamped on <html>.
 */
function followTheme(): void {
  const root = document.documentElement;
  const apply = () => {
    const style = systemBarsStyleFor(root.getAttribute("data-theme"));
    void SystemBars.setStyle({ style }).catch(() => undefined);
  };
  apply();
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}

/**
 * The copy of the reader's data in the native storage (see nativeBackup.ts).
 * Resolves to true when the page is about to reload with restored data: the
 * shell then starts nothing else, the reloaded page will.
 */
async function keepNativeBackup(): Promise<boolean> {
  const storage = window.localStorage;
  const deps: BackupDeps = {
    storage,
    readCopy: () => readPreference(BACKUP_PREFERENCE_KEY),
    writeCopy: (value) => writePreference(BACKUP_PREFERENCE_KEY, value),
    // The reloaded page resumes the plan the reader left, as a launch would.
    reload: () => {
      markRestoredLaunch();
      window.location.reload();
    },
  };
  const writer = createBackupWriter(deps);
  // Watching from the start, writing only once the restore has decided.
  watchStorageWrites(storage, (key) => writer.changed(key));
  const outcome = await restoreIfWiped(deps).catch(() => "unavailable" as const);
  if (outcome === "restored") return true;
  if (outcome === "unavailable") return false;
  writer.start();
  void writer.flush();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void writer.flush();
  });
  void App.addListener("pause", () => void writer.flush()).catch(() => undefined);
  return false;
}

export async function runNativeShell(): Promise<void> {
  // First: a page about to reload must not consume the URL the app was
  // opened with, nor open Chrome for the import.
  const reloading = await keepNativeBackup().catch(() => false);
  if (reloading) return;
  followAppLinks();
  handleBackButton();
  followTheme();
  openExternalLinksInApp(window, (url) => Browser.open({ url }));
  try {
    recordShellLaunch(window.localStorage, Date.now());
  } catch {
    /* storage blocked: no first launch, so never a rating request */
  }
  return startShellImport(capacitorDeps());
}

/**
 * Bring the data left in Chrome across again, for a manual entry in the
 * settings once there is one.
 * @public
 */
export function restartShellImport(): Promise<void> {
  return restartWith(capacitorDeps());
}
