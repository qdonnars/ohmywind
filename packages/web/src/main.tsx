import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { PlanPage } from "./routes/PlanPage";
import { MethodologiePage } from "./routes/MethodologiePage";
import { ConfigPage } from "./routes/ConfigPage";
import { ThemeProvider } from "./design/theme";
import { registerSW } from "virtual:pwa-register";

// GitHub Pages 404.html redirect: restore original path stored in sessionStorage
const spaRedirect = sessionStorage.getItem("spa_redirect");
if (spaRedirect) {
  sessionStorage.removeItem("spa_redirect");
  window.history.replaceState(null, "", spaRedirect);
}

// Normalise trailing slashes: GitHub Pages adds them automatically when a
// matching directory exists under public/ (e.g. ``public/methodologie/`` for
// the coverage map asset), which turns ``/methodologie`` into ``/methodologie/``
// during the 404→SPA redirect dance. Strip the trailing slash so route
// matches stay simple.
const rawPath = window.location.pathname;
const path = rawPath.length > 1 && rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
const isPlan = path === "/plan";
const isMethodologie = path === "/methodologie";
const isConfig = path === "/config";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {isPlan ? (
        <PlanPage />
      ) : isMethodologie ? (
        <MethodologiePage />
      ) : isConfig ? (
        <ConfigPage />
      ) : (
        <App />
      )}
    </ThemeProvider>
  </StrictMode>
);

// Register the service worker so the app shell is installable and offline-
// resilient. Silent by design: `registerType: 'autoUpdate'` swaps in the new
// SW on the next load, and we intentionally render no update-toast today.
registerSW({ immediate: true });
