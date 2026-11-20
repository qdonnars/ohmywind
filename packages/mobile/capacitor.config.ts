// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { CapacitorConfig } from "@capacitor/cli";

// One variable picks everything that differs between builds. `cap sync` writes
// the result into android/app/src/main/assets/capacitor.config.json, and the
// Gradle build reads appId and appName back from that file: the synced config
// is the single source of truth, so an APK can never carry the prod
// applicationId with the dev URL (or the reverse).
type Variant = "prod" | "dev" | "local";

interface VariantSettings {
  appId: string;
  appName: string;
  serverUrl: string;
  cleartext: boolean;
}

const VARIANTS: Record<Variant, VariantSettings> = {
  prod: {
    appId: "fr.ohmywind.app",
    appName: "OhMyWind",
    serverUrl: "https://ohmywind.fr",
    cleartext: false,
  },
  dev: {
    appId: "fr.ohmywind.app.dev",
    appName: "OhMyWind Dev",
    serverUrl: "https://dev.ohmywind.fr",
    cleartext: false,
  },
  // An unreleased web build served by `vite preview` on the workstation and
  // reached from the emulator through `adb reverse tcp:4173 tcp:4173`. Same
  // applicationId as dev on purpose: it replaces the dev app rather than
  // adding a third launcher icon.
  local: {
    appId: "fr.ohmywind.app.dev",
    appName: "OhMyWind Local",
    serverUrl: "http://localhost:4173",
    cleartext: true,
  },
};

function readVariant(): Variant {
  const raw = (process.env.OHMYWIND_VARIANT ?? "dev").trim().toLowerCase();
  if (raw === "prod" || raw === "dev" || raw === "local") return raw;
  // Fail loudly: a typo silently falling back to dev would ship the wrong app.
  throw new Error(`OHMYWIND_VARIANT must be prod, dev or local (got "${raw}")`);
}

const variant = readVariant();
const settings = VARIANTS[variant];

const config: CapacitorConfig = {
  appId: settings.appId,
  appName: settings.appName,
  // Only the offline fallback page lives here: the app itself is the live site.
  webDir: "www",
  backgroundColor: "#030712",
  server: {
    url: settings.serverUrl,
    // Capacitor turns this into android:usesCleartextTraffic="true" at sync
    // time. Never true outside the local variant.
    cleartext: settings.cleartext,
    // Loaded when the main frame fails (network error or HTTP error status).
    // On Android the page is served from the APK at https://localhost/ and has
    // no Capacitor bridge, so the URL to retry travels in the query string.
    // Capacitor serves the page only when the requested URL equals this one
    // as a plain string, so the value stays unencoded: ":" and "/" are legal
    // in a query and the WebView leaves them untouched, whereas a
    // percent-encoded form would depend on how the URL gets normalised.
    errorPath: `fallback.html?to=${settings.serverUrl}`,
  },
  // android.webContentsDebuggingEnabled is left unset on purpose: Capacitor
  // enables chrome://inspect for debuggable builds only, which is what we want
  // for every variant.
  plugins: {
    // Not read by any plugin: app/build.gradle names the APK after it
    // (ohmywind-<variant>-debug.apk), so dev and local builds are told apart.
    ShellInfo: {
      variant,
    },
    SystemBars: {
      // The site sets viewport-fit=cover and pads itself with
      // env(safe-area-inset-*). "native" leaves that to the page on WebView
      // 140+ and pads the WebView on older ones, without injecting extra CSS
      // variables the site does not read.
      insetsHandling: "native",
      initialViewportFitValueHint: "cover",
      // Follows the system light or dark mode, like the site's own default.
      style: "DEFAULT",
    },
  },
};

export default config;
