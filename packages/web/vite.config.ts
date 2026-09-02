import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      output: {
        // MapLibre GL (the basemap renderer) is bigger than the rest of the
        // app put together, and it changes only when we bump the dependency.
        // Left in the entry chunk it blew past workbox's 2 MiB per-file
        // precache limit and, worse, made every app deploy re-download it.
        // Its own chunk keeps the hash stable across our releases, so a
        // returning user pays for it once.
        advancedChunks: {
          groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl[\\/]/ }],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Silent auto-update: the SW takes over on next load, no update-toast UI.
      registerType: 'autoUpdate',
      // Registration is wired manually in src/main.tsx via 'virtual:pwa-register'.
      injectRegister: false,
      // The manifest is owned by public/manifest.json (linked from index.html).
      // Keeping it there avoids conflicts with the parallel rebrand branch and
      // keeps a single source of truth for install metadata.
      manifest: false,
      workbox: {
        // Take over without waiting for every tab to close. `autoUpdate` alone
        // is not enough here: vite-plugin-pwa only forces these two when
        // `injectRegister` is 'auto' or left out, and we register the worker
        // ourselves. Without them a freshly deployed worker installs, then
        // sits in 'waiting' for as long as one tab controlled by the old one
        // survives, which on a phone is forever: the app stayed pinned to the
        // previously precached shell, refresh after refresh.
        skipWaiting: true,
        clientsClaim: true,
        // Precache the built app shell. These globs cover the hashed JS/CSS/HTML
        // plus icons and fonts emitted into dist/. ``mjs`` is there for
        // MapLibre's tile worker, which ships as its own module file.
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
        // Ce qui n'appartient qu'aux pages de documentation reste en ligne:
        // les polices KaTeX, la carte de couverture et les diagrammes de
        // polaires ne servent qu'a /methodologie, chargee a la demande. Les
        // precacher coutait ~330 KB de reseau a la premiere visite et autant
        // de stockage, pour des pages que la plupart des visiteurs n'ouvrent
        // jamais et qui n'ont pas besoin de fonctionner hors ligne.
        globIgnores: ['**/KaTeX_*', 'methodologie/**', 'polars/**'],
        // Drop stale precaches when a new SW activates.
        cleanupOutdatedCaches: true,
        // SPA fallback so deep links (/plan, /config, ...) resolve offline.
        navigateFallback: '/index.html',
        // No runtimeCaching on purpose: Leaflet map tiles and the Open-Meteo /
        // MCP APIs must always hit the network (fresh marine data, avoid a fat
        // opaque cache). Only the static app shell is cached for offline res.
      },
      devOptions: {
        // Keep `npm run dev` free of the service worker.
        enabled: false,
      },
    }),
  ],
})
