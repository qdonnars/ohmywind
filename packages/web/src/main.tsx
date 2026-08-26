// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Routes } from "./Routes";
import { ThemeProvider } from "./design/theme";
import { registerServiceWorker } from "./sw";

// GitHub Pages 404.html redirect: restore original path stored in sessionStorage
const spaRedirect = sessionStorage.getItem("spa_redirect");
if (spaRedirect) {
  sessionStorage.removeItem("spa_redirect");
  window.history.replaceState(null, "", spaRedirect);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <Routes />
    </ThemeProvider>
  </StrictMode>
);

// Register the service worker so the app shell is installable and offline-
// resilient. Silent by design: `registerType: 'autoUpdate'` plus `skipWaiting`
// swap in the new SW as soon as it is found, and we intentionally render no
// update-toast today.
registerServiceWorker();
