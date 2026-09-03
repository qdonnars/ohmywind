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

// Before the first render, so the tokens the maps read from the DOM are
// already those of the reader's theme. See applyInitialTheme.
applyInitialTheme();

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
        </ThemeProvider>
      </StrictMode>
    );
  });

// Register the service worker so the app shell is installable and offline-
// resilient. Still silent, still no update-toast: src/sw.ts takes the new
// worker as soon as it is found, but holds it back while a route is being
// drawn so a deploy cannot reload the page under the reader.
registerServiceWorker();
