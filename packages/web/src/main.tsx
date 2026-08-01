import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Routes } from "./Routes";
import { ThemeProvider } from "./design/theme";
import { registerSW } from "virtual:pwa-register";

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
// resilient. Silent by design: `registerType: 'autoUpdate'` swaps in the new
// SW on the next load, and we intentionally render no update-toast today.
registerSW({ immediate: true });
