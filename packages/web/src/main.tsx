// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Routes } from "./Routes";
import { ThemeProvider } from "./design/theme";
import { applyInitialTheme } from "./design/initialTheme";
import { registerServiceWorker } from "./sw";
import { initI18n } from "./i18n";
import { startNativeShell } from "./native";
import { startLastViewTracking } from "./offline/lastView";
import { InstallInvite } from "./install/InstallInvite";
import { SettingsSheet } from "./settings/SettingsSheet";
import { startVisibleViewport } from "./viewport/visibleViewport";
import { startViewportDiagnostic } from "./viewport/viewportDiagnostic";

// Before the first render, so the tokens the maps read from the DOM are
// already those of the reader's theme. See applyInitialTheme.
applyInitialTheme();

// The part of the screen the on-screen keyboard leaves visible, for the
// dialogs and lists that must stay above it. See viewport/visibleViewport.
startVisibleViewport();
startViewportDiagnostic();

// An app launch on bare `/` goes back to the plan it was closed on, before
// anything renders, so the explorer never flashes first. See offline/lastView.
startLastViewTracking();

// The dictionary of a non-French reader is its own chunk, resolved before the
// first render so no screen paints in one language and repaints in another.
// French is bundled as the fallback and costs no round-trip; a failed load
// (offline, chunk not cached yet) still renders, in French.
initI18n()
  .catch(() => undefined)
  .then(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <ThemeProvider>
          <Routes />
          {/* Outside the routes, so a change of page does not restart its
              clock. Renders nothing in the apps and on a computer. */}
          <InstallInvite />
          {/* Mounted once, over every page, and opened from anywhere with
              openSettings() (config/openSettings.ts). Outside the routes so
              they survive a change of page; they close on one. */}
          <SettingsSheet />
        </ThemeProvider>
      </StrictMode>
    );
  });

// Register the service worker so the app shell is installable and offline-
// resilient. Still silent, still no update-toast: src/sw.ts takes the new
// worker as soon as it is found, but holds it back while a route is being
// drawn so a deploy cannot reload the page under the reader.
registerServiceWorker();

// Inside the Android or iOS app only: a no-op in the browser, and the
// Capacitor code is a separate chunk the PWA never loads.
startNativeShell();
